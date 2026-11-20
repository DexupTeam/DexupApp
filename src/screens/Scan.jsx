import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CameraOff, ImageUp, Keyboard, Layers, ScanLine, SwitchCamera, X } from 'lucide-react';
import { useCollection } from '../store/collection';
import { loadFullCard, loadSetCards, searchCards, setIdOf } from '../lib/tcg';
import { isExtraCard } from '../lib/extraCards';
import { isCardNumber, sourceRect } from '../lib/scan';
import { recognize, warmRecognizer } from '../lib/vision/recognizer';
import { getCached, setCached } from '../utils/cache';
import { resolveSearchTerm } from '../utils/pokemonNames';
import { useAutoCapture } from '../lib/useAutoCapture';
import { CardsView } from '../components/cards';
import { SearchField, Sheet, plural } from '../components/ui';

const BARCODE_OK = typeof window !== 'undefined' && 'BarcodeDetector' in window;
// Les codes-barres n'ont pas besoin de 60 lectures par seconde : 4 suffisent et libèrent le processeur pour l'OCR.
const BARCODE_INTERVAL_MS = 250;
// Reconnaissances automatiques sans carte d'affilée avant d'afficher un conseil et d'attendre que la carte bouge.
const AUTO_MAX_FAILURES = 6;
// Pause entre deux essais automatiques sans résultat : sans carte (un visage, un bureau),
// la reconnaissance ne tourne pas en continu.
const AUTO_RETRY_DELAY_MS = 250;
// Réponse hésitante (plusieurs cartes proches) : images supplémentaires avant de proposer la liste.
const CHOICE_ATTEMPTS = 2;
// Cartes proposées quand la reconnaissance hésite : celles à moins de cet écart de la première.
const CHOICE_SPREAD = 0.08;
// Image envoyée à la reconnaissance : grand côté plafonné (au-delà, le calcul coûte sans rien apporter).
const CAPTURE_MAX_SIDE = 1280;

/** Fiche d'une carte par son identifiant, depuis le cache local quand on l'a déjà vue. */
async function cardById(id) {
  // Carte japonaise ou chinoise : dans les fichiers de son extension.
  if (isExtraCard(id)) return (await loadSetCards(setIdOf(id))).find((c) => c.id === id) ?? null;
  const key = `fullcard:${id}`;
  const cached = await getCached(key);
  if (cached) return cached;
  const card = await loadFullCard(id);
  if (card) setCached(key, card);
  return card;
}

/**
 * Image de tout ce que montre l'écran (la carte peut être n'importe où, pas seulement dans le
 * cadre), et position du cadre dans cette image : il sert de repli si la carte n'est pas détectée.
 */
async function captureView(video, frameEl) {
  const view = sourceRect(video, video);
  const frame = sourceRect(video, frameEl);
  if (!view || !frame) return null;
  const scale = Math.min(1, CAPTURE_MAX_SIDE / Math.max(view.width, view.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(view.width * scale);
  canvas.height = Math.round(view.height * scale);
  canvas.getContext('2d').drawImage(video, view.x, view.y, view.width, view.height, 0, 0, canvas.width, canvas.height);
  return {
    bitmap: await createImageBitmap(canvas),
    guide: {
      x: (frame.x - view.x) * scale, y: (frame.y - view.y) * scale,
      width: frame.width * scale, height: frame.height * scale,
    },
  };
}

/** Image d'une photo choisie : le cadre de repli est le plus grand rectangle de carte centré. */
async function captureFile(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, CAPTURE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const ratio = 63 / 88;
  const height = Math.min(canvas.height, canvas.width / ratio);
  const width = height * ratio;
  return {
    bitmap: await createImageBitmap(canvas),
    guide: { x: (canvas.width - width) / 2, y: (canvas.height - height) / 2, width, height },
  };
}

// Résultats déjà obtenus pendant la session : rescanner la même carte ne refait pas d'appel réseau.
const searchCache = new Map();
async function cachedSearch(key, fetcher) {
  if (searchCache.has(key)) return searchCache.get(key);
  const cards = await fetcher();
  if (searchCache.size > 100) searchCache.delete(searchCache.keys().next().value);
  searchCache.set(key, cards);
  return cards;
}

const CORNERS = [
  { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 16 },
  { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 16 },
  { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 16 },
  { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 16 },
];

export default function Scan() {
  const navigate = useNavigate();
  const { openCard, activeCard } = useCollection();
  const videoRef = useRef(null);
  const frameRef = useRef(null);
  const autoFailures = useRef(0);
  const streamRef = useRef(null);
  const startId = useRef(0);
  const lastScan = useRef({ code: null, at: 0 });

  const [cam, setCam] = useState('starting'); // starting | active | denied | unsupported
  const [facing, setFacing] = useState('environment');
  // Reconnaissance : idle | loading (premier chargement du moteur) | running | error (moteur indisponible)
  const [ocr, setOcr] = useState('idle');
  const [engine, setEngine] = useState('loading'); // loading | ready | error
  const [message, setMessage] = useState(null);
  const [input, setInput] = useState('');
  const [results, setResults] = useState({ query: '', cards: [] });
  const [searching, setSearching] = useState(false);
  const [sheet, setSheet] = useState(null); // null | 'results' | 'manual'

  // Une carte précise a été reconnue : on ouvre directement sa fiche.
  const openFound = useCallback((card, query) => {
    navigator.vibrate?.(30);
    setResults({ query, cards: [card] });
    setMessage(null);
    openCard(card);
  }, [openCard]);

  // Recherche saisie à la main ou lue dans un code-barres : un numéro (« 025/193 ») ou un nom
  // (traduit du français vers l'anglais).
  const runSearch = useCallback(async (raw) => {
    const q = raw.trim();
    if (!q) return;
    setSearching(true);
    setMessage(`Recherche de « ${q} »…`);
    try {
      let cards;
      if (isCardNumber(q)) {
        // « 001/165 » : numéro sans zéros de tête + taille du set, ce qui isole presque toujours la bonne carte.
        const [num, total] = q.split('/').map((n) => String(parseInt(n, 10)));
        cards = await cachedSearch(`n:${num}/${total ?? ''}`, async () => {
          let found = total ? (await searchCards({ number: num, printedTotal: total, pageSize: 30 })).cards : [];
          if (!found.length) found = (await searchCards({ number: num, pageSize: 30 })).cards;
          return found;
        });
      } else {
        const name = await resolveSearchTerm(q);
        cards = await cachedSearch(`q:${name.toLowerCase()}`, async () => (await searchCards({ name, pageSize: 20 })).cards);
      }
      if (cards.length) {
        navigator.vibrate?.(30);
        setResults({ query: q, cards });
        setMessage(null);
        // Une seule carte possible : on ouvre directement sa fiche.
        if (cards.length === 1) openCard(cards[0]); else setSheet('results');
      } else {
        setMessage(`Aucune carte trouvée pour « ${q} ».`);
      }
    } catch (_) {
      setMessage('Erreur réseau. Vérifie ta connexion.');
    }
    setSearching(false);
  }, [openCard]);

  const busy = ocr !== 'idle' || searching;
  const paused = cam !== 'active' || busy || sheet !== null || !!activeCard;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const readRef = useRef(null);
  const { hint: autoHint, disarm, rearm } = useAutoCapture({
    videoRef,
    frameRef,
    enabled: cam === 'active' && sheet === null && !activeCard,
    busy,
    onStable: () => { setMessage(null); readRef.current?.(true); },
  });

  // Le moteur de reconnaissance (≈ 100 Mo la première fois, en cache ensuite) se charge dès
  // l'ouverture du scanner, pendant que l'utilisateur sort sa carte.
  useEffect(() => {
    let alive = true;
    warmRecognizer().then(() => alive && setEngine('ready')).catch(() => alive && setEngine('error'));
    return () => { alive = false; };
  }, []);

  const stopStream = useCallback(() => {
    startId.current++;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async (mode) => {
    stopStream();
    const id = startId.current;
    setCam('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // 1440p : le petit numéro de collection gagne ~33 % de pixels par rapport au 1080p.
        // Les découpes sont ramenées à une taille fixe avant l'OCR : son coût ne change pas.
        video: { facingMode: mode, width: { ideal: 2560 }, height: { ideal: 1440 } },
        audio: false,
      });
      // L'écran a été quitté (ou la caméra relancée) pendant la demande d'autorisation.
      if (id !== startId.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      // Mise au point continue quand le navigateur la propose (la carte bouge, la distance aussi).
      const track = stream.getVideoTracks()[0];
      if (track?.getCapabilities?.().focusMode?.includes('continuous')) {
        track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
      }
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
      setCam('active');
    } catch (e) {
      if (id === startId.current) setCam(e?.name === 'NotAllowedError' ? 'denied' : 'unsupported');
    }
  }, [stopStream]);

  useEffect(() => {
    startCamera('environment');
    return stopStream;
  }, [startCamera, stopStream]);

  // Codes-barres / QR codes : détection continue quand le navigateur la propose.
  useEffect(() => {
    if (cam !== 'active' || !BARCODE_OK) return undefined;
    const detector = new window.BarcodeDetector({
      formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'data_matrix'],
    });
    let timer = null;
    let alive = true;
    const loop = async () => {
      if (!alive) return;
      try {
        // Rien à détecter tant qu'une lecture tourne, qu'une fiche couvre la caméra ou que l'onglet est caché.
        const paused = document.hidden || pausedRef.current;
        const code = paused ? null : (await detector.detect(videoRef.current))[0]?.rawValue;
        const now = Date.now();
        if (code && (code !== lastScan.current.code || now - lastScan.current.at > 5000)) {
          lastScan.current = { code, at: now };
          setInput(code);
          runSearch(code);
        }
      } catch (_) { /* image pas encore prête */ }
      if (alive) timer = window.setTimeout(loop, BARCODE_INTERVAL_MS);
    };
    timer = window.setTimeout(loop, BARCODE_INTERVAL_MS);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [cam, runSearch]);

  const flip = () => {
    const next = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    startCamera(next);
  };

  // Réponses hésitantes accumulées sur la carte en cours (identifiant → meilleur score),
  // remises à zéro dès qu'un résultat est affiché.
  const hesitations = useRef({ count: 0, scores: new Map() });
  const resetHesitations = () => { hesitations.current = { count: 0, scores: new Map() }; };

  // Montre les cartes possibles, les plus probables d'abord.
  const showChoices = async (scores, query) => {
    const ranked = [...scores].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
    const cards = (await Promise.all(ranked.map((id) => cardById(id).catch(() => null)))).filter(Boolean);
    if (!cards.length) { setMessage('Erreur réseau. Vérifie ta connexion.'); return; }
    if (cards.length === 1) { openFound(cards[0], cards[0].name); return; }
    navigator.vibrate?.(30);
    setResults({ query, cards });
    setMessage(null);
    setSheet('results');
  };

  // Reconnaît la carte d'une image : détection de ses bords, redressement, comparaison de son
  // image à celles de toutes les cartes connues.
  // `auto` : déclenché par l'auto-capture, donc discret en cas d'échec et nouvel essai ensuite.
  const identify = async (capture, auto) => {
    if (!capture) { if (auto) rearm(); return; }
    setOcr(engine === 'ready' ? 'running' : 'loading');
    try {
      const r = await recognize(capture.bitmap, capture.guide);
      if (r.status === 'match') {
        const card = await cardById(r.best.id);
        setOcr('idle');
        resetHesitations();
        autoFailures.current = 0;
        if (card) openFound(card, card.name); else setMessage('Erreur réseau. Vérifie ta connexion.');
        return;
      }
      if (r.status === 'choices') {
        // Plusieurs cartes proches (rééditions d'une même illustration, image moyenne) : on regarde
        // encore une image ou deux, puis on propose les meilleures.
        const h = hesitations.current;
        h.count += 1;
        for (const m of r.matches) {
          if (r.best.score - m.score <= CHOICE_SPREAD) h.scores.set(m.id, Math.max(h.scores.get(m.id) ?? 0, m.score));
        }
        if (auto && h.count < CHOICE_ATTEMPTS) {
          setOcr('idle');
          window.setTimeout(rearm, AUTO_RETRY_DELAY_MS);
          return;
        }
        const scores = h.scores;
        resetHesitations();
        autoFailures.current = 0;
        await showChoices(scores, 'Cartes possibles');
        setOcr('idle');
        return;
      }
      setOcr('idle');
      if (auto && ++autoFailures.current < AUTO_MAX_FAILURES) {
        window.setTimeout(rearm, AUTO_RETRY_DELAY_MS);
      } else {
        autoFailures.current = 0;
        setMessage('Carte non reconnue — rapproche-la, évite les reflets, ou saisis son numéro.');
      }
    } catch (_) {
      setOcr('idle');
      setMessage(engine === 'error' || !navigator.onLine
        ? 'Reconnaissance indisponible hors ligne la première fois — saisis le numéro.'
        : 'Reconnaissance indisponible — saisis le numéro à la main.');
    }
  };

  const readCard = async (auto) => {
    if (cam !== 'active' || ocr !== 'idle' || searching) return;
    if (!auto) setMessage(null);
    identify(await captureView(videoRef.current, frameRef.current), auto);
  };

  // Une photo déjà prise (galerie, capture d'écran) : même reconnaissance.
  const fileRef = useRef(null);
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || ocr !== 'idle') return;
    disarm();
    setMessage(null);
    try {
      identify(await captureFile(file), false);
    } catch (_) {
      setMessage('Image illisible.');
    }
  };

  const snap = () => {
    disarm(); // pas de lecture automatique en double juste après
    readCard(false);
  };

  readRef.current = readCard;

  const submitManual = () => {
    if (!input.trim()) return;
    setSheet(null);
    runSearch(input);
  };

  const close = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'));
  const hint = message
    ?? (ocr === 'loading' ? 'Préparation du scanner (première fois)…'
      : ocr === 'running' ? 'Reconnaissance…'
        : autoHint || 'Montre la carte à la caméra — la reconnaissance est automatique');

  return (
    <div className="scan">
      <video ref={videoRef} playsInline muted style={cam === 'active' ? undefined : { visibility: 'hidden' }} />

      <div className="scan-top">
        <button className="scan-btn" onClick={close} aria-label="Fermer le scanner"><X size={22} /></button>
        <b>Scanner</b>
        <div className="row" style={{ gap: 8 }}>
          <button className="scan-btn" onClick={() => fileRef.current?.click()} aria-label="Reconnaître une photo" disabled={busy}>
            <ImageUp size={20} />
          </button>
          <button className="scan-btn" onClick={flip} aria-label="Changer de caméra" style={cam === 'active' ? undefined : { display: 'none' }}>
            <SwitchCamera size={20} />
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      </div>

      <div className="scan-center">
        {cam === 'active' && (
          <>
            <div className="scan-frame" ref={frameRef}>
              {CORNERS.map((style, i) => <span key={i} className="scan-corner" style={style} />)}
              {!busy && <span className="scan-line" />}
            </div>
            <p className="scan-hint" role="status">{hint}</p>
          </>
        )}
        {cam === 'starting' && <div className="scan-state"><div className="spinner" style={{ borderColor: 'rgba(255,255,255,.25)', borderTopColor: '#fff' }} /><span className="small">Activation de la caméra…</span></div>}
        {(cam === 'denied' || cam === 'unsupported') && (
          <div className="scan-state">
            <CameraOff size={34} />
            <b>{cam === 'denied' ? 'Accès à la caméra refusé' : 'Caméra indisponible'}</b>
            <span className="small" style={{ opacity: 0.75 }}>
              {cam === 'denied' ? 'Autorise la caméra dans les réglages de ton navigateur, ou saisis le numéro de la carte.' : 'Tu peux quand même chercher une carte par son numéro ou son nom.'}
            </span>
            {message && <span className="small" role="status">{message}</span>}
            <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? <div className="spinner sm" /> : <ImageUp size={18} />} Reconnaître une photo
            </button>
            <button className="btn" onClick={() => setSheet('manual')}><Keyboard size={18} /> Saisir un numéro</button>
            {cam === 'denied' && <button className="link" style={{ color: '#fff' }} onClick={() => startCamera(facing)}>Réessayer</button>}
          </div>
        )}
      </div>

      <div className="scan-bottom">
        <button className="scan-side" onClick={() => setSheet('manual')}>
          <Keyboard size={22} /> Saisir
        </button>
        <button className="scan-snap" onClick={snap} disabled={cam !== 'active' || busy} aria-label="Reconnaître la carte">
          {busy ? <div className="spinner" /> : <ScanLine size={30} />}
        </button>
        <button className="scan-side" onClick={() => setSheet('results')} disabled={!results.cards.length}>
          <Layers size={22} /> {results.cards.length ? plural(results.cards.length, 'résultat') : 'Résultats'}
        </button>
      </div>

      {sheet === 'manual' && (
        <Sheet title="Chercher une carte" onClose={() => setSheet(null)}>
          <div className="stack" style={{ gap: 12 }}>
            <SearchField value={input} onChange={setInput} onSubmit={submitManual} placeholder="Numéro (025, 163/193) ou nom" autoFocus />
            <button className="btn btn-dark btn-block" disabled={!input.trim()} onClick={submitManual}>Chercher</button>
          </div>
        </Sheet>
      )}
      {sheet === 'results' && (
        <Sheet title={`${plural(results.cards.length, 'résultat')} · ${results.query}`} onClose={() => setSheet(null)} tall>
          <CardsView cards={results.cards} caption="name" dimMissing={false} />
        </Sheet>
      )}
    </div>
  );
}

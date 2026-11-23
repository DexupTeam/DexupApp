// Prix Cardmarket des cartes, via TCGdex.
//
// L'API Pokémon TCG (source des cartes) ne fournit plus de prix exploitables : rien pour les sets
// sortis depuis fin 2025, des valeurs figées à juillet 2026 pour les autres, et quelques erreurs
// grossières. TCGdex republie les prix Cardmarket chaque jour, mais une carte à la fois et sous ses
// propres identifiants : ce module fait la correspondance et garde les prix en cache local.
import { useEffect, useState } from 'react';
import { getCachedRaw, setCached } from '../utils/cache';
import { isGraded, loadSetCards, loadSets, setIdOf } from './tcg';
import { isExtraCard, setRegion } from './extraCards';

const DEX = 'https://api.tcgdex.net/v2/en';
const DAY = 24 * 60 * 60 * 1000;
export const CARD_PRICE_MAX_AGE = DAY;      // fiche d'une carte : prix du jour
export const WALLET_PRICE_MAX_AGE = 7 * DAY; // valeur de la collection : rafraîchie chaque semaine
const INDEX_MAX_AGE = 30 * DAY;              // correspondance des identifiants : ne bouge presque jamais
const RETRY_AGE = DAY / 4;                   // « pas de prix » ou set inconnu : on redemande vite, ça finit souvent par arriver
const CONCURRENCY = 6;

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
      if (attempt >= 3) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (attempt >= 3) throw e;
    }
    await new Promise((r) => setTimeout(r, 400 * attempt));
  }
}

async function cachedJson(key, maxAge, fetcher) {
  const hit = await getCachedRaw(key);
  const limit = typeof maxAge === 'function' ? maxAge(hit?.data) : maxAge;
  if (hit && Date.now() - hit.ts < limit) return hit.data;
  try {
    const data = await fetcher();
    if (data) await setCached(key, data);
    return data ?? hit?.data ?? null;
  } catch (e) {
    if (hit) return hit.data; // hors ligne : une correspondance un peu ancienne vaut mieux que rien
    throw e;
  }
}

// ─── Correspondance des identifiants (API Pokémon TCG → TCGdex) ──────────────
const plain = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
// « 001 » et « 1 » désignent la même carte ; « TG01 » et « GG01 » se comparent tels quels.
const numberKey = (n) => (/^\d+$/.test(n) ? String(parseInt(n, 10)) : n.toUpperCase());

// « sv3pt5 » s'écrit « sv03.5 » chez TCGdex, « me6 » « me06 », mais « base1 » reste « base1 » : on essaie les formes.
function idCandidates(id) {
  const m = id.match(/^([a-z]+?)(\d+)(?:pt(\d+))?([a-z]*)$/);
  if (!m) return [id];
  const [, prefix, num, point, rest] = m;
  const dot = point ? `.${point}` : '';
  return [`${prefix}${num.padStart(2, '0')}${dot}${rest}`, `${prefix}${num}${dot}${rest}`, id];
}

let dexSetsPromise = null;
function loadDexSets() {
  dexSetsPromise ||= cachedJson('dex:sets', INDEX_MAX_AGE, async () => (
    (await getJson(`${DEX}/sets`))?.map((s) => ({ id: s.id, name: s.name, total: s.cardCount?.total ?? 0 }))
  )).catch((e) => { dexSetsPromise = null; throw e; });
  return dexSetsPromise;
}

async function resolveDexSetId(setId) {
  const [dexSets, sets] = await Promise.all([loadDexSets(), loadSets().catch(() => [])]);
  if (!dexSets) return null;
  const set = sets.find((s) => s.id === setId);
  const sameName = set ? dexSets.filter((d) => plain(d.name) === plain(set.name)) : [];
  if (sameName.length === 1) return sameName[0].id;
  const byId = idCandidates(setId).find((c) => dexSets.some((d) => d.id === c));
  if (byId) return byId;
  // Plusieurs sets du même nom : celui dont le nombre de cartes est le plus proche.
  if (sameName.length) return sameName.sort((a, b) => Math.abs(a.total - set.total) - Math.abs(b.total - set.total))[0].id;
  if (!set) return null;
  // Nom abrégé d'un côté (« 30th Celebration: Classic Collection » / « 30th Classic Collection ») :
  // même nombre de cartes et tous les mots du plus court présents dans l'autre, sans ambiguïté.
  const words = plain(set.name).split(' ');
  const close = dexSets.filter((d) => {
    const other = plain(d.name).split(' ');
    const [short, long] = other.length < words.length ? [other, words] : [words, other];
    return d.total === set.total && short.length > 1 && short.every((w) => long.includes(w));
  });
  return close.length === 1 ? close[0].id : null;
}

const indexPromises = {};
/** Pour un set : { numéro de carte → identifiant TCGdex }. Vide si le set est inconnu de TCGdex. */
function loadSetIndex(setId) {
  // Un index vide = set pas encore publié chez TCGdex (nouvelle sortie) : on revérifie quelques heures plus tard.
  const maxAge = (index) => (index && Object.keys(index).length ? INDEX_MAX_AGE : RETRY_AGE);
  indexPromises[setId] ||= cachedJson(`dex:index:${setId}`, maxAge, async () => {
    const dexSetId = await resolveDexSetId(setId);
    const dexSet = dexSetId && await getJson(`${DEX}/sets/${dexSetId}`);
    return Object.fromEntries((dexSet?.cards || []).map((c) => [numberKey(c.localId), c.id]));
  }).catch((e) => { delete indexPromises[setId]; throw e; });
  return indexPromises[setId];
}

// Quelques sets (rééditions type « Classic Collection ») sont renumérotés chez TCGdex : le numéro
// désigne alors une autre carte. On le détecte en comparant les noms, et on associe par nom.
async function buildRenumbering(setId) {
  const [dexSetId, cards] = await Promise.all([resolveDexSetId(setId), loadSetCards(setId)]);
  const dexCards = (dexSetId && (await getJson(`${DEX}/sets/${dexSetId}`))?.cards) || [];
  if (!cards.length || !dexCards.length) return null;
  const byNumber = Object.fromEntries(dexCards.map((d) => [numberKey(d.localId), plain(d.name)]));
  const agreeing = cards.filter((c) => byNumber[numberKey(c.number)] === plain(c.name)).length;
  if (agreeing * 2 >= Math.min(cards.length, dexCards.length)) return { sameNumbering: true };
  const byName = {};
  for (const d of dexCards) (byName[plain(d.name)] ||= []).push(d.id);
  // Un nom porté par plusieurs cartes du set ne permet pas de trancher : ces cartes restent sans prix.
  const ids = {};
  for (const c of cards) if (byName[plain(c.name)]?.length === 1) ids[c.id] = byName[plain(c.name)][0];
  return { ids };
}

const renumberings = {};
/** Lit la renumérotation connue d'un set ; `build` la calcule (réseau) si elle ne l'a jamais été. */
function loadRenumbering(setId, build) {
  const key = `dex:names:${setId}`;
  if (build && !renumberings[setId]?.built) {
    renumberings[setId] = cachedJson(key, INDEX_MAX_AGE, () => buildRenumbering(setId)).catch(() => null);
    renumberings[setId].built = true;
  }
  renumberings[setId] ||= getCachedRaw(key).then((hit) => hit?.data ?? null);
  return renumberings[setId];
}

async function dexCardId(cardId) {
  const setId = setIdOf(cardId);
  const index = await loadSetIndex(setId);
  if (!index || !Object.keys(index).length) return null;
  const byNumber = index[numberKey(cardId.slice(setId.length + 1))] ?? null;
  // Un numéro introuvable dans un set connu est le signe d'une renumérotation : on vérifie une fois.
  const renumbering = (await loadRenumbering(setId)) ?? (byNumber ? null : await loadRenumbering(setId, true));
  return renumbering?.ids ? renumbering.ids[cardId] ?? null : byNumber;
}

/**
 * Nom français officiel d'une carte (TCGdex, qui publie les cartes en français), ou null si
 * TCGdex ne la connaît pas en français. Gardé un mois : il ne change pas.
 */
export async function frenchCardName(cardId) {
  if (isExtraCard(cardId)) return null;
  const id = await dexCardId(cardId).catch(() => null);
  if (!id) return null;
  const card = await cachedJson(`dex:fr:${id}`, (data) => (data ? INDEX_MAX_AGE : RETRY_AGE), async () => {
    const fr = await getJson(`https://api.tcgdex.net/v2/fr/cards/${id}`).catch(() => null);
    return fr?.name ? { name: fr.name } : null;
  }).catch(() => null);
  return card?.name ?? null;
}

// ─── Prix : un seul enregistrement local { identifiant de carte → prix } ─────
let store = null;
let storePromise = null;
function loadStore() {
  storePromise ||= getCachedRaw('prices').then((hit) => { store = hit?.data ?? {}; return store; });
  return storePromise;
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => setCached('prices', store), 1000);
}

const inFlight = {};
// Cartes hors API : prix tendance relevé dans le catalogue Cardmarket (extensions chinoises et japonaises),
// rien pour les cartes perso (leur valeur est le prix saisi par le collectionneur).
async function extraPrice(cardId) {
  if (!setRegion(setIdOf(cardId))) return null;
  const card = (await loadSetCards(setIdOf(cardId))).find((c) => c.id === cardId);
  return card?.marketPrice ?? null;
}

function fetchPrice(cardId) {
  inFlight[cardId] ||= (async () => {
    const extra = isExtraCard(cardId);
    const id = extra ? null : await dexCardId(cardId);
    const cm = extra ? await extraPrice(cardId) : id ? (await getJson(`${DEX}/cards/${id}`))?.pricing?.cardmarket : null;
    const entry = cm
      ? { trend: cm.trend, avg30: cm.avg30, avg7: cm.avg7, avg: cm.avg, low: cm.low, holoTrend: cm['trend-holo'], idProduct: cm.idProduct, updated: cm.updated, at: Date.now() }
      : { none: true, at: Date.now() }; // carte inconnue de TCGdex ou sans cotation : redemandée après RETRY_AGE
    (await loadStore())[cardId] = entry;
    scheduleSave();
    return entry;
  })().finally(() => { delete inFlight[cardId]; });
  return inFlight[cardId];
}

const isFresh = (entry, maxAge) => !!entry && Date.now() - entry.at < (entry.none ? Math.min(maxAge, RETRY_AGE) : maxAge);

/** Prix d'une carte, redemandé à la source s'il a plus de `maxAge`. Renvoie null si rien n'est disponible. */
export async function getPrice(cardId, maxAge = CARD_PRICE_MAX_AGE) {
  const known = (await loadStore())[cardId];
  if (isFresh(known, maxAge)) return known;
  try {
    return await fetchPrice(cardId);
  } catch (_) {
    return known ?? null; // hors ligne : dernier prix connu
  }
}

const positive = (...values) => values.find((v) => typeof v === 'number' && v > 0) ?? null;
/** Valeur retenue pour une carte : le prix tendance Cardmarket, à défaut une moyenne récente. */
export const priceValue = (entry) => (entry && !entry.none ? positive(entry.trend, entry.avg30, entry.avg7, entry.avg, entry.low) : null);

// Ce que le propriétaire a saisi passe avant le marché : la valeur d'une carte gradée, sinon le prix
// constaté dans sa langue (le prix tendance mélange toutes les langues).
const manualValue = (mine) => (isGraded(mine) && mine.value > 0 ? mine.value : null) ?? (mine?.price > 0 ? mine.price : null);

function summarize(owned, prices) {
  let value = 0;
  let priced = 0;
  let oldest = Infinity;
  const values = {}; // identifiant de carte → valeur retenue (absent = carte non évaluée)
  const ids = Object.keys(owned);
  for (const id of ids) {
    const manual = manualValue(owned[id]);
    const market = priceValue(prices[id]);
    if (manual === null && market === null) continue;
    values[id] = manual ?? market;
    value += values[id];
    priced++;
    if (manual === null) oldest = Math.min(oldest, prices[id].at);
  }
  return { value, values, priced, total: ids.length, updatedAt: Number.isFinite(oldest) ? oldest : null };
}

/**
 * Valeur de la collection. Répond tout de suite avec les prix connus, puis rafraîchit en arrière-plan
 * ceux qui manquent ou ont plus d'une semaine ; `pending` = nombre de cartes encore en cours.
 */
export function useWallet(owned) {
  const [wallet, setWallet] = useState(null); // null = premier calcul en cours
  useEffect(() => {
    let alive = true;
    (async () => {
      const prices = await loadStore();
      if (!alive) return;
      const queue = Object.keys(owned).filter((id) => !isFresh(prices[id], WALLET_PRICE_MAX_AGE));
      let pending = queue.length;
      const publish = () => { if (alive) setWallet({ ...summarize(owned, prices), pending }); };
      publish();

      let lastPublish = 0;
      const worker = async () => {
        while (alive && queue.length) {
          const id = queue.shift();
          try { await fetchPrice(id); } catch (_) { /* réseau : on réessaiera au prochain affichage */ }
          pending--;
          if (Date.now() - lastPublish > 400 || pending === 0) { lastPublish = Date.now(); publish(); }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    })();
    return () => { alive = false; };
  }, [owned]);
  return wallet;
}

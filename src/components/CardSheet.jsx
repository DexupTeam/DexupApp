import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, ChevronDown, ExternalLink, Languages, ListPlus, Plus, Star, Trophy } from './icons';
import { useCollection } from '../store/collection';
import { getCached, setCached } from '../utils/cache';
import { getGradingInfo } from '../utils/storage';
import { formatEuro, loadFullCard, openUrl } from '../lib/tcg';
import { getPrice, priceValue } from '../lib/prices';
import { useCardHistory } from '../lib/priceHistory';
import PriceChart from './PriceChart';
import { useCardName } from '../lib/cardNames';
import { cardImage, photoFromFile } from '../lib/photos';
import { CardPlaceholder } from './cards';
import { Confirm, Sheet, plural } from './ui';
import { PokeBall } from './PokeBall';

// tag : affiché sur le bouton — name : valeur stockée
const GRADING_COMPANIES = [
  { tag: 'PSA', name: 'PSA' },
  { tag: 'PCA', name: 'PCA' },
  { tag: 'CA', name: 'CA' },
  { tag: 'COL', name: 'CollectAura' },
  { tag: 'CCC', name: 'CCC' },
  { tag: 'CGC', name: 'CGC' },
  { tag: 'BEC', name: 'Beckett' },
  { tag: 'AUT', name: 'Autres' },
];

// cm : filtre de langue de Cardmarket. Les cartes japonaises y sont des produits à part, sans filtre possible.
const LANGUAGES = [
  { code: 'FR', label: 'Français', cm: 2 }, { code: 'EN', label: 'Anglais', cm: 1 }, { code: 'JP', label: 'Japonais' },
  { code: 'DE', label: 'Allemand', cm: 3 }, { code: 'ES', label: 'Espagnol', cm: 4 }, { code: 'IT', label: 'Italien', cm: 5 },
];

const cardmarketSearch = (name) => `https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${encodeURIComponent(name)}`;
/** Lien Cardmarket d'une carte : sur les offres de la langue choisie quand c'est possible. */
function cardmarketLink({ name, language, idProduct, apiUrl }) {
  if (language?.cm && idProduct) return `https://www.cardmarket.com/fr/Pokemon/Products?idProduct=${idProduct}&language=${language.cm}`;
  if (language && !language.cm) return cardmarketSearch(name);
  // Sans fiche Cardmarket connue, on renvoie vers une recherche du nom de la carte.
  return apiUrl ?? cardmarketSearch(name);
}

const RARITY = {
  'Common': ['C', ''], 'Uncommon': ['U', 'tag-sky'], 'Rare': ['R', 'tag-gold'], 'Rare Holo': ['H', 'tag-gold'],
  'Rare Holo EX': ['EX', 'tag-peach'], 'Rare Holo GX': ['GX', 'tag-peach'], 'Rare Holo V': ['V', 'tag-peach'],
  'Rare Holo VMAX': ['VMAX', 'tag-peach'], 'Rare Holo VSTAR': ['VSTAR', 'tag-peach'], 'Double Rare': ['RR', 'tag-peach'],
  'Illustration Rare': ['AR', 'tag-violet'], 'Special Illustration Rare': ['SAR', 'tag-violet'], 'Hyper Rare': ['HR', 'tag-gold'],
  'Ultra Rare': ['UR', 'tag-peach'], 'Rare Ultra': ['UR', 'tag-peach'], 'Rare Secret': ['SR', 'tag-peach'],
  'Rare Rainbow': ['RR', 'tag-violet'], 'Shiny Rare': ['S', 'tag-sky'], 'Shiny Ultra Rare': ['SSR', 'tag-violet'],
  'ACE SPEC Rare': ['ACE', 'tag-peach'], 'Trainer Gallery Rare Holo': ['TGH', 'tag-violet'], 'Rare Shining': ['S', 'tag-sky'],
  'Amazing Rare': ['A', 'tag-mint'], 'Promo': ['PR', 'tag-mint'],
};

const TYPE_COLORS = {
  Fire: '#c0392b', Water: '#2980b9', Grass: '#218c53', Lightning: '#b87900', Psychic: '#8e44ad', Fighting: '#b9480a',
  Darkness: '#2c3e50', Metal: '#66757a', Fairy: '#c2187a', Dragon: '#1a5276', Colorless: '#6b6b6b',
};

const money = (v, unit) => `${Number(v).toFixed(2)} ${unit}`;

// Courbe du prix tendance Cardmarket de la carte (toutes langues confondues).
function CardPriceChart({ price }) {
  const points = useCardHistory(price, priceValue(price));
  return <PriceChart points={points} title="Évolution du prix" />;
}

function PriceBlock({ title, unit, rows }) {
  const shown = rows.filter(([, v]) => v > 0); // 0 = pas de cotation pour cette ligne
  if (!shown.length) return null;
  return (
    <div className="card card-pad">
      <p className="dot-label" style={{ color: 'var(--ink-2)' }}>{title}</p>
      {shown.map(([label, v], i) => (
        <div className="kv" key={label}>
          <span>{label}</span>
          <b style={i === 0 ? { color: 'var(--violet-ink)', fontSize: 17 } : undefined}>{money(v, unit)}</b>
        </div>
      ))}
    </div>
  );
}

function GradingEditor({ grading, onSave, onRemove }) {
  const known = GRADING_COMPANIES.find((c) => c.tag !== 'AUT' && c.name === grading?.company);
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState(grading ? (known?.tag ?? 'AUT') : 'PSA');
  const [custom, setCustom] = useState(grading && !known ? grading.company : '');
  const [grade, setGrade] = useState(grading?.grade ?? '');
  const [value, setValue] = useState(grading?.value ? String(grading.value) : '');

  const save = () => {
    if (!grade.trim()) return;
    const name = company === 'AUT'
      ? (custom.trim() || 'Autres')
      : GRADING_COMPANIES.find((c) => c.tag === company).name;
    // Aucune source gratuite ne cote les cartes gradées : la valeur est saisie par le collectionneur.
    const amount = parseFloat(value.replace(',', '.'));
    onSave({ graded: true, company: name, grade: grade.trim(), ...(amount > 0 ? { value: amount } : {}) });
    setOpen(false);
  };

  return (
    <div className="card">
      <button className="row card-pad" style={{ width: '100%' }} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Trophy size={19} color="var(--gold)" />
        <b className="grow" style={{ textAlign: 'left' }}>
          {grading ? `Gradée ${grading.company} ${grading.grade}${grading.value ? ` · ${formatEuro(grading.value)}` : ''}` : 'Ajouter un grade'}
        </b>
        <ChevronDown size={18} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      {open && (
        <div className="stack" style={{ padding: '0 16px 16px' }}>
          <div className="grade-grid">
            {GRADING_COMPANIES.map((c) => (
              <button key={c.tag} className={company === c.tag ? 'is-active' : ''} onClick={() => setCompany(c.tag)} title={c.name}>
                {c.tag}
              </button>
            ))}
          </div>
          {company === 'AUT' && (
            <input className="input" placeholder="Nom de la société" value={custom} onChange={(e) => setCustom(e.target.value)} />
          )}
          <input
            className="input" placeholder="Note (ex : 10, 9.5, 8)" inputMode="decimal"
            value={grade} onChange={(e) => setGrade(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          />
          <input
            className="input" placeholder="Valeur estimée en € (facultatif)" inputMode="decimal" aria-describedby="graded-value-help"
            value={value} onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          />
          <p id="graded-value-help" className="tiny dim">Compte dans la valeur de ta collection à la place du prix de la carte non gradée.</p>
          <div className="row">
            {grading && <button className="btn btn-danger btn-sm" onClick={() => { onRemove(); setOpen(false); }}>Supprimer</button>}
            <button className="btn btn-dark btn-sm grow" disabled={!grade.trim()} onClick={save}>Enregistrer le grade</button>
          </div>
        </div>
      )}
    </div>
  );
}

function LanguageEditor({ language, price, linkFor, onSave }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(language?.code ?? null);
  const [value, setValue] = useState(price ? String(price) : '');
  const chosen = LANGUAGES.find((l) => l.code === code);

  const save = () => {
    const amount = parseFloat(value.replace(',', '.'));
    onSave({ lang: code, price: amount > 0 ? amount : null });
    setOpen(false);
  };

  return (
    <div className="card">
      <button className="row card-pad" style={{ width: '100%' }} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Languages size={19} />
        <b className="grow" style={{ textAlign: 'left' }}>
          {language || price
            ? [language?.label, price ? formatEuro(price) : null].filter(Boolean).join(' · ')
            : 'Langue et prix constaté'}
        </b>
        <ChevronDown size={18} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      {open && (
        <div className="stack" style={{ padding: '0 16px 16px' }}>
          <div className="grade-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }} role="group" aria-label="Langue de la carte">
            {LANGUAGES.map((l) => (
              <button key={l.code} className={code === l.code ? 'is-active' : ''} aria-pressed={code === l.code} onClick={() => setCode(code === l.code ? null : l.code)}>
                {l.label}
              </button>
            ))}
          </div>
          {chosen && (
            <button className="btn btn-ghost btn-sm" onClick={() => openUrl(linkFor(chosen))}>
              {chosen.cm ? `Offres en ${chosen.label.toLowerCase()}` : 'Chercher la version japonaise'} <ExternalLink size={15} />
            </button>
          )}
          <input
            className="input" placeholder="Prix constaté en € (facultatif)" inputMode="decimal" aria-describedby="lang-price-help"
            value={value} onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          />
          <p id="lang-price-help" className="tiny dim">
            Le prix tendance mélange toutes les langues. Saisis celui que tu constates pour ta version : il comptera à sa place dans la valeur de ta collection.
          </p>
          <button className="btn btn-dark btn-sm" onClick={save}>Enregistrer</button>
        </div>
      )}
    </div>
  );
}

export function ListPickerSheet({ card, onClose }) {
  const { lists, addToList, removeFromList, createList } = useCollection();
  const [name, setName] = useState('');
  const sorted = Object.values(lists).sort((a, b) => b.createdAt - a.createdAt);

  const create = async () => {
    const n = name.trim();
    if (!n) return;
    setName('');
    const all = await createList(n, 'poke');
    const created = Object.values(all || {}).sort((a, b) => b.createdAt - a.createdAt)[0];
    if (created) addToList(created.id, card);
  };

  return (
    <Sheet title="Ajouter à une liste" onClose={onClose} level={1}>
      <p className="small muted clamp1" style={{ marginBottom: 12 }}>{card.name}{card.set?.name ? ` — ${card.set.name}` : ''}</p>
      <div className="stack">
        {sorted.length === 0 && <p className="small dim">Aucune liste pour l'instant — crée ta première juste en dessous.</p>}
        {sorted.map((list) => {
          const inList = !!list.cards?.[card.id];
          return (
            <button
              key={list.id} className="list-row" aria-pressed={inList}
              onClick={() => (inList ? removeFromList(list.id, card.id) : addToList(list.id, card))}
            >
              <PokeBall id={list.icon} size={34} />
              <span className="grow">
                <b className="clamp1" style={{ display: 'block' }}>{list.name}</b>
                <span className="small muted">{plural(Object.keys(list.cards || {}).length, 'carte')}</span>
              </span>
              <span className={`check${inList ? ' is-on' : ''}`}>{inList && <Check size={15} strokeWidth={3} />}</span>
            </button>
          );
        })}
        <div className="row" style={{ marginTop: 6 }}>
          <input
            className="input grow" placeholder="Nouvelle liste…" value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
          />
          <button className="btn btn-dark" disabled={!name.trim()} onClick={create}><Plus size={18} /> Créer</button>
        </div>
      </div>
    </Sheet>
  );
}

function CardSheetInner({ card }) {
  const {
    owned, favCards, lists, cardPhotos, closeCard, toggleOwned, toggleFavCard, setGrading, setCardPhoto, deleteCustomCard,
  } = useCollection();
  const photoInput = useRef(null);
  const [photoError, setPhotoError] = useState(null);
  const [full, setFull] = useState(null);
  const [price, setPrice] = useState(undefined); // undefined = chargement, null = aucune cotation
  const [picker, setPicker] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const key = `fullcard:${card.id}`;
      try {
        let data = await getCached(key);
        if (!data) {
          data = await loadFullCard(card.id);
          if (data) await setCached(key, data);
        }
        if (alive && data) setFull(data);
      } catch (_) { /* hors ligne : on affiche ce qu'on a */ }
    })();
    getPrice(card.id).then((p) => { if (alive) setPrice(p && !p.none ? p : null); });
    return () => { alive = false; };
  }, [card.id]);

  const c = full || card;
  // Nom en français si c'est la langue choisie ; le nom anglais reste en petit (recherches, Cardmarket).
  const { name: displayName, original: englishName } = useCardName(c);
  const isOwned = !!owned[card.id];
  const isFav = !!favCards[card.id];
  const grading = getGradingInfo(owned[card.id]);
  // Langue et prix constaté vivent dans la même fiche que le grade : chaque modification conserve les autres champs.
  const mine = owned[card.id] && typeof owned[card.id] === 'object' ? owned[card.id] : {};
  const language = LANGUAGES.find((l) => l.code === mine.lang);
  const myPrice = mine.price > 0 ? mine.price : null;
  const kept = { ...(mine.lang ? { lang: mine.lang } : {}), ...(myPrice ? { price: myPrice } : {}) };
  const saveLanguage = ({ lang, price: amount }) => {
    const { lang: _lang, price: _price, ...rest } = mine;
    setGrading(card.id, { graded: false, ...rest, ...(lang ? { lang } : {}), ...(amount ? { price: amount } : {}) });
  };
  const inLists = Object.values(lists).filter((l) => l.cards?.[card.id]).length;
  const rarity = RARITY[c.rarity];

  const linkFor = (lang) => cardmarketLink({ name: c.name, language: lang, idProduct: price?.idProduct, apiUrl: c.cardmarket?.url });
  const hasDetails = !!grading || !!language || !!myPrice;
  const isCustom = c.extra === 'custom';
  const myPhoto = cardPhotos[card.id];
  const image = cardImage(c, cardPhotos, 'large');

  // Une carte perso n'existe que dans la collection : la retirer, c'est la supprimer.
  const onOwnedClick = () => (isCustom || hasDetails ? setConfirmRemove(true) : toggleOwned(card.id));

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError(null);
    try {
      setCardPhoto(card.id, await photoFromFile(file));
    } catch (_) {
      setPhotoError('Image illisible.');
    }
  };

  return (
    <>
      <Sheet
        title={displayName} onClose={closeCard} tall
        footer={
          <>
            <button className={`btn grow ${isOwned ? 'btn-owned' : 'btn-violet'}`} onClick={onOwnedClick} aria-pressed={isOwned}>
              {isOwned ? <><Check size={19} strokeWidth={3} /> Dans ma collection</> : <><Plus size={19} /> Ajouter à ma collection</>}
            </button>
            <button
              className={`icon-btn${isFav ? ' is-on' : ''}`} style={{ width: 48, height: 48 }}
              aria-pressed={isFav} aria-label={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              onClick={() => toggleFavCard(c)}
            >
              <Star size={21} fill={isFav ? 'currentColor' : 'none'} />
            </button>
            <button
              className={`icon-btn${inLists ? ' is-violet' : ''}`} style={{ width: 48, height: 48 }}
              aria-label="Ajouter à une liste" onClick={() => setPicker(true)}
            >
              <ListPlus size={21} />
            </button>
          </>
        }
      >
        {image
          ? <img className="cs-image" src={image} alt={displayName} />
          : <span className="cs-ph"><CardPlaceholder card={c} /></span>}

        {(isOwned || isCustom) && (
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginBottom: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => photoInput.current?.click()}>
              <Camera size={15} /> {myPhoto ? 'Changer ma photo' : 'Ajouter ma photo'}
            </button>
            {myPhoto && <button className="btn btn-ghost btn-sm" onClick={() => setCardPhoto(card.id, null)}>Retirer</button>}
            <input ref={photoInput} type="file" accept="image/*" hidden onChange={onPhoto} />
          </div>
        )}
        {photoError && <p className="small" style={{ textAlign: 'center', color: 'var(--danger)' }}>{photoError}</p>}

        {englishName && <p className="tiny dim" style={{ textAlign: 'center', marginBottom: 2 }}>{englishName} en anglais</p>}
        {c.set && (
          <p className="small muted" style={{ textAlign: 'center' }}>
            {isCustom ? (c.set.label || 'Carte perso') : <>{c.set.name}{c.set.series ? ` · ${c.set.series}` : ''}</>}
          </p>
        )}
        {c.detail && image && <p className="small" style={{ textAlign: 'center', marginTop: 4 }}>{c.detail}</p>}
        <div className="cs-chips">
          {c.number && <span className="tag">#{c.number}{full?.set?.printedTotal ? ` / ${full.set.printedTotal}` : ''}</span>}
          {c.set?.id && !isCustom && <span className="tag tag-violet">{(c.set.code || c.set.id).toUpperCase()}</span>}
          {isCustom && <span className="tag tag-violet">Carte perso</span>}
          {c.rarity && <span className={`tag ${rarity?.[1] ?? ''}`} title={c.rarity}>{rarity ? `${rarity[0]} · ` : ''}{c.rarity}</span>}
          {c.supertype && <span className="tag">{c.supertype}</span>}
          {c.types?.map((t) => (
            <span key={t} className="tag type-chip" style={{ background: TYPE_COLORS[t] ?? '#666' }}>{t}</span>
          ))}
        </div>
        {c.artist && <p className="tiny dim" style={{ textAlign: 'center', marginTop: 8 }}>Illustration : {c.artist}</p>}

        <div className="stack" style={{ marginTop: 18 }}>
          {isOwned && (
            <GradingEditor
              key={grading ? `${grading.company}-${grading.grade}-${grading.value ?? ''}` : 'none'}
              grading={grading}
              onSave={(g) => setGrading(card.id, { ...g, ...kept })}
              onRemove={() => setGrading(card.id, { graded: false, ...kept })}
            />
          )}
          {isOwned && (
            <LanguageEditor
              key={`${mine.lang ?? ''}-${myPrice ?? ''}`}
              language={language} price={myPrice} linkFor={linkFor} onSave={saveLanguage}
            />
          )}

          {price === undefined ? (
            <div className="card card-pad row"><div className="spinner sm" /><span className="small muted">Chargement des prix…</span></div>
          ) : price || myPrice ? (
            <PriceBlock
              title={price ? `Cardmarket${price.updated ? ` · relevé du ${new Date(price.updated).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''}` : 'Prix'}
              unit="€"
              rows={[
                [`Ton prix${language ? ` (${language.code})` : ''}`, myPrice],
                [language ? 'Tendance toutes langues' : 'Tendance', price?.trend], ['Moyenne 30 j', price?.avg30], ['Moyenne 7 j', price?.avg7], ['Prix bas', price?.low],
                ['Tendance reverse / holo', price?.holoTrend],
              ]}
            />
          ) : (
            <p className="small dim" style={{ textAlign: 'center' }}>Prix non disponible pour cette carte.</p>
          )}
          {price && <CardPriceChart price={price} />}

          <button className="btn btn-ghost btn-block" onClick={() => openUrl(linkFor(language))}>
            {language?.cm && price?.idProduct
              ? `Offres en ${language.label.toLowerCase()} sur Cardmarket`
              : c.cardmarket?.url && !language ? 'Voir sur Cardmarket' : 'Chercher sur Cardmarket'} <ExternalLink size={16} />
          </button>
        </div>
      </Sheet>

      {picker && <ListPickerSheet card={c} onClose={() => setPicker(false)} />}
      {confirmRemove && (isCustom ? (
        <Confirm
          title="Supprimer cette carte perso ?"
          message={`${c.name} sera retirée de ta collection et de tes listes, avec sa photo et son prix. Cette suppression est définitive.`}
          confirmLabel="Supprimer"
          onConfirm={() => { closeCard(); deleteCustomCard(card.id); }}
          onClose={() => setConfirmRemove(false)}
        />
      ) : (
        <Confirm
          title="Retirer de la collection ?"
          message={grading
            ? `${c.name} est gradée ${grading.company} ${grading.grade}. La retirer supprimera aussi son grade.`
            : `La retirer supprimera aussi la langue et le prix que tu as enregistrés pour ${c.name}.`}
          confirmLabel="Retirer"
          onConfirm={() => toggleOwned(card.id)}
          onClose={() => setConfirmRemove(false)}
        />
      ))}
    </>
  );
}

export default function CardSheet() {
  const { activeCard } = useCollection();
  if (!activeCard) return null;
  return <CardSheetInner key={activeCard.id} card={activeCard} />;
}

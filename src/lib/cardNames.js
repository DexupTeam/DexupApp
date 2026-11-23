// Nom d'une carte dans la langue choisie (réglage « Langue des extensions »), partout dans l'app.
// Les cartes sont stockées sous leur nom anglais ; en français on affiche le nom officiel de
// TCGdex (une requête par set, gardée un mois), sinon au moins le nom du Pokémon traduit
// (« Charizard ex » → « Dracaufeu ex », cartes japonaises et chinoises comprises).
import { useEffect, useState } from 'react';
import { useLang } from '../utils/LanguageContext.jsx';
import { getFrToEnMap } from '../utils/pokemonNames';
import { frenchSetNames } from './prices';
import { setIdOf } from './tcg';
import { isExtraCard } from './extraCards';

const plain = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
const numberKey = (n) => (/^\d+$/.test(n) ? String(parseInt(n, 10)) : String(n).toUpperCase());
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Nom du Pokémon traduit ───────────────────────────────────────────────────
let speciesPairs = null; // [[regex du nom anglais, nom français]], les plus longs d'abord
let speciesPromise = null;
function loadSpecies() {
  speciesPromise ||= getFrToEnMap().then((map) => {
    const capital = (s) => s.replace(/(^|[\s.-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
    speciesPairs = Object.entries(map)
      .map(([fr, en]) => [en, capital(fr)])
      .sort((a, b) => b[0].length - a[0].length)
      .map(([en, fr]) => [en, new RegExp(`(^|[^\\p{L}])${escape(en)}(?=$|[^\\p{L}])`, 'iu'), fr]);
    return speciesPairs;
  }).catch(() => { speciesPromise = null; return null; });
  return speciesPromise;
}
const translated = new Map(); // nom anglais → nom avec le Pokémon traduit
function translateSpecies(name) {
  if (translated.has(name)) return translated.get(name);
  if (!speciesPairs) return null;
  const lower = name.toLowerCase();
  let out = name;
  for (const [en, re, fr] of speciesPairs) {
    if (lower.includes(en) && re.test(name)) { out = name.replace(re, (_, before) => before + fr); break; }
  }
  translated.set(name, out);
  return out;
}

// ── Noms officiels par set ───────────────────────────────────────────────────
const setTables = new Map(); // setId → table une fois chargée (null : pas de table)
const setPromises = new Map();
function loadSetTable(setId) {
  if (!setPromises.has(setId)) {
    setPromises.set(setId, frenchSetNames(setId).catch(() => null).then((t) => { setTables.set(setId, t); return t; }));
  }
  return setPromises.get(setId);
}

/** Nom français déjà connu (sans attendre), ou undefined s'il faut encore charger. */
function frenchNow(card) {
  const name = card.name || '';
  const extra = card.extra || isExtraCard(card.id);
  if (!extra) {
    const setId = setIdOf(card.id);
    if (!setTables.has(setId)) return undefined;
    const entry = setTables.get(setId)?.[numberKey(card.number ?? card.id.slice(setId.length + 1))];
    if (entry && plain(entry[0]) === plain(name)) return entry[1];
  }
  return speciesPairs ? translateSpecies(name) : undefined;
}

/** `{ name, original }` : le nom à afficher, et le nom anglais quand il est différent. */
export function useCardName(card) {
  const { lang } = useLang();
  const english = card?.name ?? '';
  const active = lang === 'fr' && !!card?.id && card.extra !== 'custom';
  const [, setTick] = useState(0);
  const now = active ? frenchNow(card) : english;

  useEffect(() => {
    if (!active || now !== undefined) return undefined;
    let alive = true;
    const waits = [loadSpecies()];
    if (!(card.extra || isExtraCard(card.id))) waits.push(loadSetTable(setIdOf(card.id)));
    Promise.all(waits).then(() => alive && setTick((n) => n + 1));
    return () => { alive = false; };
  }, [active, now, card?.id, card?.extra]);

  const name = now || english;
  return { name, original: name !== english ? english : null };
}

/** Le nom d'une carte, à placer dans du texte : <CardName card={card} />. */
export function CardName({ card }) {
  return useCardName(card).name;
}

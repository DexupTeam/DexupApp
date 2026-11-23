// Nom d'une carte dans la langue choisie (réglage « Langue des extensions »). Les cartes sont
// stockées sous leur nom anglais ; en français, on affiche le nom officiel de TCGdex, sinon au
// moins le nom du Pokémon traduit (« Charizard ex » → « Dracaufeu ex »).
import { useEffect, useState } from 'react';
import { useLang } from '../utils/LanguageContext.jsx';
import { getFrToEnMap } from '../utils/pokemonNames';
import { frenchCardName } from './prices';

let enToFr = null; // [[nom anglais en minuscules, nom français], …], les plus longs d'abord
async function loadEnToFr() {
  if (!enToFr) {
    const map = await getFrToEnMap();
    const capital = (s) => s.replace(/(^|[\s.-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
    enToFr = Object.entries(map).map(([fr, en]) => [en, capital(fr)]).sort((a, b) => b[0].length - a[0].length);
  }
  return enToFr;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Le nom du Pokémon traduit dans le nom anglais de la carte, ou le nom tel quel. */
async function translateSpecies(name) {
  const pairs = await loadEnToFr();
  const lower = name.toLowerCase();
  for (const [en, fr] of pairs) {
    if (!lower.includes(en)) continue;
    const re = new RegExp(`(^|[^\\p{L}])${escape(en)}(?=$|[^\\p{L}])`, 'iu');
    if (re.test(name)) return name.replace(re, (_, before) => before + fr);
  }
  return name;
}

/** `{ name, original }` : le nom à afficher, et le nom anglais quand il est différent. */
export function useCardName(card) {
  const { lang } = useLang();
  const english = card?.name ?? '';
  const [french, setFrench] = useState(null);

  useEffect(() => {
    setFrench(null);
    if (lang !== 'fr' || !card?.id || card.extra === 'custom') return undefined;
    let alive = true;
    translateSpecies(english).then((n) => alive && setFrench((cur) => cur ?? n)).catch(() => {});
    frenchCardName(card.id).then((n) => alive && n && setFrench(n)).catch(() => {});
    return () => { alive = false; };
  }, [lang, card?.id, card?.extra, english]);

  const name = lang === 'fr' && french ? french : english;
  return { name, original: name !== english ? english : null };
}

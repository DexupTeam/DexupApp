// Cartes absentes de l'API Pokémon TCG (qui ne connaît que les cartes anglaises) :
//   - extensions exclusives à la Chine, d'après le catalogue Cardmarket (scripts/update-china-sets.mjs) :
//     nom, attaques et prix ; numéro et image d'après CardCorpus (CC BY 4.0) quand il connaît la carte ;
//   - extensions japonaises, d'après CardCorpus (scripts/update-japan-sets.mjs) : cartes, numéros,
//     images, et prix Cardmarket relié par l'identifiant produit ;
//   - cartes perso, saisies par le collectionneur (nom, extension, numéro, sa photo).
// Elles ont la même forme que les cartes de l'API, pour passer partout dans l'app.
import CHINA_SETS from '../data/chinaSets.json';
import JAPAN_SETS from '../data/japanSets.json';

export const CHINA_SERIES = 'Exclusivités Chine';
export const JAPAN_SERIES = 'Japon';
export const CUSTOM_SET_ID = 'custom';

export const isChinaSet = (setId) => /^cn\d+$/.test(setId);
export const isJapanSet = (setId) => /^ja_\w+$/.test(setId);
/** Région d'une extension hors API : 'cn', 'ja', ou null pour les extensions anglaises. */
export const setRegion = (setId) => (isChinaSet(setId) ? 'cn' : isJapanSet(setId) ? 'ja' : null);
export const isCustomSet = (setId) => setId === CUSTOM_SET_ID;
/** Carte sans fiche dans l'API (pas de détail à télécharger, prix fourni autrement). */
export const isExtraCard = (cardId) => /^(cn\d+|ja_\w+|custom)-/.test(cardId);

export const cardmarketProductUrl = (idProduct) => `https://www.cardmarket.com/fr/Pokemon/Products?idProduct=${idProduct}`;

/** Image hébergée par CardCorpus (CC BY 4.0), en AVIF à la largeur demandée (240, 480 ou 960). */
export const cardcorpusImage = (id, width) => `https://img.cardcorpus.com/s1/${width}/${id}.avif`;
export const CARDCORPUS_URL = 'https://github.com/cardcorpus/pokemon-card-dataset';

/** Extensions chinoises, au format des extensions de l'API. */
export const chinaSets = CHINA_SETS.map((s) => ({
  id: s.id,
  code: s.code,
  name: s.name,
  series: CHINA_SERIES,
  total: s.total,
  printedTotal: s.total,
  releaseDate: s.releaseDate,
  images: s.logo ? { logo: cardcorpusImage(s.logo, 480) } : {},
  region: 'cn',
}));

/** Extensions japonaises, au format des extensions de l'API (série « Japon · <ère> »). */
export const japanSets = JAPAN_SETS.map((s) => ({
  id: s.id,
  code: s.code,
  name: s.name,
  series: s.era ? `${JAPAN_SERIES} · ${s.era}` : JAPAN_SERIES,
  total: s.total,
  printedTotal: s.printedTotal,
  releaseDate: s.releaseDate,
  images: s.logo ? { logo: cardcorpusImage(s.logo, 480) } : {},
  region: 'ja',
}));
const extraSetById = new Map([...chinaSets, ...japanSets].map((s) => [s.id, s]));

const extraCache = new Map();
/** Cartes d'une extension chinoise ou japonaise (fichier statique du site, mis à jour chaque semaine). */
export function loadRegionCards(setId) {
  if (!extraCache.has(setId)) {
    const set = extraSetById.get(setId);
    const region = setRegion(setId);
    extraCache.set(setId, (async () => {
      const res = await fetch(`/extra/${region}/${setId}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { updated, cards } = await res.json();
      const list = cards.map((c) => ({
        id: c.id,
        name: c.name,
        number: c.number ?? '',
        detail: c.detail ?? null,
        rarity: c.rarity ?? null,
        set: { id: setId, name: set?.name ?? setId, series: set?.series, code: set?.code, releaseDate: set?.releaseDate },
        images: c.image ? { small: cardcorpusImage(c.image, 480), large: cardcorpusImage(c.image, 960) } : {},
        ...(c.idProduct ? { cardmarket: { url: cardmarketProductUrl(c.idProduct) } } : {}),
        marketPrice: c.price == null ? null : { trend: c.price, updated },
        extra: region,
      }));
      // Dans l'ordre des numéros, les cartes sans numéro (pas encore chez CardCorpus) à la fin.
      const byNumber = (a, b) => parseInt(a.number, 10) - parseInt(b.number, 10) || a.number.localeCompare(b.number);
      return [...list.filter((c) => c.number).sort(byNumber), ...list.filter((c) => !c.number)];
    })().catch((e) => { extraCache.delete(setId); throw e; }));
  }
  return extraCache.get(setId);
}

// Cartes perso : tenues par le store de la collection, qui les publie ici à chaque changement.
let customCards = {};
export function setCustomCards(cards) { customCards = cards || {}; }
export const getCustomCards = () => Object.values(customCards);

export function newCustomCard({ name, setName, number, lang }) {
  return {
    id: `${CUSTOM_SET_ID}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim(),
    number: (number || '').trim(),
    rarity: null,
    set: { id: CUSTOM_SET_ID, name: 'Cartes perso', series: 'Cartes perso', label: (setName || '').trim() || null },
    images: {},
    lang: lang || null,
    extra: 'custom',
    createdAt: Date.now(),
  };
}

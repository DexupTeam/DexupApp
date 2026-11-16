// Outils communs aux scripts de produits : catalogue et relevé de prix publics de Cardmarket.
const BASE = 'https://downloads.s3.cardmarket.com/productCatalog';

export async function download(path) {
  const res = await fetch(`${BASE}/${path}`, { headers: { 'User-Agent': 'Dexup/1.0 (product catalogue)' } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/** Produits scellés Pokémon référencés par Cardmarket (nom, catégorie, identifiant). */
export const loadCatalog = async () => (await download('productList/products_nonsingles_6.json')).products;

// Produits dont le nom Cardmarket ne se déduit pas du nom du set : identifiant(s) Cardmarket.
// Plusieurs identifiants = plusieurs versions du même produit, on retient la moins chère.
export const OVERRIDES = {
  'sv1-deck-koraidon': [773881], // Deluxe Battle Deck: Koraidon ex
  'sv1-deck-miraidon': [773882], // Deluxe Battle Deck: Miraidon ex
};

export const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

// Le prix tendance est la référence ; quand il s'écarte fortement de la moyenne (cotation faussée par
// une vente isolée), on lui préfère la moyenne.
export function robustPrice(guide) {
  if (!guide) return null;
  const { trend, avg } = guide;
  if (!(trend > 0)) return avg > 0 ? avg : null;
  if (avg > 0 && (trend > avg * 3 || trend < avg / 3)) return avg;
  return trend;
}

export const KIND = {
  booster: { category: 'Pokémon Booster', suffix: 'booster' },
  display: { category: 'Pokémon Display', suffix: 'booster box' },
  etb: { category: 'Pokémon Elite Trainer Boxes', suffix: 'elite trainer box' },
};
// Variantes qui ne sont pas le produit standard.
const EXCLUDED = /\b(case|empty|pokemon center|plus|sleeved|jp|chinese|korean|indonesian|thai|bundle)\b/;

export const isStandard = (c, product) => Number(norm(c.name) === `${norm(product.setName)} ${KIND[product.type]?.suffix}`);

export function candidates(product, catalog) {
  if (OVERRIDES[product.id]) return catalog.filter((c) => OVERRIDES[product.id].includes(c.idProduct));
  const kind = KIND[product.type];
  if (!kind) return [];
  const set = norm(product.setName);
  return catalog.filter((c) => {
    if (c.categoryName !== kind.category) return false;
    const name = norm(c.name);
    if (!name.startsWith(`${set} `) || EXCLUDED.test(name)) return false;
    // Ce qui suit le nom du set : le type de produit, précédé ou suivi d'une variante
    // (« Koraidon Elite Trainer Box », « Booster Box (18 Boosters) », « Elite Trainer Box (Zacian) »).
    const rest = name.slice(set.length + 1);
    if (!rest.includes(kind.suffix)) return false;
    // « Booster » ne doit pas attraper « Booster Box ».
    return product.type !== 'booster' || rest === 'booster';
  });
}

// Met à jour les prix des produits scellés à partir du relevé public de Cardmarket.
//
//   node scripts/update-product-prices.mjs            → écrit src/data/productPrices.json
//   node scripts/update-product-prices.mjs --report   → affiche en plus le détail des correspondances
//
// Lancé avant chaque build (« prebuild ») : en cas d'échec réseau, le fichier existant est conservé.
import { readFile, writeFile } from 'node:fs/promises';
import { PRODUCTS } from '../src/data/products.js';

const BASE = 'https://downloads.s3.cardmarket.com/productCatalog';
const OUT = new URL('../src/data/productPrices.json', import.meta.url);
const REPORT = process.argv.includes('--report');

// Produits dont le nom Cardmarket ne se déduit pas du nom du set : identifiant(s) Cardmarket.
// Plusieurs identifiants = plusieurs versions du même produit, on retient la moins chère.
const OVERRIDES = {
  'sv1-deck-koraidon': [773881], // Deluxe Battle Deck: Koraidon ex
  'sv1-deck-miraidon': [773882], // Deluxe Battle Deck: Miraidon ex
};

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

async function download(path) {
  const res = await fetch(`${BASE}/${path}`, { headers: { 'User-Agent': 'Dexup/1.0 (product prices)' } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

// Le prix tendance est la référence ; quand il s'écarte fortement de la moyenne (cotation faussée par
// une vente isolée), on lui préfère la moyenne.
function robustPrice(guide) {
  if (!guide) return null;
  const { trend, avg } = guide;
  if (!(trend > 0)) return avg > 0 ? avg : null;
  if (avg > 0 && (trend > avg * 3 || trend < avg / 3)) return avg;
  return trend;
}

const KIND = {
  booster: { category: 'Pokémon Booster', suffix: 'booster' },
  display: { category: 'Pokémon Display', suffix: 'booster box' },
  etb: { category: 'Pokémon Elite Trainer Boxes', suffix: 'elite trainer box' },
};
// Variantes qui ne sont pas le produit standard.
const EXCLUDED = /\b(case|empty|pokemon center|plus|sleeved|jp|chinese|korean|indonesian|thai|bundle)\b/;

const isStandard = (c, product) => Number(norm(c.name) === `${norm(product.setName)} ${KIND[product.type]?.suffix}`);

function candidates(product, catalog) {
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

async function main() {
  const [{ products: catalog }, { priceGuides, createdAt }] = await Promise.all([
    download('productList/products_nonsingles_6.json'),
    download('priceGuide/price_guide_6.json'),
  ]);
  const guides = new Map(priceGuides.map((g) => [g.idProduct, g]));

  const prices = {};
  const missing = [];
  for (const product of PRODUCTS) {
    const found = candidates(product, catalog)
      .map((c) => ({ ...c, price: robustPrice(guides.get(c.idProduct)) }))
      .filter((c) => c.price !== null)
      // Le produit standard d'abord (« Booster Box » plutôt que la demi-boîte « 18 Boosters »), sinon la version la moins chère.
      .sort((a, b) => isStandard(b, product) - isStandard(a, product) || a.price - b.price);
    if (!found.length) { missing.push(product.id); continue; }
    prices[product.id] = Math.round(found[0].price * 100) / 100;
    if (REPORT) console.log(`${product.id.padEnd(26)} ${String(prices[product.id]).padStart(9)} €  ← ${found[0].name}${found.length > 1 ? ` (+${found.length - 1})` : ''}`);
  }

  if (Object.keys(prices).length < PRODUCTS.length / 2) throw new Error('trop peu de correspondances, relevé suspect');
  await writeFile(OUT, `${JSON.stringify({ updated: createdAt.slice(0, 10), prices }, null, 1)}\n`);
  console.log(`Prix produits : ${Object.keys(prices).length} / ${PRODUCTS.length} relevés (Cardmarket, ${createdAt.slice(0, 10)}).`);
  if (REPORT && missing.length) console.log(`Sans prix : ${missing.join(', ')}`);
}

main().catch(async (e) => {
  // Pas de réseau au build : on garde le dernier relevé plutôt que de faire échouer le déploiement.
  const kept = await readFile(OUT, 'utf8').then(() => true, () => false);
  console.warn(`Prix produits non mis à jour (${e.message})${kept ? ', relevé précédent conservé' : ''}.`);
  process.exit(kept ? 0 : 1);
});

// Met à jour les prix des produits scellés à partir du relevé public de Cardmarket.
//
//   node scripts/update-product-prices.mjs            → écrit src/data/productPrices.json
//   node scripts/update-product-prices.mjs --report   → affiche en plus le détail des correspondances
//
// Lancé avant chaque build (« prebuild ») : en cas d'échec réseau, le fichier existant est conservé.
import { readFile, writeFile } from 'node:fs/promises';
import { PRODUCTS } from '../src/data/products.js';
import { candidates, download, isStandard, loadCatalog, robustPrice } from './cardmarket.mjs';

const OUT = new URL('../src/data/productPrices.json', import.meta.url);
const REPORT = process.argv.includes('--report');

async function main() {
  const [catalog, { priceGuides, createdAt }] = await Promise.all([loadCatalog(), download('priceGuide/price_guide_6.json')]);
  const guides = new Map(priceGuides.map((g) => [g.idProduct, g]));

  const prices = {};
  const ids = {};    // produit → idProduct Cardmarket (historique des prix)
  const missing = [];
  for (const product of PRODUCTS) {
    const found = candidates(product, catalog)
      .map((c) => ({ ...c, price: robustPrice(guides.get(c.idProduct)) }))
      .filter((c) => c.price !== null)
      // Le produit standard d'abord (« Booster Box » plutôt que la demi-boîte « 18 Boosters »), sinon la version la moins chère.
      .sort((a, b) => isStandard(b, product) - isStandard(a, product) || a.price - b.price);
    if (!found.length) { missing.push(product.id); continue; }
    prices[product.id] = Math.round(found[0].price * 100) / 100;
    ids[product.id] = found[0].idProduct;
    if (REPORT) console.log(`${product.id.padEnd(26)} ${String(prices[product.id]).padStart(9)} €  ← ${found[0].name}${found.length > 1 ? ` (+${found.length - 1})` : ''}`);
  }

  if (Object.keys(prices).length < PRODUCTS.length / 2) throw new Error('trop peu de correspondances, relevé suspect');
  await writeFile(OUT, `${JSON.stringify({ updated: createdAt.slice(0, 10), prices, ids }, null, 1)}\n`);
  console.log(`Prix produits : ${Object.keys(prices).length} / ${PRODUCTS.length} relevés (Cardmarket, ${createdAt.slice(0, 10)}).`);
  if (REPORT && missing.length) console.log(`Sans prix : ${missing.join(', ')}`);
}

main().catch(async (e) => {
  // Pas de réseau au build : on garde le dernier relevé plutôt que de faire échouer le déploiement.
  const kept = await readFile(OUT, 'utf8').then(() => true, () => false);
  console.warn(`Prix produits non mis à jour (${e.message})${kept ? ', relevé précédent conservé' : ''}.`);
  process.exit(kept ? 0 : 1);
});

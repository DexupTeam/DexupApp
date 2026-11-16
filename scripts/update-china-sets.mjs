// Extensions exclusives à la Chine (Gem Pack, Happy Set, éditions chinoises…) d'après le
// catalogue public de Cardmarket : aucune base gratuite ne les publie avec leurs images.
//
//   node scripts/update-china-sets.mjs
//     → src/data/chinaSets.json          liste des extensions (embarquée dans l'app)
//     → public/extra/cn/<setId>.json     cartes de chaque extension, avec leur prix tendance
//
// Cardmarket donne le nom (« Cubone [Cheering Bone | Hit Twice] » : Pokémon et attaques) et le
// prix, mais ni numéro ni image. Lancé chaque semaine par .github/workflows/refresh-data.yml.
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { download, loadCatalog, robustPrice } from './cardmarket.mjs';

const ROOT = new URL('../', import.meta.url);
const SETS_OUT = new URL('src/data/chinaSets.json', ROOT);
const CARDS_DIR = new URL('public/extra/cn/', ROOT);
export const SERIES = 'Exclusivités Chine';

// « CBB3C: Gem Pack Vol. 3 Booster Box » → code CBB3C, nom « Gem Pack Vol. 3 ».
// Les codes chinois commencent et finissent par C (CSV9C, CBB3C, CSM2.5C) ; « 151C » aussi.
const CODE_RE = /^((?:C[A-Za-z0-9.]*|\d+)C):\s*(.+)$/;
// Type de produit en fin de nom, à retirer pour garder le nom de l'extension.
const PRODUCT_WORDS = /\s+(?:Booster Box|Booster Bundle|Sleeved Booster|Booster|Display|Gift Box|Collection|Box|Deck|Coin Set|Starter Set|Tin)(?:\s*\(.*\))?$/i;

const [sealed, singlesFile, { priceGuides, createdAt }] = await Promise.all([
  loadCatalog(),
  download('productList/products_singles_6.json'),
  download('priceGuide/price_guide_6.json'),
]);
const guides = new Map(priceGuides.map((g) => [g.idProduct, g]));

// Une extension chinoise = un code chinois dans le nom de ses produits scellés.
const expansions = new Map();
for (const p of sealed) {
  const m = p.name.match(CODE_RE);
  if (!m) continue;
  const exp = expansions.get(p.idExpansion) ?? expansions.set(p.idExpansion, { code: m[1], names: new Map(), date: null }).get(p.idExpansion);
  const date = p.dateAdded?.slice(0, 10);
  const name = m[2].replace(PRODUCT_WORDS, '').trim() || m[2];
  exp.names.set(name, (exp.names.get(name) ?? 0) + 1);
  if (date && date > '2000' && (!exp.date || date < exp.date)) exp.date = date;
}
// Le nom le plus fréquent parmi les produits de l'extension, à égalité le plus court.
for (const exp of expansions.values()) {
  exp.name = [...exp.names].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
}

const cardsBySet = new Map();
for (const p of singlesFile.products) {
  if (!expansions.has(p.idExpansion)) continue;
  (cardsBySet.get(p.idExpansion) ?? cardsBySet.set(p.idExpansion, []).get(p.idExpansion)).push(p);
}

await mkdir(CARDS_DIR, { recursive: true });
for (const old of await readdir(CARDS_DIR)) await rm(new URL(old, CARDS_DIR));

const sets = [];
for (const [idExpansion, exp] of expansions) {
  const singles = cardsBySet.get(idExpansion) ?? [];
  if (!singles.length) continue;
  const id = `cn${idExpansion}`;
  const cards = singles
    .map((p) => {
      const m = p.name.match(/^(.*?)\s*\[(.*)\]\s*$/);
      const price = robustPrice(guides.get(p.idProduct));
      return {
        id: `${id}-${p.idProduct}`,
        name: (m ? m[1] : p.name).trim(),
        detail: m ? m[2].trim() : null, // attaques ou variante, ce qui distingue deux cartes du même Pokémon
        idProduct: p.idProduct,
        price: price === null ? null : Math.round(price * 100) / 100,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || (a.detail ?? '').localeCompare(b.detail ?? '') || a.idProduct - b.idProduct);
  await writeFile(new URL(`${id}.json`, CARDS_DIR), JSON.stringify({ updated: createdAt.slice(0, 10), cards }));
  sets.push({
    id,
    code: exp.code,
    name: exp.name,
    series: SERIES,
    total: cards.length,
    releaseDate: (exp.date && exp.date > '2000' ? exp.date : '2024-01-01').replace(/-/g, '/'),
  });
}
sets.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.code.localeCompare(b.code));
await writeFile(SETS_OUT, `${JSON.stringify(sets, null, 1)}\n`);
console.log(`Extensions chinoises : ${sets.length}, ${sets.reduce((n, s) => n + s.total, 0)} cartes (Cardmarket, ${createdAt.slice(0, 10)}).`);

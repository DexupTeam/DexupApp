// Trouve une photo pour chaque produit scellé, à partir du catalogue public tcgcsv.com (TCGplayer).
//
//   node scripts/update-product-images.mjs            → écrit src/data/productImages.json
//   node scripts/update-product-images.mjs --report   → affiche en plus le détail des correspondances
//
// À relancer à la main quand de nouveaux produits sont ajoutés : les photos ne changent pas.
import { writeFile } from 'node:fs/promises';
import { PRODUCTS } from '../src/data/products.js';

const BASE = 'https://tcgcsv.com/tcgplayer/3'; // 3 = Pokémon
const OUT = new URL('../src/data/productImages.json', import.meta.url);
const REPORT = process.argv.includes('--report');

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

async function download(path) {
  const res = await fetch(`${BASE}/${path}`, { headers: { 'User-Agent': 'Dexup/1.0 (product images)' } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()).results;
}

// Nom du produit standard chez TCGplayer, après le nom du set.
const SUFFIX = { booster: 'booster pack', display: 'booster box', etb: 'elite trainer box' };
// Variantes à écarter quand le produit standard existe.
const EXCLUDED = /\b(case|code card|pokemon center|sleeved|bundle|display|half|exclusive|plus)\b/;

// Un produit seul plutôt qu'un lot (« [Set of 2] »), puis le nom le plus court.
const isLot = ({ name }) => Number(/\bset of\b/.test(name));
const simplest = (a, b) => isLot(a) - isLot(b) || a.name.length - b.name.length;

function pick(product, items) {
  const suffix = SUFFIX[product.type];
  if (!suffix) return null;
  const set = norm(product.setName);
  const matches = items
    .map((item) => ({ item, name: norm(item.name) }))
    .filter(({ name }) => name.includes(suffix) && !EXCLUDED.test(name.replace(suffix, '')));
  // « Delta Reign Booster Pack » d'abord, sinon une variante (« Elite Trainer Box [Koraidon] »), la plus courte.
  return matches.find(({ name }) => name === `${set} ${suffix}`)?.item
    ?? matches.filter(({ name }) => name.startsWith(`${set} `)).sort(simplest)[0]?.item
    // Le groupe ne contient que ce set : à défaut, le produit de ce type au nom le plus simple.
    ?? matches.sort(simplest)[0]?.item
    ?? null;
}

const groups = await download('groups');
// « ME06: Delta Reign », « SM - Team Up », « SV01: Scarlet & Violet Base Set » → nom du set seul.
const groupKey = (g) => norm(g.name.replace(/^[A-Z0-9]+(: | - )/, '').replace(/ Base Set$/, ''));
// Nom exact d'abord, sinon un nom allongé (« Scarlet & Violet 151 » pour « 151 »).
const GROUP_ALIASES = { 'Sun & Moon': 'SM Base Set' };
const groupOf = (setName) => groups.find((g) => g.name === GROUP_ALIASES[setName])
  ?? groups.find((g) => groupKey(g) === norm(setName))
  ?? groups.find((g) => groupKey(g).endsWith(` ${norm(setName)}`));

const images = {};
const missing = [];
const itemsByGroup = new Map();
for (const product of PRODUCTS) {
  if (product.image) continue; // photo déjà fournie dans le catalogue
  const group = groupOf(product.setName);
  if (group && !itemsByGroup.has(group.groupId)) itemsByGroup.set(group.groupId, await download(`${group.groupId}/products`));
  const found = group && pick(product, itemsByGroup.get(group.groupId));
  if (!found?.imageUrl) { missing.push(product.id); continue; }
  images[product.id] = found.imageUrl.replace('_200w.', '_400w.');
  if (REPORT) console.log(`${product.id.padEnd(22)} ← ${found.name}`);
}

await writeFile(OUT, `${JSON.stringify(images, null, 1)}\n`);
console.log(`Photos produits : ${Object.keys(images).length} trouvées, ${missing.length} sans photo.`);
if (missing.length) console.log(`Sans photo : ${missing.join(', ')}`);

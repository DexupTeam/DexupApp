// Complète le catalogue de produits : booster, display et ETB de chaque extension récente absente
// du catalogue manuel, dès que Cardmarket les référence.
//
//   node scripts/update-products.mjs   → écrit src/data/productsAuto.json
//
// Lancé chaque semaine par .github/workflows/refresh-data.yml, avant les prix et les photos.
import { readFile, writeFile } from 'node:fs/promises';
import { MANUAL_PRODUCTS } from '../src/data/products.js';
import { candidates, loadCatalog, norm } from './cardmarket.mjs';

const OUT = new URL('../src/data/productsAuto.json', import.meta.url);
const NAMES_FR = JSON.parse(await readFile(new URL('../src/data/setNamesFr.json', import.meta.url), 'utf8'));
const SINCE = '2023/01/01'; // ère Écarlate et Violet et suivantes : nommage Cardmarket régulier

async function loadSets() {
  // L'API répond parfois 5xx sans raison : quelques nouvelles tentatives.
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch('https://api.pokemontcg.io/v2/sets?orderBy=-releaseDate&pageSize=250&select=id,name,series,releaseDate', {
        headers: { 'User-Agent': 'Dexup/1.0 (product catalogue)' },
      });
      if (res.ok) return (await res.json()).data;
      if (attempt >= 5) throw new Error(`pokemontcg.io: HTTP ${res.status}`);
    } catch (e) {
      if (attempt >= 5) throw e;
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

const KINDS = [
  { type: 'booster', label: 'Booster', contents: { packs: 1, cardsPerPack: 10 } },
  { type: 'display', label: 'Display', contents: { packs: 36, cardsPerPack: 10 } },
  { type: 'etb', label: 'ETB', contents: { packs: 9, cardsPerPack: 10, extras: ['65 protège-cartes', '45 cartes Énergie', 'accessoires'] } },
];

const [sets, catalog] = await Promise.all([loadSets(), loadCatalog()]);
const covered = new Set(MANUAL_PRODUCTS.flatMap((p) => [p.setId, norm(p.setName)]));

const products = [];
for (const set of sets) {
  if (set.releaseDate < SINCE || covered.has(set.id) || covered.has(norm(set.name))) continue;
  const nameFr = NAMES_FR[set.name.toLowerCase()] ?? set.name;
  for (const kind of KINDS) {
    const product = {
      // « : » distingue ces identifiants de ceux du catalogue manuel (« me1-booster »).
      id: `${set.id}:${kind.type}`,
      name: `${kind.label} ${set.name}`,
      nameFr: `${kind.label} ${nameFr}`,
      type: kind.type,
      setId: set.id,
      setName: set.name,
      series: set.series,
      releaseDate: set.releaseDate,
      image: null,
      contents: kind.contents,
      auto: true,
    };
    if (candidates(product, catalog).length) products.push(product);
  }
}

await writeFile(OUT, `${JSON.stringify(products, null, 1)}\n`);
console.log(`Produits générés : ${products.length} (${[...new Set(products.map((p) => p.setName))].join(', ') || 'aucune extension nouvelle'}).`);

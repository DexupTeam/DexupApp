// Extensions japonaises d'après CardCorpus (données CC BY 4.0,
// https://github.com/cardcorpus/pokemon-card-dataset) : extensions, cartes, numéros, images ;
// prix tendance du catalogue Cardmarket, relié par l'identifiant produit que donne CardCorpus.
//
//   node scripts/update-japan-sets.mjs
//     → src/data/japanSets.json          liste des extensions (embarquée dans l'app)
//     → public/extra/ja/<setId>.json     cartes de chaque extension
//
// Les images restent hébergées chez CardCorpus : on n'en garde que l'identifiant.
// Lancé chaque semaine par .github/workflows/refresh-data.yml.
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { download, robustPrice } from './cardmarket.mjs';
import { catalogSets, englishName, front, json, pool, shortNumber } from './cardcorpus.mjs';

const ROOT = new URL('../', import.meta.url);
const SETS_OUT = new URL('src/data/japanSets.json', ROOT);
const CARDS_DIR = new URL('public/extra/ja/', ROOT);

// « japanese/30th-celebration » → « ja_30th_celebration » ; le tiret sépare l'extension du numéro
// dans nos identifiants de carte, il n'apparaît donc ni dans l'un ni dans l'autre.
const setKey = (id) => `ja_${id.replace(/^japanese\//, '').replace(/-/g, '_')}`;
const cardKey = (num) => num.replace(/[-\s/]/g, '_');

const [ja, { priceGuides, createdAt }] = await Promise.all([
  catalogSets('japanese'),
  download('priceGuide/price_guide_6.json'),
]);
const guides = new Map(priceGuides.map((g) => [g.idProduct, g]));

const loaded = await pool(ja, 8, async (meta) => {
  const [set, market] = await Promise.all([json(`sets/${meta.id}.json`), json(`marketplaces/${meta.id}.json`, { optional: true })]);
  return { meta, set, market };
});

await mkdir(CARDS_DIR, { recursive: true });
for (const old of await readdir(CARDS_DIR)) await rm(new URL(old, CARDS_DIR));

const out = [];
let imaged = 0;
let priced = 0;
for (const { meta, set, market } of loaded) {
  if (!set.cards?.length) continue;
  const id = setKey(meta.id);
  const cards = set.cards.map((c) => {
    const m = market?.cards?.[c.id];
    // Prix de la version standard de la carte, sinon de la première cotée.
    const standard = c.variants?.find((v) => v.id === c.defaultCopy) ?? c.variants?.[0];
    const idProduct = m?.variants?.[standard?.id]?.cardmarket?.product ?? m?.cardmarket?.[0] ?? null;
    const price = idProduct ? robustPrice(guides.get(idProduct)) : null;
    const image = front(c) ?? front(standard);
    if (image) imaged++;
    if (price !== null) priced++;
    return {
      id: `${id}-${cardKey(c.id)}`,
      name: englishName(c),
      number: shortNumber(c.number) ?? c.id,
      rarity: c.rarity ?? null,
      image,
      idProduct,
      price: price === null ? null : Math.round(price * 100) / 100,
    };
  });
  await writeFile(new URL(`${id}.json`, CARDS_DIR), JSON.stringify({ updated: createdAt.slice(0, 10), cards }));
  out.push({
    id,
    code: meta.code ?? null,
    name: englishName(meta),
    era: englishName(meta.era) || null,
    total: cards.length,
    printedTotal: set.printedTotal ?? cards.length,
    logo: meta.logo ?? null,
    releaseDate: (meta.released?.date ?? '1996-01-01').replace(/-/g, '/'),
  });
}
out.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.name.localeCompare(b.name));
await writeFile(SETS_OUT, `${JSON.stringify(out, null, 1)}\n`);
const total = out.reduce((n, s) => n + s.total, 0);
console.log(`Extensions japonaises : ${out.length}, ${total} cartes, ${imaged} avec image, ${priced} avec prix (CardCorpus + Cardmarket ${createdAt.slice(0, 10)}).`);

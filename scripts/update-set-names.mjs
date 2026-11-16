// Noms français officiels des extensions, d'après TCGdex (mêmes identifiants en anglais et en français).
//
//   node scripts/update-set-names.mjs   → écrit src/data/setNamesFr.json  { « nom anglais » (minuscules) → « nom français » }
//
// Lancé chaque semaine par .github/workflows/refresh-data.yml : une nouvelle extension a son nom
// français sans intervention.
import { writeFile } from 'node:fs/promises';

const OUT = new URL('../src/data/setNamesFr.json', import.meta.url);
const get = async (lang) => {
  const res = await fetch(`https://api.tcgdex.net/v2/${lang}/sets`, { headers: { 'User-Agent': 'Dexup/1.0 (set names)' } });
  if (!res.ok) throw new Error(`TCGdex ${lang}: HTTP ${res.status}`);
  return res.json();
};

const [en, fr] = await Promise.all([get('en'), get('fr')]);
const frById = new Map(fr.map((s) => [s.id, s.name]));
const names = {};
for (const set of en) {
  const french = frById.get(set.id);
  // Les extensions TCG Pocket (A1, B2…) n'existent pas en cartes physiques : inutiles ici.
  if (!french || /^[AB]\d/.test(set.id) || french.toLowerCase() === set.name.toLowerCase()) continue;
  names[set.name.toLowerCase()] = french;
}
if (Object.keys(names).length < 50) throw new Error('trop peu de noms, réponse suspecte');
const sorted = Object.fromEntries(Object.entries(names).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(OUT, `${JSON.stringify(sorted, null, 1)}\n`);
console.log(`Noms français : ${Object.keys(sorted).length} extensions.`);

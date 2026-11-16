// Assemble les fichiers d'index par extension (scan-index/) en un seul index pour l'app :
//   public/scan/index.json  { version, dim, scale, ids: [...] }
//   public/scan/index-<version>.bin  vecteurs 8 bits, ligne i = carte ids[i]
//
// Lancé avant chaque build (« prebuild ») : pas de calcul, juste une concaténation.
// Le nom du fichier binaire porte sa version, pour que le cache du navigateur suive les mises à jour.
import { createHash } from 'node:crypto';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const SRC = new URL('scan-index/', ROOT);
const OUT = new URL('public/scan/', ROOT);
const DIM = 384;
const SCALE = 400;

const files = (await readdir(SRC)).filter((f) => f.endsWith('.json')).sort();
const ids = [];
const parts = [];
for (const f of files) {
  const meta = JSON.parse(await readFile(new URL(f, SRC), 'utf8'));
  const bin = await readFile(new URL(f.replace(/\.json$/, '.bin'), SRC));
  if (bin.length !== meta.ids.length * DIM) { console.warn(`${f} : taille incohérente, ignoré`); continue; }
  ids.push(...meta.ids);
  parts.push(bin);
}
const data = Buffer.concat(parts);
const version = createHash('sha256').update(data).update(ids.join(',')).digest('hex').slice(0, 12);
for (const old of (await readdir(OUT)).filter((f) => /^index-.*\.bin$/.test(f))) await rm(new URL(old, OUT));
await writeFile(new URL(`index-${version}.bin`, OUT), data);
await writeFile(new URL('index.json', OUT), JSON.stringify({ version, dim: DIM, scale: SCALE, ids }));
console.log(`Index du scanner : ${ids.length} cartes, ${files.length} extensions, ${(data.length / 1e6).toFixed(1)} Mo (version ${version}).`);

// Index du scanner : l'empreinte visuelle (vecteur de 384 nombres) de chaque carte connue.
//
//   npm install --no-save onnxruntime-node sharp      (outils de calcul, hors dépendances de l'app)
//   node scripts/update-scan-index.mjs [setId…]       → écrit scan-index/<setId>.bin et .json
//
// Un fichier par extension : une extension déjà indexée et inchangée n'est ni retéléchargée ni
// recalculée. Lancé chaque semaine par .github/workflows/refresh-data.yml, une nouvelle extension
// devient donc scannable sans intervention. `scripts/pack-scan-index.mjs` assemble ensuite ces
// fichiers en un seul pour l'app.
//
// L'encodeur est le même que dans le navigateur (public/scan/card-encoder.onnx) : même prétraitement,
// mêmes vecteurs. Voir src/lib/vision/encoder.js.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('scan-index/', ROOT);
const MODEL = new URL('public/scan/card-encoder.onnx', ROOT);
const API = 'https://api.pokemontcg.io/v2';
const HEADERS = { 'User-Agent': 'Dexup/1.0 (scan index)' };
if (process.env.POKEMON_TCG_API_KEY) HEADERS['X-Api-Key'] = process.env.POKEMON_TCG_API_KEY;

export const DIM = 384;
export const SCALE = 400; // vecteur normalisé × SCALE, arrondi sur 8 bits (aucune composante ne dépasse 0,3)
const SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
// Taille de référence d'une carte redressée : l'image est d'abord ramenée à cette taille, comme
// une photo redressée par le scanner, puis réduite à l'entrée du modèle.
const CARD_W = 630;
const CARD_H = 880;
const BATCH = 16;
const DOWNLOADS = 8;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// L'API répond souvent 5xx sans raison : on insiste, puis on abandonne l'extension jusqu'à la prochaine fois.
async function getJson(url, attempts = 10) {
  for (let i = 1; ; i += 1) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
      if (res.ok) return await res.json();
      if (res.status < 500 && res.status !== 429) throw Object.assign(new Error(`HTTP ${res.status}`), { final: true });
      if (i >= attempts) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (e.final || i >= attempts) throw e;
    }
    await sleep(Math.min(15000, 1500 * i));
  }
}

async function getImage(url, attempts = 4) {
  for (let i = 1; ; i += 1) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (res.status === 404 || i >= attempts) return null;
    } catch (e) {
      if (i >= attempts) return null;
    }
    await sleep(1000 * i);
  }
}

async function toTensor(buffer) {
  const raw = await sharp(buffer).removeAlpha().resize(CARD_W, CARD_H, { fit: 'fill' })
    .resize(SIZE, SIZE, { fit: 'fill' }).raw().toBuffer();
  const n = SIZE * SIZE;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i += 1) for (let c = 0; c < 3; c += 1) out[c * n + i] = (raw[i * 3 + c] / 255 - MEAN[c]) / STD[c];
  return out;
}

async function embedBatch(session, tensors) {
  const n = SIZE * SIZE * 3;
  const data = new Float32Array(tensors.length * n);
  tensors.forEach((t, i) => data.set(t, i * n));
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', data, [tensors.length, 3, SIZE, SIZE]) });
  const flat = out[session.outputNames[0]].data;
  return tensors.map((_, i) => {
    const v = flat.subarray(i * DIM, (i + 1) * DIM);
    let norm = 0;
    for (const x of v) norm += x * x;
    norm = Math.sqrt(norm) || 1;
    return Int8Array.from(v, (x) => Math.max(-127, Math.min(127, Math.round((x / norm) * SCALE))));
  });
}

async function listCards(setId) {
  const cards = [];
  for (let page = 1; ; page += 1) {
    const json = await getJson(`${API}/cards?q=set.id:${setId}&pageSize=250&page=${page}&select=id,images`);
    cards.push(...json.data);
    if (json.data.length < 250) break;
  }
  return cards.filter((c) => c.images?.small).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}

async function indexSet(session, set) {
  const cards = await listCards(set.id);
  const images = new Array(cards.length);
  let next = 0;
  await Promise.all(Array.from({ length: DOWNLOADS }, async () => {
    while (next < cards.length) {
      const i = next; next += 1;
      images[i] = await getImage(cards[i].images.small);
    }
  }));
  const ids = [];
  const vectors = [];
  for (let i = 0; i < cards.length; i += BATCH) {
    const batch = [];
    for (let k = i; k < Math.min(i + BATCH, cards.length); k += 1) {
      if (!images[k]) continue;
      try { batch.push({ id: cards[k].id, tensor: await toTensor(images[k]) }); } catch (_) { /* image illisible : carte ignorée */ }
    }
    if (!batch.length) continue;
    const embedded = await embedBatch(session, batch.map((b) => b.tensor));
    batch.forEach((b, k) => { ids.push(b.id); vectors.push(embedded[k]); });
  }
  if (!ids.length) throw new Error('aucune image');
  const bin = new Int8Array(ids.length * DIM);
  vectors.forEach((v, i) => bin.set(v, i * DIM));
  await writeFile(new URL(`${set.id}.bin`, OUT), Buffer.from(bin.buffer));
  // `listed` : nombre de cartes annoncé par l'API au moment de l'indexation (détecte un set qui grossit).
  await writeFile(new URL(`${set.id}.json`, OUT), `${JSON.stringify({ set: set.id, listed: cards.length, total: set.total, ids })}\n`);
  return { indexed: ids.length, listed: cards.length };
}

const only = process.argv.slice(2);
await mkdir(OUT, { recursive: true });
const sets = (await getJson(`${API}/sets?orderBy=-releaseDate&pageSize=250&select=id,name,total,releaseDate`)).data
  .filter((s) => !only.length || only.includes(s.id));
const session = await ort.InferenceSession.create(MODEL.pathname, { intraOpNumThreads: 4, interOpNumThreads: 1 });

let done = 0;
let skipped = 0;
const failed = [];
for (const set of sets) {
  const known = await readFile(new URL(`${set.id}.json`, OUT), 'utf8').then(JSON.parse, () => null);
  // Inchangé : même nombre de cartes que lors de la dernière indexation.
  if (known && known.total === set.total && known.ids.length >= known.listed && !only.length) { skipped += 1; continue; }
  const started = Date.now();
  try {
    const { indexed, listed } = await indexSet(session, set);
    done += 1;
    console.log(`${set.id.padEnd(12)} ${String(indexed).padStart(4)} / ${listed} cartes  ${((Date.now() - started) / 1000).toFixed(0)} s  (${set.name})`);
  } catch (e) {
    failed.push(set.id);
    console.warn(`${set.id.padEnd(12)} échec : ${e.message}`);
  }
}
console.log(`Index du scanner : ${done} extension(s) indexée(s), ${skipped} inchangée(s)${failed.length ? `, ${failed.length} en échec (${failed.join(', ')}) — réessayées la prochaine fois` : ''}.`);

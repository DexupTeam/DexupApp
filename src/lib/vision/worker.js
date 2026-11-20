// Fil de travail du scanner (méthode du scanner CardCorpus, voir third_party/cardcorpus) :
//   1. trouver la carte dans la photo (détecteur de coins) ;
//   2. la redresser dans ses deux sens debout, calculer son empreinte, garder le sens que la
//      tête d'orientation juge à l'endroit ;
//   3. chercher les images les plus proches parmi 102 000 cartes anglaises, japonaises et chinoises ;
//   4. lire le numéro de collection pour départager les rééditions d'une même illustration.
// Hors du fil principal pour que la caméra reste fluide pendant le calcul.
import { loadCv, warp } from './opencv';
import { ort, model, run } from './models';
import { detectCards, quadArea } from './detector';
import { loadIndex, nearest } from './cardIndex';
import { parseNd, readNumber } from './number';

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const CANDIDATES = 10;
// Lecture du numéro prise en compte à partir de ce nombre de bandes d'accord (CardCorpus : 5 sur
// 180 ; nous en lisons 18, voir number.js).
const NUMBER_VOTES = 3;

let ready = null;
function warm() {
  ready ||= Promise.all([loadCv(), loadIndex(), model('detector'), model('matcher'), model('number')])
    .catch((e) => { ready = null; throw e; });
  return ready;
}

/** Coins dans l'ordre de leur angle autour du centre (comme CardCorpus) ; les 4 rotations possibles. */
function rolls(quad) {
  const cx = quad.reduce((s, p) => s + p[0], 0) / 4;
  const cy = quad.reduce((s, p) => s + p[1], 0) / 4;
  const order = [...quad].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  return [0, 1, 2, 3].map((r) => [...order.slice(r), ...order.slice(0, r)]);
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Entrée du matcher : carte redressée 384 × 536, côté court ramené à 224, carré central. */
function matcherInput(cv, src, quad, out, slot) {
  const card = warp(cv, src, quad, 384, 536);
  const small = new cv.Mat();
  cv.resize(card, small, new cv.Size(224, 313), 0, 0, cv.INTER_AREA);
  const top = Math.floor((313 - 224) / 2);
  const n = 224 * 224;
  const base = slot * 3 * n;
  for (let y = 0; y < 224; y += 1) {
    for (let x = 0; x < 224; x += 1) {
      const i = ((y + top) * 224 + x) * 4;
      const o = y * 224 + x;
      for (let c = 0; c < 3; c += 1) out[base + c * n + o] = (small.data[i + c] / 255 - MEAN[c]) / STD[c];
    }
  }
  card.delete();
  small.delete();
}

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

async function identify(bitmap, guide) {
  const [{ cv }, index] = await warm();
  const t0 = performance.now();
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const src = cv.matFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));

  const timings = {};
  let lap = performance.now();
  const mark = (name) => { const now = performance.now(); timings[name] = Math.round(now - lap); lap = now; };
  try {
    // 1. La carte : la plus grande des cartes sûres (une carte par photo), sinon le cadre affiché.
    const found = await detectCards(cv, src);
    mark('detect');
    const g = guide;
    const quad = found.length
      ? found.reduce((a, b) => (quadArea(b.quad) > quadArea(a.quad) ? b : a)).quad
      : [[g.x, g.y], [g.x + g.width, g.y], [g.x + g.width, g.y + g.height], [g.x, g.y + g.height]];

    // 2. Les deux sens où la carte est debout (bord du haut = petit côté). D'abord celui dont le
    // haut est en haut de l'image (carte tenue droite) ; l'autre seulement si la tête
    // d'orientation dit que la carte est à l'envers.
    const upright = rolls(quad).filter((q) => dist(q[0], q[1]) <= dist(q[1], q[2]));
    const views = (upright.length === 2 ? upright : rolls(quad).slice(0, 2))
      .sort((a, b) => (a[0][1] + a[1][1]) - (b[0][1] + b[1][1]));
    const tried = [];
    const embedView = async (q) => {
      const input = new Float32Array(3 * 224 * 224);
      matcherInput(cv, src, q, input, 0);
      const out = await run('matcher', { image: new ort.Tensor('float32', input, [1, 3, 224, 224]) });
      const l = out.orient.data;
      const m = Math.max(...l);
      const e = Array.from(l, (v) => Math.exp(v - m));
      tried.push({ quad: q, embedding: out.embedding.data, up: e[0] / e.reduce((a, v) => a + v, 0), back: out.back.data[0] });
    };
    await embedView(views[0]);
    if (tried[0].up < 0.5) await embedView(views[1]);
    mark('matcher');

    // 3. Les images les plus proches (pour chaque sens essayé, en un seul passage sur l'index).
    const tops = nearest(index, tried.map((t) => t.embedding), 20);
    mark('search');
    let pick = tried.length === 2 && tried[1].up > tried[0].up ? 1 : 0;
    // Demi-tour : l'autre sens l'emporte s'il trouve nettement mieux la même carte (CardCorpus).
    const nameOf = (hit) => index.prints[index.rows[hit.row]]?.[1];
    if (tried.length === 2) {
      const [a, b] = [tops[pick][0], tops[1 - pick][0]];
      if (a && b && b.sim >= 0.8 && b.sim - a.sim >= 0.02 && norm(nameOf(a)) === norm(nameOf(b))) pick = 1 - pick;
    }
    const chosen = tried[pick];
    const upP = tried.map((t) => t.up);
    const { back } = chosen;

    // Une carte par impression, dans l'ordre des images trouvées.
    const candidates = [];
    const seen = new Set();
    for (const hit of tops[pick]) {
      const p = index.rows[hit.row];
      if (p < 0 || seen.has(p)) continue;
      seen.add(p);
      candidates.push({ p, sim: hit.sim });
      if (candidates.length >= CANDIDATES) break;
    }

    // 4. Le numéro, lu sur la carte redressée en grand — seulement s'il peut changer la réponse :
    // plusieurs cartes de numéros différents assez proches de la première (rééditions).
    const numbers = new Set(candidates.filter((c) => c.sim >= candidates[0]?.sim - 0.2).map((c) => index.prints[c.p][3]));
    let number = null;
    if (numbers.size > 1) {
      const big = warp(cv, src, chosen.quad, 960, 1340);
      const grey = new cv.Mat();
      cv.cvtColor(big, grey, cv.COLOR_RGBA2GRAY);
      big.delete();
      number = await readNumber(cv, grey, index.number);
      grey.delete();
    }
    mark('number');

    // Score = similarité + indices pondérés (pipeline.json de CardCorpus).
    const F = index.fusion;
    const sure = number && number.votes >= NUMBER_VOTES;
    for (const c of candidates) {
      const flat = (index.prints[c.p][3] || '').replace(/\s/g, '');
      const nd = parseNd(flat);
      c.num = sure && number.nd && nd && nd[0] === number.nd[0] && nd[1] === number.nd[1] ? 1 : 0;
      c.code = sure && !number.nd && number.code && flat.toUpperCase().replace(/[^0-9A-Z]/g, '') === number.code.replace(/[^0-9A-Z]/g, '') ? 1 : 0;
      c.prior = index.prints[c.p][6] ? -1 : 0;
      c.twin = 0;
    }
    // Rééditions d'une même carte à égalité d'image : la plus ancienne d'abord.
    const byName = new Map();
    for (const c of candidates) {
      const key = norm(index.prints[c.p][1]);
      (byName.get(key) ?? byName.set(key, []).get(key)).push(c);
    }
    for (const group of byName.values()) {
      if (group.length < 2) continue;
      const best = Math.max(...group.map((c) => c.sim));
      const close = group.filter((c) => c.sim >= best - 0.02);
      if (close.length > 1) close.reduce((a, b) => (index.prints[b.p][5] < index.prints[a.p][5] ? b : a)).twin = 1;
    }
    for (const c of candidates) {
      c.score = c.sim + F.num * c.num + F.code * c.code + F.prior * c.prior + F.twin * (c.twin ?? 0);
    }
    candidates.sort((a, b) => b.score - a.score);

    // Cartes Dexup : une impression sans équivalent (deck de championnat…) prend celui de la
    // carte suivante du même nom.
    const matches = [];
    const used = new Set();
    for (const c of candidates) {
      const [dex, name, setName, printed, lang] = index.prints[c.p];
      const id = dex ?? candidates.map((o) => index.prints[o.p]).find((o) => o[0] && norm(o[1]) === norm(name))?.[0];
      if (!id || used.has(id)) continue;
      used.add(id);
      matches.push({ id, score: c.score, sim: c.sim, name, setName, number: printed, lang, numberMatch: !!c.num });
    }
    return {
      matches, quad, detected: found.length > 0, back, number,
      upright: upP[pick], ms: Math.round(performance.now() - t0), timings, cards: index.prints.length,
    };
  } finally {
    src.delete();
  }
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'warm') {
      await warm();
      self.postMessage({ id, ok: true });
    } else if (type === 'identify') {
      self.postMessage({ id, ok: true, result: await identify(data.bitmap, data.guide) });
    }
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e?.message || e) });
  }
};

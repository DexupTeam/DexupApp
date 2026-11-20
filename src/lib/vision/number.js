// Étape 5 : lire le numéro de collection en bas de la carte (CRNN de CardCorpus). Il départage
// les rééditions d'une même illustration (Jungle 29/64 ou Base Set 2 31/130).
import { ort, run } from './models';

const STRIP_H = 48;
const STRIP_W = 384;
// Une partie de la grille de CardCorpus (les 6 emplacements, 3 décalages verticaux, la grande
// échelle seulement) : 18 bandes au lieu de 180, pour le téléphone.
const SLOTS = 6;
const DYS = [-0.012, 0, 0.012];
const SCALES = [1.12];

export function parseNd(text) {
  const m = /^(\d{1,3})\/(\d{1,3})$/.exec(text);
  if (!m) return null;
  const n = +m[1];
  const d = +m[2];
  return d >= 10 && d <= 300 && n >= 1 && n <= d + 60 ? [n, d] : null;
}
const plausibleCode = (t) => /^[0-9A-Z][0-9A-Z/.-]{1,11}$/.test(t) && /\d/.test(t) && t.length >= 3;

/**
 * Lecture libre du numéro d'une carte redressée en gris (cv.Mat), ou null :
 * { text, nd: [n, d] | null, code, votes }.
 */
export async function readNumber(cv, grey, settings) {
  const { charset, slots, denominators } = settings;
  const W = grey.cols;
  const H = grey.rows;
  const strips = [];
  for (const s of slots.slice(0, SLOTS)) {
    for (const dy of DYS) {
      for (const sc of SCALES) {
        const bw = s.w * W * 1.55 * sc;
        const bh = s.h * H * 2.1 * sc;
        const cx = s.cx * W;
        const cy = (s.cy + dy) * H;
        const x0 = Math.max(0, Math.trunc(cx - bw / 2));
        const y0 = Math.max(0, Math.trunc(cy - bh / 2));
        const x1 = Math.min(W, Math.trunc(cx + bw / 2));
        const y1 = Math.min(H, Math.trunc(cy + bh / 2));
        if (x1 - x0 < 2 || y1 - y0 < 2) continue;
        const roi = grey.roi(new cv.Rect(x0, y0, x1 - x0, y1 - y0));
        const w = Math.min(STRIP_W, Math.max(16, Math.trunc(((x1 - x0) * STRIP_H) / (y1 - y0))));
        const resized = new cv.Mat();
        cv.resize(roi, resized, new cv.Size(w, STRIP_H), 0, 0, cv.INTER_CUBIC);
        const strip = new Float32Array(STRIP_H * STRIP_W).fill(0.5);
        for (let y = 0; y < STRIP_H; y += 1) {
          for (let x = 0; x < w; x += 1) strip[y * STRIP_W + x] = resized.data[y * w + x] / 255;
        }
        roi.delete();
        resized.delete();
        strips.push(strip);
      }
    }
  }
  if (!strips.length) return null;
  const batch = new Float32Array(strips.length * STRIP_H * STRIP_W);
  strips.forEach((s, i) => batch.set(s, i * s.length));
  const { logits } = await run('number', { strip: new ort.Tensor('float32', batch, [strips.length, 1, STRIP_H, STRIP_W]) });
  const [count, frames, classes] = logits.dims;
  const denoms = new Set(denominators);
  const votes = new Map();
  for (let b = 0; b < count; b += 1) {
    let text = '';
    let prev = 0;
    for (let t = 0; t < frames; t += 1) {
      const base = (b * frames + t) * classes;
      let best = 0;
      for (let c = 1; c < classes; c += 1) if (logits.data[base + c] > logits.data[base + best]) best = c;
      if (best !== 0 && best !== prev) text += charset[best - 1];
      prev = best;
    }
    const nd = parseNd(text);
    const key = nd ? nd.join('/') : plausibleCode(text) ? text : null;
    if (!key) continue;
    const v = votes.get(key) ?? votes.set(key, { text, nd, votes: 0 }).get(key);
    v.votes += 1;
  }
  let best = null;
  let bestScore = -1;
  for (const v of votes.values()) {
    const score = v.votes + (v.nd && denoms.has(v.nd[1]) ? 6 : 0) + (v.nd ? 2 : 0);
    if (score > bestScore) { best = v; bestScore = score; }
  }
  return best && { text: best.text, nd: best.nd, code: best.nd ? null : best.text, votes: best.votes };
}

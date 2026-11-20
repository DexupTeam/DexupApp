// Étape 1 : trouver la carte dans la photo (QuadDet de CardCorpus, ses 4 coins en perspective).
// Plus besoin de viser un cadre : la carte peut être n'importe où, penchée ou à l'envers.
import { ort, run } from './models';

// Côté long de l'image donnée au détecteur. Entraîné à 1280, il trouve aussi bien une carte
// qui remplit la photo à 640, quatre fois plus vite (55/57 contre 52/57 sur nos photos de test).
const SIDE = 640;
const STRIDE = 4;
export const DETECT_CONF = 0.2; // carte sûre
const RESCUE_CONF = 0.05; // carte incertaine, gardée seulement faute de mieux

/** Décode la sortie (15, h, w) en cartes [score, quad], la plus sûre d'abord (detector.py). */
function decode(data, gh, gw, conf) {
  const plane = gh * gw;
  const at = (c, y, x) => data[c * plane + y * gw + x];
  const peaks = [];
  for (let y = 0; y < gh; y += 1) {
    for (let x = 0; x < gw; x += 1) {
      const s = at(12, y, x);
      if (s > 0.1) peaks.push([(x + 0.5 + at(13, y, x)) * STRIDE, (y + 0.5 + at(14, y, x)) * STRIDE, s]);
    }
  }
  const found = [];
  for (let y = 0; y < gh; y += 1) {
    for (let x = 0; x < gw; x += 1) {
      const score = at(0, y, x);
      if (score <= conf) continue;
      const cx = (x + 0.5 + at(1, y, x)) * STRIDE;
      const cy = (y + 0.5 + at(2, y, x)) * STRIDE;
      const size = Math.exp(Math.min(8, Math.max(-4, at(3, y, x)))) * STRIDE;
      const quad = [0, 1, 2, 3].map((k) => [cx + at(4 + 2 * k, y, x) * size, cy + at(5 + 2 * k, y, x) * size]);
      // Chaque coin se cale sur le coin détecté le plus sûr à proximité.
      for (const corner of quad) {
        let best = null;
        for (const p of peaks) {
          if (Math.hypot(p[0] - corner[0], p[1] - corner[1]) <= 0.08 * size && (!best || p[2] > best[2])) best = p;
        }
        if (best) { corner[0] = best[0]; corner[1] = best[1]; }
      }
      found.push({ score, quad });
    }
  }
  return found.sort((a, b) => b.score - a.score);
}

export const quadArea = (q) => Math.abs(q.reduce((s, [x, y], i) => s + x * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * y, 0)) / 2;

/**
 * Cartes trouvées dans `src` (cv.Mat RGBA), coins en pixels de `src`, la plus sûre d'abord.
 * Les cartes incertaines (score < DETECT_CONF) ne sont gardées que s'il n'y en a pas de sûre.
 */
export async function detectCards(cv, src) {
  const gain = SIDE / Math.max(src.cols, src.rows);
  const nw = Math.round(src.cols * gain);
  const nh = Math.round(src.rows * gain);
  const cw = Math.ceil(nw / 32) * 32;
  const ch = Math.ceil(nh / 32) * 32;
  const small = new cv.Mat();
  cv.resize(src, small, new cv.Size(nw, nh), 0, 0, cv.INTER_LINEAR);
  const input = new Float32Array(3 * cw * ch).fill(114 / 255);
  const px = small.data;
  const plane = cw * ch;
  for (let y = 0; y < nh; y += 1) {
    for (let x = 0; x < nw; x += 1) {
      const i = (y * nw + x) * 4;
      const o = y * cw + x;
      input[o] = px[i] / 255;
      input[plane + o] = px[i + 1] / 255;
      input[2 * plane + o] = px[i + 2] / 255;
    }
  }
  small.delete();
  const { out } = await run('detector', { image: new ort.Tensor('float32', input, [1, 3, ch, cw]) });
  const [, , gh, gw] = out.dims;
  const rescale = (d) => ({ ...d, quad: d.quad.map(([x, y]) => [x * (src.cols / nw), y * (src.rows / nh)]) });
  const sure = decode(out.data, gh, gw, DETECT_CONF);
  return (sure.length ? sure : decode(out.data, gh, gw, RESCUE_CONF)).map(rescale);
}

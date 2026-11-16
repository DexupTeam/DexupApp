// Fil de travail du scanner : détection, redressement, empreinte et recherche, hors du fil
// principal pour que la caméra reste fluide pendant le calcul.
import { detectCard, loadCv, rectify, toModelInput } from './detect';
import { encode, INPUT_SIZE, loadEncoder } from './encoder';
import { loadIndex, nearest } from './cardIndex';

// Carte redressée avant réduction : assez grande pour une réduction propre vers 224 × 224.
const CARD_W = 315;
const CARD_H = 440;
// Score à partir duquel une vue est jugée bonne : inutile d'essayer les autres.
const GOOD_ENOUGH = 0.8;

let ready = null;
function warm() {
  ready ||= Promise.all([loadCv(), loadEncoder(), loadIndex()]).catch((e) => { ready = null; throw e; });
  return ready;
}

async function identify(bitmap, guide) {
  const [{ cv }, , index] = await warm();
  const t0 = performance.now();
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const src = cv.matFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));

  const quad = detectCard(cv, src);
  // Vues essayées dans l'ordre, jusqu'à une correspondance nette : la carte détectée, la même
  // à l'envers, puis le cadre affiché à l'écran (carte non détectée, ou détection fausse).
  const g = guide;
  const guideQuad = [[g.x, g.y], [g.x + g.width, g.y], [g.x + g.width, g.y + g.height], [g.x, g.y + g.height]];
  const views = quad
    ? [{ name: 'card', quad }, { name: 'card-flip', quad, flip: true }, { name: 'guide', quad: guideQuad }]
    : [{ name: 'guide', quad: guideQuad }];

  let best = null;
  for (const view of views) {
    const card = rectify(cv, src, view.quad, CARD_W, CARD_H, view.flip);
    const vector = await encode(toModelInput(cv, card, INPUT_SIZE));
    card.delete();
    const matches = nearest(index, vector, 8);
    if (!best || matches[0].score > best.matches[0].score) best = { view: view.name, matches };
    if (best.matches[0].score >= GOOD_ENOUGH) break;
  }
  src.delete();
  return { ...best, quad, ms: Math.round(performance.now() - t0), cards: index.ids.length };
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

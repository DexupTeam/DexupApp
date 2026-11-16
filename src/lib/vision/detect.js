// Détection de la carte dans l'image et redressement, avec OpenCV.js.
// Plus besoin de viser un cadre au pixel près : les quatre bords de la carte sont cherchés
// dans toute l'image, puis la carte est remise à plat, droite et à taille fixe.
//
// Adapté de pokeum (app/vision/detect.py et rectify.py), © 2026 TBLgGamin, licence MIT :
// voir third_party/pokeum/LICENSE.
import cv from '@techstark/opencv-js';
import { isPlausibleCard, orderCorners } from './geometry';

// La détection des bords demande du contraste, pas de la résolution : on cherche sur une copie
// réduite et on remet le quadrilatère à l'échelle pour redresser à partir de l'image d'origine.
const DETECT_MAX_SIDE = 640;
const MAX_CONTOURS = 10;
// Tolérances d'approximation essayées sur l'enveloppe convexe quand le contour brut n'est pas
// un quadrilatère propre (coins arrondis, reflet, doigt sur un bord).
const HULL_EPSILONS = [0.02, 0.04, 0.08];
// Seuils de Canny relatifs à la luminosité médiane de la scène : des seuils fixes ratent
// les bords dans une pièce sombre.
const CANNY_LO = 0.66;
const CANNY_HI = 1.33;

let cvPromise = null;
/**
 * OpenCV.js prêt à l'emploi. Renvoie `{ cv }` et non `cv` : le module Emscripten a une méthode
 * `then`, et une promesse qui le renverrait tel quel le prendrait pour une autre promesse, à
 * attendre sans fin (boucle infinie qui bloque le fil). Pour la même raison, OpenCV est importé
 * statiquement (un `import()` dynamique passe le module dans une promesse) : c'est le fil de
 * travail du scanner, lui-même chargé à la demande, qui le télécharge.
 */
export function loadCv() {
  cvPromise ||= new Promise((resolve) => {
    const done = () => resolve({ cv });
    if (cv.Mat) done();
    else if (typeof cv.then === 'function') cv.then(() => done());
    else cv.onRuntimeInitialized = done;
  });
  return cvPromise;
}

function median(mat) {
  const hist = new Uint32Array(256);
  const d = mat.data;
  for (let i = 0; i < d.length; i += 1) hist[d[i]] += 1;
  let acc = 0;
  for (let v = 0; v < 256; v += 1) {
    acc += hist[v];
    if (acc >= d.length / 2) return v;
  }
  return 128;
}

function toPoints(mat) {
  const pts = [];
  for (let i = 0; i < mat.rows; i += 1) pts.push([mat.data32S[i * 2], mat.data32S[i * 2 + 1]]);
  return pts;
}

function quadFromContour(cv, contour) {
  const tryApprox = (curve, epsilon) => {
    const approx = new cv.Mat();
    cv.approxPolyDP(curve, approx, epsilon * cv.arcLength(curve, true), true);
    const ok = approx.rows === 4 && cv.isContourConvex(approx);
    const pts = ok ? toPoints(approx) : null;
    approx.delete();
    return pts;
  };
  const direct = tryApprox(contour, 0.02);
  if (direct) return direct;
  const hull = new cv.Mat();
  cv.convexHull(contour, hull, false, true);
  let found = null;
  for (const epsilon of HULL_EPSILONS) {
    found = tryApprox(hull, epsilon);
    if (found) break;
  }
  hull.delete();
  return found;
}

/**
 * Cherche la carte dans une image RGBA (cv.Mat). Renvoie ses coins [[x, y] × 4] en portrait
 * (haut-gauche, haut-droit, bas-droit, bas-gauche), dans les coordonnées de `src`, ou null.
 */
export function detectCard(cv, src) {
  const scale = Math.min(1, DETECT_MAX_SIDE / Math.max(src.cols, src.rows));
  const small = new cv.Mat();
  cv.resize(src, small, new cv.Size(Math.round(src.cols * scale), Math.round(src.rows * scale)), 0, 0, cv.INTER_AREA);
  // Bords cherchés sur la luminosité ET sur la saturation des couleurs : un bord jaune sur une
  // table beige a presque la même luminosité que la table, mais pas du tout la même saturation.
  const gray = new cv.Mat();
  cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
  const rgb = new cv.Mat();
  cv.cvtColor(small, rgb, cv.COLOR_RGBA2RGB);
  const hsv = new cv.Mat();
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
  const channels = new cv.MatVector();
  cv.split(hsv, channels);
  const saturation = channels.get(1);
  const edges = new cv.Mat();
  const blurred = new cv.Mat();
  const channelEdges = new cv.Mat();
  for (const [i, channel] of [gray, saturation].entries()) {
    cv.bilateralFilter(channel, blurred, 9, 75, 75);
    const m = Math.max(median(blurred), 40); // une saturation médiane nulle (fond gris) donnerait des seuils nuls
    cv.Canny(blurred, i ? channelEdges : edges, Math.max(0, CANNY_LO * m), Math.min(255, CANNY_HI * m));
    if (i) cv.bitwise_or(edges, channelEdges, edges);
  }
  [rgb, hsv, saturation, channelEdges].forEach((mat) => mat.delete());
  channels.delete();
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  cv.dilate(edges, edges, kernel);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  const ranked = [];
  for (let i = 0; i < contours.size(); i += 1) {
    const c = contours.get(i);
    ranked.push({ c, area: cv.contourArea(c) });
  }
  ranked.sort((a, b) => b.area - a.area);
  const frameArea = small.cols * small.rows;
  let quad = null;
  for (const { c } of ranked.slice(0, MAX_CONTOURS)) {
    const pts = quadFromContour(cv, c);
    if (pts && isPlausibleCard(pts, frameArea)) {
      quad = orderCorners(pts).map(([x, y]) => [x / scale, y / scale]);
      break;
    }
  }
  ranked.forEach(({ c }) => c.delete());
  [small, gray, blurred, edges, kernel, contours, hierarchy].forEach((mat) => mat.delete());
  return quad;
}

/**
 * Remet à plat la zone `quad` de `src` (coins en portrait) en une carte de `width` × `height`.
 * `flip` la tourne de 180° (carte tenue à l'envers).
 */
export function rectify(cv, src, quad, width, height, flip = false) {
  const corners = flip ? [quad[2], quad[3], quad[0], quad[1]] : quad;
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flat());
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width - 1, 0, width - 1, height - 1, 0, height - 1]);
  const matrix = cv.getPerspectiveTransform(from, to);
  const out = new cv.Mat();
  cv.warpPerspective(src, out, matrix, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
  [from, to, matrix].forEach((mat) => mat.delete());
  return out;
}

/** Réduit une carte redressée à l'entrée carrée du modèle (moyenne des pixels, sans crénelage). */
export function toModelInput(cv, card, size) {
  const out = new cv.Mat();
  cv.resize(card, out, new cv.Size(size, size), 0, 0, cv.INTER_AREA);
  const rgba = new Uint8ClampedArray(out.data);
  out.delete();
  return rgba;
}

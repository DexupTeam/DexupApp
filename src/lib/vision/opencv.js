// OpenCV.js : redressement des cartes (perspective) et redimensionnements.
import cv from '@techstark/opencv-js';

let cvPromise = null;
/**
 * OpenCV.js prêt à l'emploi. Renvoie `{ cv }` et non `cv` : le module Emscripten a une méthode
 * `then`, et une promesse qui le renverrait tel quel le prendrait pour une autre promesse, à
 * attendre sans fin. Pour la même raison, OpenCV est importé statiquement : c'est le fil de
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

/** Remet à plat la zone `quad` (4 coins, le haut-gauche de la carte d'abord) en `width` × `height`. */
export function warp(cv, src, quad, width, height, interpolation = cv.INTER_CUBIC) {
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, quad.flat());
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, width, height, 0, height]);
  const matrix = cv.getPerspectiveTransform(from, to);
  const out = new cv.Mat();
  cv.warpPerspective(src, out, matrix, new cv.Size(width, height), interpolation, cv.BORDER_REPLICATE);
  [from, to, matrix].forEach((m) => m.delete());
  return out;
}

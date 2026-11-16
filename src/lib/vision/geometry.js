// Géométrie pure du quadrilatère d'une carte : tri des coins, aire, proportions, forme.
// Sans OpenCV, donc testable avec de simples tableaux de points [x, y].
//
// Adapté de pokeum (app/vision/geometry.py), © 2026 TBLgGamin, licence MIT :
// voir third_party/pokeum/LICENSE.

// Une carte fait 63 × 88 mm : rapport petit côté / grand côté ≈ 0,716.
export const CARD_ASPECT_MIN = 0.55;
export const CARD_ASPECT_MAX = 0.85;
// Une carte doit occuper au moins 5 % de l'image analysée.
export const MIN_AREA_FRACTION = 0.05;
// Chaque coin à moins de ~35° de l'angle droit, côtés opposés dans un rapport de 1,6 au plus :
// une carte tenue à la main reste un quasi-rectangle, un contour de décor non.
const MAX_CORNER_COSINE = 0.57;
const MIN_SIDE_RATIO = 0.6;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Ordonne les coins en haut-gauche, haut-droit, bas-droit, bas-gauche d'une carte en PORTRAIT.
 * Les coins sont parcourus dans le sens horaire autour du centre ; on commence par un petit côté
 * (une carte posée de travers est remise debout) et, des deux petits côtés, le plus haut à
 * l'écran devient le haut. Une carte vraiment à l'envers ressort tournée de 180° : le
 * reconnaisseur essaie alors les deux sens.
 */
export function orderCorners(points) {
  const cx = points.reduce((s, p) => s + p[0], 0) / 4;
  const cy = points.reduce((s, p) => s + p[1], 0) / 4;
  const cw = [...points].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  const edge = (i) => dist(cw[i % 4], cw[(i + 1) % 4]);
  let start = edge(0) + edge(2) <= edge(1) + edge(3) ? 0 : 1;
  const topY = (cw[start][1] + cw[(start + 1) % 4][1]) / 2;
  const bottomY = (cw[(start + 2) % 4][1] + cw[(start + 3) % 4][1]) / 2;
  if (bottomY < topY) start += 2;
  return [0, 1, 2, 3].map((i) => cw[(start + i) % 4]);
}

export function polygonArea(points) {
  let s = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/** Petit côté / grand côté du quadrilatère remis en portrait (≈ 0,716 pour une carte). */
export function aspectRatio(points) {
  const [tl, tr, br, bl] = orderCorners(points);
  const height = (dist(bl, tl) + dist(br, tr)) / 2;
  return height > 0 ? (dist(tr, tl) + dist(br, bl)) / 2 / height : 0;
}

/** Le bord du haut est plus vertical qu'horizontal : carte couchée (ou illustration d'une carte debout). */
export function isSideways(ordered) {
  const [tl, tr] = ordered;
  return Math.abs(tr[1] - tl[1]) > Math.abs(tr[0] - tl[0]);
}

function isRectangleLike(ordered) {
  const sides = ordered.map((p, i) => {
    const q = ordered[(i + 1) % 4];
    return [q[0] - p[0], q[1] - p[1]];
  });
  const lengths = sides.map(([x, y]) => Math.hypot(x, y));
  if (lengths.some((l) => l <= 0)) return false;
  for (let i = 0; i < 4; i += 1) {
    const prev = sides[(i + 3) % 4];
    const cur = sides[i];
    const cos = (-prev[0] * cur[0] - prev[1] * cur[1]) / (lengths[(i + 3) % 4] * lengths[i]);
    if (Math.abs(cos) > MAX_CORNER_COSINE) return false;
  }
  const ratio = (a, b) => Math.min(a, b) / Math.max(a, b);
  return ratio(lengths[0], lengths[2]) >= MIN_SIDE_RATIO && ratio(lengths[1], lengths[3]) >= MIN_SIDE_RATIO;
}

/** Le quadrilatère a la taille, la forme et les proportions d'une carte dans une image de `frameArea` pixels. */
export function isPlausibleCard(points, frameArea) {
  if (frameArea <= 0 || polygonArea(points) / frameArea < MIN_AREA_FRACTION) return false;
  if (!isRectangleLike(orderCorners(points))) return false;
  const ratio = aspectRatio(points);
  return ratio >= CARD_ASPECT_MIN && ratio <= CARD_ASPECT_MAX;
}

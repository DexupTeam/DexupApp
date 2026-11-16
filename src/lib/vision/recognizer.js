// Côté page du scanner : envoie une image au fil de travail et interprète la réponse.
//
// Similarités mesurées (modèle quantifié, photos dégradées) : la bonne carte obtient ~0,92 en
// médiane et rarement moins de 0,72 ; la meilleure MAUVAISE carte ~0,59 en médiane, 0,72 au
// 95e centile. D'où les seuils ci-dessous.
export const CONFIDENT = 0.78; // au-dessus, et nettement devant la suivante : carte reconnue
export const MARGIN = 0.06;
export const PLAUSIBLE = 0.62; // en dessous : rien de reconnaissable (pas de carte, trop flou…)
const TIE = 0.04; // cartes à égalité avec la première (rééditions de la même illustration)

let worker = null;
let nextId = 0;
const pending = new Map();

function call(message, transfer = []) {
  worker ||= (() => {
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.ok) p.resolve(data.result); else p.reject(new Error(data.error));
    };
    w.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'scanner indisponible'));
      pending.clear();
      worker = null;
    };
    return w;
  })();
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...message, id }, transfer);
  });
}

/** Télécharge et prépare le modèle, OpenCV et l'index (≈ 45 Mo la première fois, en cache ensuite). */
export const warmRecognizer = () => call({ type: 'warm' });

/**
 * Reconnaît la carte d'une image (ImageBitmap). `guide` : le cadre affiché, en pixels de l'image.
 * Renvoie { status: 'match' | 'choices' | 'none', matches, best, ... }.
 */
export async function recognize(bitmap, guide) {
  const result = await call({ type: 'identify', bitmap, guide }, [bitmap]);
  const [first, second] = result.matches;
  let status = 'none';
  if (first.score >= CONFIDENT && (!second || first.score - second.score >= MARGIN)) status = 'match';
  else if (first.score >= PLAUSIBLE) status = 'choices';
  // Rééditions d'une même illustration : scores quasi identiques, à départager (numéro) ou à choisir.
  const ties = result.matches.filter((m) => first.score - m.score < TIE);
  if (status === 'match' && ties.length > 1) status = 'choices';
  return { ...result, status, best: first, ties };
}

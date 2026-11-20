// Côté page du scanner : envoie une image au fil de travail et interprète la réponse.
//
// Similarités du scanner CardCorpus : en dessous de 0,70 ce n'est pas une carte connue (junk_sim),
// en dessous de 0,88 la carte reste incertaine (quality « unsure »). Le score ajoute à la
// similarité les indices du numéro lu (+0,2 quand il correspond).
export const CONFIDENT = 0.82; // similarité au-dessus de laquelle la carte peut être reconnue d'emblée
export const MARGIN = 0.05; // … si elle devance nettement la suivante
export const PLAUSIBLE = 0.7; // en dessous : rien de reconnaissable (pas de carte, trop flou…)
const BACK = 0.6; // dos de carte
const TIE = 0.03;

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

/** Télécharge et prépare les modèles, OpenCV et l'index (≈ 100 Mo la première fois, en cache ensuite). */
export const warmRecognizer = () => call({ type: 'warm' });

/**
 * Reconnaît la carte d'une image (ImageBitmap). `guide` : le cadre affiché, en pixels de l'image.
 * Renvoie { status: 'match' | 'choices' | 'none', matches, best, ... }.
 */
export async function recognize(bitmap, guide) {
  const result = await call({ type: 'identify', bitmap, guide }, [bitmap]);
  const [first, second] = result.matches;
  let status = 'none';
  if (first && result.back < BACK && first.sim >= PLAUSIBLE) {
    const lead = second ? first.score - second.score : 1;
    // Reconnue : image nette et loin devant, ou numéro lu qui la confirme.
    status = first.sim >= CONFIDENT && (lead >= MARGIN || (first.numberMatch && !second?.numberMatch)) ? 'match' : 'choices';
  }
  const ties = first ? result.matches.filter((m) => first.score - m.score < TIE) : [];
  return { ...result, status, best: first, ties };
}

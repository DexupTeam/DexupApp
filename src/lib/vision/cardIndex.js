// Index des empreintes de cartes (voir scripts/update-scan-index.mjs) et recherche des plus proches.
let indexPromise = null;

export function loadIndex() {
  indexPromise ||= (async () => {
    const meta = await (await fetch('/scan/index.json', { cache: 'no-cache' })).json();
    const res = await fetch(`/scan/index-${meta.version}.bin`);
    if (!res.ok) throw new Error(`index HTTP ${res.status}`);
    const vectors = new Int8Array(await res.arrayBuffer());
    // Norme de chaque ligne : les vecteurs arrondis sur 8 bits ne sont plus tout à fait unitaires.
    const norms = new Float32Array(meta.ids.length);
    for (let r = 0; r < meta.ids.length; r += 1) {
      let s = 0;
      for (let i = r * meta.dim, end = i + meta.dim; i < end; i += 1) s += vectors[i] * vectors[i];
      norms[r] = Math.sqrt(s) || 1;
    }
    return { ...meta, vectors, norms };
  })().catch((e) => { indexPromise = null; throw e; });
  return indexPromise;
}

/** Les `k` cartes dont l'empreinte est la plus proche de `query` (similarité cosinus, 1 = identique). */
export function nearest(index, query, k = 8) {
  const { ids, dim, vectors, norms } = index;
  const top = []; // [score, rang], trié décroissant
  for (let r = 0; r < ids.length; r += 1) {
    let s = 0;
    const base = r * dim;
    for (let i = 0; i < dim; i += 1) s += query[i] * vectors[base + i];
    s /= norms[r];
    if (top.length < k || s > top[top.length - 1][0]) {
      let j = top.length < k ? top.length : k - 1;
      top[j] = [s, r];
      while (j > 0 && top[j][0] > top[j - 1][0]) { [top[j], top[j - 1]] = [top[j - 1], top[j]]; j -= 1; }
    }
  }
  return top.map(([score, r]) => ({ id: ids[r], score }));
}

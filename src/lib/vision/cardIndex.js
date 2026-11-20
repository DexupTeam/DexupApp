// Index de référence du scanner (scripts/scanner/build_index.py) : 102 000 empreintes d'images de
// cartes anglaises, japonaises et chinoises (CardCorpus, CC BY 4.0), et la carte Dexup de chacune.
let indexPromise = null;

export function loadIndex() {
  indexPromise ||= (async () => {
    const manifest = await (await fetch('/scan/index.json', { cache: 'no-cache' })).json();
    const [chunks, meta] = await Promise.all([
      Promise.all(manifest.embeddings.map(async (file) => {
        const res = await fetch(`/scan/${file}`);
        if (!res.ok) throw new Error(`index HTTP ${res.status}`);
        return new Int8Array(await res.arrayBuffer());
      })),
      fetch(`/scan/${manifest.meta}`).then((r) => r.json()),
    ]);
    const vectors = new Int8Array(manifest.rows * manifest.dim);
    let offset = 0;
    for (const c of chunks) { vectors.set(c, offset); offset += c.length; }
    return { ...manifest, vectors, rows: Int32Array.from(meta.rows), prints: meta.prints };
  })().catch((e) => { indexPromise = null; throw e; });
  return indexPromise;
}

/**
 * Les `k` lignes les plus proches de chaque requête (empreintes normées), en un seul passage sur
 * l'index : [[{ row, sim }], …] par requête, la plus proche d'abord.
 */
export function nearest(index, queries, k = 20) {
  const { vectors, dim, scale } = index;
  const n = vectors.length / dim;
  const qs = queries.map((q) => Float32Array.from(q, (v) => v / scale));
  const tops = queries.map(() => []);
  const sims = new Float32Array(qs.length);
  for (let r = 0; r < n; r += 1) {
    const base = r * dim;
    sims.fill(0);
    for (let j = 0; j < qs.length; j += 1) {
      const q = qs[j];
      let s = 0;
      for (let i = 0; i < dim; i += 1) s += q[i] * vectors[base + i];
      sims[j] = s;
    }
    for (let j = 0; j < qs.length; j += 1) {
      const top = tops[j];
      const s = sims[j];
      if (top.length < k || s > top[top.length - 1].sim) {
        let i = top.length < k ? top.length : k - 1;
        top[i] = { row: r, sim: s };
        while (i > 0 && top[i].sim > top[i - 1].sim) { [top[i], top[i - 1]] = [top[i - 1], top[i]]; i -= 1; }
      }
    }
  }
  return tops;
}

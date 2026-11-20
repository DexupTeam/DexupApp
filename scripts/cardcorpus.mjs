// Images, numéros et logos des cartes chinoises d'après CardCorpus (données CC BY 4.0,
// https://github.com/cardcorpus/pokemon-card-dataset). Ses cartes portent l'identifiant
// produit Cardmarket : on relie ainsi nos cartes (catalogue Cardmarket) sans ambiguïté.
// Les images restent hébergées chez CardCorpus : on n'en garde que l'identifiant.

const RAW = 'https://raw.githubusercontent.com/cardcorpus/pokemon-card-dataset/main/v1/';

async function json(path, { optional } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(RAW + path);
    if (res.ok) return res.json();
    if (optional && res.status === 404) return null;
    if (attempt >= 3) throw new Error(`CardCorpus ${path} : HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
}

async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const front = (x) => x?.picture?.front?.image ?? null;
export const normName = (s) => s.replace(/\s*\[.*\]\s*$/, '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

/**
 * Catalogue chinois (zh-hans) de CardCorpus :
 *   byProduct : idProduct Cardmarket → { image, number, set }
 *   sets      : code (« CBB3C ») → { logo, cards: [{ number, name, image }] }
 */
export async function loadCardcorpus() {
  const { sets } = await json('sets.json');
  const zh = sets.filter((s) => s.catalog === 'zh-hans');
  const loaded = await pool(zh, 8, async (meta) => {
    const [set, market] = await Promise.all([json(`sets/${meta.id}.json`), json(`marketplaces/${meta.id}.json`, { optional: true })]);
    return { meta, set, market };
  });

  const byProduct = new Map();
  const byCode = new Map();
  for (const { meta, set, market } of loaded) {
    const cards = new Map(set.cards.map((c) => [c.id, c]));
    const entry = byCode.get(meta.code) ?? { logo: meta.logo ?? null, cards: [] };
    for (const c of set.cards) {
      const image = front(c) ?? front(c.variants?.[0]);
      if (image) entry.cards.push({ number: c.number?.numerator ?? c.id, name: c.name, image, set: meta.id });
    }
    if (meta.code) byCode.set(meta.code, entry);
    for (const [num, e] of Object.entries(market?.cards ?? {})) {
      const card = cards.get(num);
      if (!card) continue;
      const base = { number: card.number?.numerator ?? num, set: meta.id, name: card.name };
      for (const [variantId, v] of Object.entries(e.variants ?? {})) {
        const variant = card.variants?.find((x) => x.id === variantId);
        const image = front(variant) ?? front(card);
        if (v.cardmarket?.product && image && !byProduct.has(v.cardmarket.product)) byProduct.set(v.cardmarket.product, { ...base, image });
      }
      for (const p of e.cardmarket ?? []) {
        const image = front(card);
        if (image && !byProduct.has(p)) byProduct.set(p, { ...base, image });
      }
    }
  }
  return { byProduct, byCode };
}

/**
 * Relie les cartes d'une extension : d'abord par identifiant Cardmarket ; les autres (extension
 * trop récente pour CardCorpus…) par nom dans l'extension de même code, dans l'ordre des numéros.
 * Renvoie Map idProduct → { image, number }.
 */
export function matchCards(cards, code, corpus) {
  const out = new Map();
  for (const c of cards) {
    const hit = corpus.byProduct.get(c.idProduct);
    if (hit) out.set(c.idProduct, { image: hit.image, number: hit.number });
  }
  const pool = corpus.byCode.get(code)?.cards;
  if (!pool?.length) return out;
  const taken = new Set([...out.values()].map((v) => v.image));
  const left = (list, key) => {
    const groups = new Map();
    for (const x of list) (groups.get(key(x)) ?? groups.set(key(x), []).get(key(x))).push(x);
    return groups;
  };
  const mine = left(cards.filter((c) => !out.has(c.idProduct)).sort((a, b) => a.idProduct - b.idProduct), (c) => normName(c.name));
  const theirs = left(pool.filter((c) => !taken.has(c.image)), (c) => normName(c.name));
  for (const [name, group] of mine) {
    const cand = theirs.get(name);
    // Même nombre de versions des deux côtés : Cardmarket numérote ses produits dans l'ordre des cartes.
    if (cand && cand.length === group.length) group.forEach((c, i) => out.set(c.idProduct, { image: cand[i].image, number: cand[i].number }));
  }
  return out;
}

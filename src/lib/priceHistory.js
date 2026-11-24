// Historique des prix Cardmarket (table Supabase price_months, remplie chaque jour par
// scripts/update-price-history.mjs) : courbes d'une carte, d'un produit scellé et de la collection.
//
// Un point = { t: minuit UTC du jour, v: prix en €, est: true si c'est une estimation }. Avant le début
// de l'historique, les moyennes Cardmarket sur 30 et 7 jours d'une carte donnent l'allure du dernier mois
// (placées au milieu de leur période ; la moyenne sur 1 jour, souvent une seule vente, est trop instable).
import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { getCachedRaw, setCached } from '../utils/cache';
import { loadPriceStore, manualValue, priceValue } from './prices';

const DAY = 24 * 60 * 60 * 1000;
const MONTHS = 13;            // de quoi afficher une année entière
const PAGE = 70;              // produits par requête : 70 × 13 mois reste sous la limite de 1000 lignes
const MAX_AGE = 6 * 60 * 60 * 1000; // le relevé est quotidien : 6 h de cache suffisent

export const today = () => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };

function sinceMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (MONTHS - 1), 1)).toISOString().slice(0, 10);
}

function toPoints(rows) {
  const points = [];
  for (const r of rows) {
    const [y, m] = r.month.split('-').map(Number);
    r.days.forEach((d, i) => points.push({ t: Date.UTC(y, m - 1, d), v: r.cents[i] / 100 }));
  }
  return points.sort((a, b) => a.t - b.t);
}

// Cache local : { idProduct: { at, points } }, gardé en une seule entrée (une écriture par chargement).
let memo = null;
async function loadMemo() {
  memo ||= getCachedRaw('price-history').then((hit) => hit?.data ?? {});
  return memo;
}

/** Points réels de chaque produit Cardmarket demandé : { idProduct: [{ t, v }] } (liste vide = pas d'historique). */
export async function loadHistory(products) {
  const ids = [...new Set(products.filter((p) => Number.isInteger(p) && p > 0))];
  const cache = await loadMemo();
  const fresh = (id) => cache[id] && Date.now() - cache[id].at < MAX_AGE;
  const missing = ids.filter((id) => !fresh(id));
  if (missing.length && supabase) {
    try {
      const since = sinceMonth();
      const rows = {};
      for (let i = 0; i < missing.length; i += PAGE) {
        const chunk = missing.slice(i, i + PAGE);
        const { data, error } = await supabase.from('price_months').select('product,month,days,cents').in('product', chunk).gte('month', since);
        if (error) throw error;
        for (const r of data) (rows[r.product] ||= []).push(r);
      }
      for (const id of missing) cache[id] = { at: Date.now(), points: toPoints(rows[id] || []) };
      await setCached('price-history', cache);
    } catch (e) {
      console.warn('[priceHistory] historique indisponible :', e.message); // hors ligne : on garde le cache, même ancien
    }
  }
  return Object.fromEntries(ids.map((id) => [id, cache[id]?.points ?? []]));
}

/**
 * Courbe d'une carte ou d'un produit : son historique, précédé si besoin des moyennes 30 j et 7 j
 * (estimations), et terminé par le prix affiché aujourd'hui pour que la courbe finisse sur ce chiffre.
 */
export function buildSeries(history = [], { current, avg30, avg7 } = {}) {
  const end = today();
  const real = history.filter((p) => p.t < end);
  const start = real[0]?.t ?? end;
  const seeds = [[15, avg30], [4, avg7]]
    .map(([days, v]) => ({ t: end - days * DAY, v, est: true }))
    .filter((p) => p.v > 0 && p.t < start);
  const points = [...seeds, ...real];
  const last = current > 0 ? current : history.at(-1)?.v;
  if (last > 0) points.push({ t: end, v: last });
  return points;
}

// Valeur d'une courbe au jour t : le dernier point connu, à défaut le premier.
function valueAt(points, t) {
  let lo = 0;
  let hi = points.length - 1;
  if (t < points[0].t) return points[0].v;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid].t <= t) lo = mid; else hi = mid - 1;
  }
  return points[lo].v;
}

/**
 * Courbe de la valeur de la collection : les cartes possédées aujourd'hui, au prix de chaque jour.
 * Une valeur saisie (carte gradée, prix constaté) reste fixe ; une carte sans historique garde son prix actuel.
 */
export async function walletSeries(owned) {
  const prices = await loadPriceStore();
  const cards = Object.entries(owned).map(([id, mine]) => ({ manual: manualValue(mine), entry: prices[id] }));
  let history = {};
  try {
    history = await loadHistory(cards.filter((c) => c.manual === null).map((c) => c.entry?.idProduct));
  } catch (_) { /* hors ligne ou historique indisponible : les moyennes suffisent */ }
  let fixed = 0;
  const curves = [];
  let firstReal = Infinity;
  for (const { manual, entry } of cards) {
    const current = manual ?? priceValue(entry);
    if (current === null) continue;
    if (manual !== null) { fixed += manual; continue; }
    const real = history[entry.idProduct] ?? [];
    if (real.length) firstReal = Math.min(firstReal, real[0].t);
    const points = buildSeries(real, { current, avg30: entry.avg30, avg7: entry.avg7 });
    if (points.length > 1) curves.push(points); else fixed += current;
  }
  const days = [...new Set(curves.flatMap((c) => c.map((p) => p.t)))].sort((a, b) => a - b);
  if (!days.length) days.push(today());
  return days.map((t) => ({
    t,
    v: Math.round((fixed + curves.reduce((sum, c) => sum + valueAt(c, t), 0)) * 100) / 100,
    est: t < Math.min(firstReal, today()),
  }));
}

/** Courbe d'une carte à partir de son entrée de prix (getPrice). null tant qu'elle charge. */
export function useCardHistory(price, current) {
  const [points, setPoints] = useState(null);
  const id = price?.idProduct;
  useEffect(() => {
    let alive = true;
    setPoints(null);
    if (!(current > 0)) { setPoints([]); return undefined; }
    (async () => {
      let real = [];
      try { real = (await loadHistory([id]))[id] ?? []; } catch (_) { /* hors ligne : les moyennes suffisent */ }
      if (alive) setPoints(buildSeries(real, { current, avg30: price?.avg30, avg7: price?.avg7 }));
    })();
    return () => { alive = false; };
  }, [id, current, price?.avg30, price?.avg7]);
  return points;
}

/** Courbe d'un produit scellé (pas de moyennes chez Cardmarket : l'historique seul). */
export function useProductHistory(idProduct, current) {
  const [points, setPoints] = useState(null);
  useEffect(() => {
    let alive = true;
    setPoints(null);
    (async () => {
      let real = [];
      try { real = idProduct ? (await loadHistory([idProduct]))[idProduct] ?? [] : []; } catch (_) { /* hors ligne */ }
      if (alive) setPoints(current > 0 ? buildSeries(real, { current }) : []);
    })();
    return () => { alive = false; };
  }, [idProduct, current]);
  return points;
}

/** Courbe de la collection, recalculée quand la collection ou sa valeur change. */
export function useWalletHistory(owned, value) {
  const [points, setPoints] = useState(null);
  useEffect(() => {
    let alive = true;
    walletSeries(owned).then((p) => { if (alive) setPoints(p); }, () => { if (alive) setPoints([]); });
    return () => { alive = false; };
  }, [owned, value]);
  return points;
}

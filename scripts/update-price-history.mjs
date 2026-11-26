// Relevé quotidien des prix Cardmarket dans l'historique Supabase (table price_months,
// docs/supabase-price-history.sql) : de quoi tracer la courbe d'une carte, d'un produit ou d'une collection.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/update-price-history.mjs
//
// Lancé chaque jour par .github/workflows/price-history.yml. Relancer le même jour ne change rien.
import { download, robustPrice } from './cardmarket.mjs';

const URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHUNK = 5000;

async function record(day, products, cents) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${URL}/rest/v1/rpc/record_prices`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_day: day, p_products: products, p_cents: cents }),
    });
    if (res.ok) return res.json();
    // Table ou fonction absente : le script SQL n'a pas été exécuté dans Supabase, inutile de réessayer.
    if (res.status === 404) {
      throw new Error(`record_prices introuvable dans Supabase (HTTP 404) : exécute docs/supabase-price-history.sql dans le SQL Editor. ${await res.text()}`);
    }
    if (attempt >= 3) throw new Error(`record_prices : HTTP ${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

async function main() {
  if (!URL || !KEY) throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont nécessaires');
  const { priceGuides, createdAt } = await download('priceGuide/price_guide_6.json');
  const day = createdAt.slice(0, 10); // date du relevé Cardmarket (heure de Paris)
  const rows = priceGuides
    .map((g) => [g.idProduct, Math.round((robustPrice(g) ?? 0) * 100)])
    .filter(([, cents]) => cents > 0);
  if (rows.length < 10_000) throw new Error(`relevé suspect : ${rows.length} prix`);

  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    written += await record(day, part.map((r) => r[0]), part.map((r) => r[1]));
  }
  console.log(`Historique des prix ${day} : ${rows.length} produits cotés, ${written} nouveaux points.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });

-- Dexup — historique des prix Cardmarket (courbes des cartes, des produits et de la collection).
-- À exécuter une fois dans Supabase : SQL Editor → New query → coller → Run.
--
-- Une ligne par produit Cardmarket (idProduct) et par mois : les jours où le prix a changé d'au moins
-- 2 % (et d'au moins 2 centimes) et le prix ce jour-là, en centimes. Le premier jour relevé de chaque
-- mois est toujours gardé, pour qu'un mois se lise seul. ~70 000 produits cotés : ~130 Mo par an
-- dans le pire cas simulé (60 % des prix qui bougent chaque jour) ; Database → Usage pour suivre.
--
-- Lecture publique (ce sont des prix publics) ; seule l'action GitHub quotidienne écrit, avec la clé
-- service_role (scripts/update-price-history.mjs).

create table if not exists public.price_months (
  product integer not null,          -- idProduct Cardmarket
  month   date not null,             -- premier jour du mois
  days    smallint[] not null,       -- jours du mois (1–31)
  cents   integer[] not null,        -- prix en centimes, même ordre que days
  primary key (product, month)
);

alter table public.price_months enable row level security;

drop policy if exists "Prix lisibles par tous" on public.price_months;
create policy "Prix lisibles par tous" on public.price_months for select using (true);

-- Ajoute le relevé d'un jour : p_products[i] coûte p_cents[i] centimes le p_day.
create or replace function public.record_prices(p_day date, p_products integer[], p_cents integer[])
returns integer
language sql
security definer
set search_path = public
as $$
  with x as (
    select u.product, u.cents from unnest(p_products, p_cents) as u(product, cents) where u.cents > 0
  ), written as (
    insert into price_months as h (product, month, days, cents)
    select x.product, date_trunc('month', p_day)::date, array[extract(day from p_day)::smallint], array[x.cents]
    from x
    on conflict (product, month) do update
      set days = h.days || excluded.days, cents = h.cents || excluded.cents
      where h.days[cardinality(h.days)] < excluded.days[1]
        and abs(h.cents[cardinality(h.cents)] - excluded.cents[1]) >= greatest(2, h.cents[cardinality(h.cents)] / 50)
    returning 1
  )
  select count(*)::integer from written;
$$;

revoke all on function public.record_prices(date, integer[], integer[]) from public, anon, authenticated;
grant execute on function public.record_prices(date, integer[], integer[]) to service_role;

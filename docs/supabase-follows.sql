-- Dexup — abonnements entre collectionneurs.
-- À exécuter une fois dans Supabase : SQL Editor → New query → coller → Run.
--
-- Qui suit qui est public (comme sur la plupart des réseaux) : chacun peut lire les abonnements,
-- mais on ne peut suivre ou ne plus suivre qu'en son propre nom.

create table if not exists pokecollect_follows (
  follower   uuid not null references auth.users on delete cascade,
  followee   uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);

alter table pokecollect_follows enable row level security;

drop policy if exists "follows_read" on pokecollect_follows;
create policy "follows_read" on pokecollect_follows
  for select using (true);

drop policy if exists "follows_insert" on pokecollect_follows;
create policy "follows_insert" on pokecollect_follows
  for insert with check (auth.uid() = follower);

drop policy if exists "follows_delete" on pokecollect_follows;
create policy "follows_delete" on pokecollect_follows
  for delete using (auth.uid() = follower);

create index if not exists pokecollect_follows_followee on pokecollect_follows (followee);

-- Dexup — profils et communauté.
-- À exécuter une fois dans Supabase : SQL Editor → New query → coller → Run.
--
-- Un profil par compte. Lecture : tout le monde pour les profils publics, son propriétaire
-- pour le sien. Écriture : uniquement son propriétaire.

create table if not exists pokecollect_profiles (
  user_id      uuid primary key references auth.users on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_.]{3,20}$'),
  display_name text check (char_length(display_name) <= 40),
  bio          text check (char_length(bio) <= 200),
  avatar       text check (avatar is null or char_length(avatar) <= 120000),  -- image JPEG en data URL (≈ 256 px)
  banner       text check (banner is null or char_length(banner) <= 400000),  -- image JPEG en data URL (≈ 1200 × 400)
  is_public    boolean not null default true,
  settings     jsonb not null default '{}',   -- sections visibles (collection, listes, favoris, valeur)
  showcase     jsonb not null default '[]',   -- jusqu'à 3 cartes mises en avant
  collection   jsonb not null default '{}',   -- instantané publié : cartes possédées, listes, favoris
  stats        jsonb not null default '{}',   -- nombre de cartes, valeur…
  updated_at   timestamptz not null default now()
);

alter table pokecollect_profiles enable row level security;

drop policy if exists "profiles_read" on pokecollect_profiles;
create policy "profiles_read" on pokecollect_profiles
  for select using (is_public or auth.uid() = user_id);

drop policy if exists "profiles_insert" on pokecollect_profiles;
create policy "profiles_insert" on pokecollect_profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "profiles_update" on pokecollect_profiles;
create policy "profiles_update" on pokecollect_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "profiles_delete" on pokecollect_profiles;
create policy "profiles_delete" on pokecollect_profiles
  for delete using (auth.uid() = user_id);

create index if not exists pokecollect_profiles_public_recent
  on pokecollect_profiles (updated_at desc) where is_public;

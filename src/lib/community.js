// Profils et communauté : table Supabase `pokecollect_profiles` (voir docs/supabase-profiles.sql).
//
// Chaque profil contient un INSTANTANÉ public de la collection (cartes possédées, listes, favoris),
// republié par l'app quand la collection change : les visiteurs n'accèdent jamais aux données
// privées de pokecollect_data. En mode invité (développement), une base locale de démonstration
// remplace Supabase.
import { supabase } from '../utils/supabase';

const TABLE = 'pokecollect_profiles';
// La liste n'a besoin que des 3 premières cartes de la vitrine (elle peut en compter 9, avec photos).
const LIST_FIELDS = 'user_id, username, display_name, avatar, settings, stats, updated_at, s0:showcase->0, s1:showcase->1, s2:showcase->2';
export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
export const DEFAULT_SETTINGS = { collection: true, lists: true, favorites: true, value: true };

export class CommunityUnavailable extends Error {}

const fromRow = (r) => r && ({
  userId: r.user_id,
  username: r.username,
  displayName: r.display_name || r.username,
  bio: r.bio || '',
  avatar: r.avatar || null,
  banner: r.banner || null,
  isPublic: r.is_public ?? true,
  settings: { ...DEFAULT_SETTINGS, ...(r.settings || {}) },
  showcase: r.showcase || [r.s0, r.s1, r.s2].filter(Boolean),
  collection: r.collection || {},
  stats: r.stats || {},
  updatedAt: r.updated_at,
});

const toRow = (p) => {
  const row = {};
  if ('username' in p) row.username = p.username;
  if ('displayName' in p) row.display_name = p.displayName || null;
  if ('bio' in p) row.bio = p.bio || null;
  if ('avatar' in p) row.avatar = p.avatar;
  if ('banner' in p) row.banner = p.banner;
  if ('isPublic' in p) row.is_public = p.isPublic;
  if ('settings' in p) row.settings = p.settings;
  if ('showcase' in p) row.showcase = p.showcase;
  if ('collection' in p) row.collection = p.collection;
  if ('stats' in p) row.stats = p.stats;
  row.updated_at = new Date().toISOString();
  return row;
};

function check(error) {
  if (!error) return;
  // Table absente : le SQL de docs/supabase-profiles.sql n'a pas encore été exécuté.
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message)) {
    throw new CommunityUnavailable(error.message);
  }
  if (error.code === '23505') throw new Error('Ce pseudo est déjà pris.');
  if (error.code === '23514') throw new Error('Un champ est trop long ou invalide (pseudo : 3 à 20 lettres minuscules, chiffres, « _ » ou « . »).');
  throw new Error(error.message);
}

// ─── Base locale de démonstration (mode invité) ──────────────────────────────
const DEMO_KEY = 'dexup_demo_profiles';
const img = (set, n) => `https://images.pokemontcg.io/${set}/${n}.png`;
const snap = (set, n, name, setName) => ({ id: `${set}-${n}`, name, number: String(n), images: { small: img(set, n) }, set: { id: set, name: setName } });
const DEMO_PROFILES = [
  {
    user_id: 'demo-1', username: 'sacha.dex', display_name: 'Sacha', bio: 'Collection 151 et Évolutions Prismatiques. Toujours à la recherche des Évoli illustrations rares.',
    is_public: true, settings: DEFAULT_SETTINGS,
    showcase: [snap('sv3pt5', 199, 'Charizard ex', '151'), snap('sv3pt5', 205, 'Mew ex', '151'), snap('sv3pt5', 173, 'Pikachu', '151')],
    collection: {
      owned: Object.fromEntries([1, 4, 6, 25, 150, 151, 173, 199, 205].map((n) => [`sv3pt5-${n}`, 1])),
      lists: [{ id: 'l1', name: 'Recherchées', icon: 'master', cards: [snap('sv3pt5', 201, 'Venusaur ex', '151'), snap('sv3pt5', 202, 'Blastoise ex', '151')] }],
      favorites: [snap('sv3pt5', 199, 'Charizard ex', '151')],
    },
    stats: { cards: 9, sets: 1, value: 412.5 }, updated_at: '2026-11-18T10:00:00Z',
  },
  {
    user_id: 'demo-2', username: 'ondine_tcg', display_name: 'Ondine', bio: 'Vintage uniquement. Set de base presque complet.',
    is_public: true, settings: { ...DEFAULT_SETTINGS, value: false },
    showcase: [snap('base1', 2, 'Blastoise', 'Base'), snap('base1', 4, 'Charizard', 'Base'), snap('base1', 15, 'Venusaur', 'Base')],
    collection: { owned: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`base1-${i + 1}`, 1])), lists: [], favorites: [] },
    stats: { cards: 60, sets: 1, value: 1890 }, updated_at: '2026-11-17T18:30:00Z',
  },
];
const demoRead = () => {
  try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || [...DEMO_PROFILES]; } catch (_) { return [...DEMO_PROFILES]; }
};
const demoWrite = (rows) => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(rows)); } catch (_) {} };
let demoMode = !supabase;
/** Mode invité : la communauté tourne sur la base locale de démonstration. */
export function setDemoCommunity(on) { demoMode = on || !supabase; }
const isDemo = () => demoMode;

// ─── API ─────────────────────────────────────────────────────────────────────
export async function getMyProfile(userId) {
  if (isDemo()) return fromRow(demoRead().find((r) => r.user_id === userId));
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId).maybeSingle();
  check(error);
  return fromRow(data);
}

/** Crée ou met à jour le profil (champs fournis seulement). */
export async function saveMyProfile(userId, fields) {
  if (fields.username !== undefined && !USERNAME_RE.test(fields.username)) {
    throw new Error('Pseudo : 3 à 20 caractères, lettres minuscules, chiffres, « _ » ou « . ».');
  }
  const row = { user_id: userId, ...toRow(fields) };
  if (isDemo()) {
    const rows = demoRead();
    if (row.username && rows.some((r) => r.username === row.username && r.user_id !== userId)) throw new Error('Ce pseudo est déjà pris.');
    const i = rows.findIndex((r) => r.user_id === userId);
    const merged = { is_public: true, settings: DEFAULT_SETTINGS, showcase: [], collection: {}, stats: {}, ...(rows[i] || {}), ...row };
    if (i >= 0) rows[i] = merged; else rows.unshift(merged);
    demoWrite(rows);
    return fromRow(merged);
  }
  // Création : la ligne complète (le pseudo est obligatoire). Mise à jour : seulement les champs
  // fournis — un upsert partiel échouerait, car Postgres vérifie la ligne « à insérer » (sans
  // pseudo) avant de constater qu'elle existe déjà.
  const { data: existing, error: readError } = await supabase.from(TABLE).select('user_id').eq('user_id', userId).maybeSingle();
  check(readError);
  const { data, error } = existing
    ? await supabase.from(TABLE).update(row).eq('user_id', userId).select('*').single()
    : await supabase.from(TABLE).insert(row).select('*').single();
  check(error);
  return fromRow(data);
}

export async function deleteMyProfile(userId) {
  if (isDemo()) { demoWrite(demoRead().filter((r) => r.user_id !== userId)); return; }
  const { error } = await supabase.from(TABLE).delete().eq('user_id', userId);
  check(error);
}

/** Profils publics, les plus récemment actifs d'abord ; `query` cherche dans le pseudo et le nom. */
export async function listProfiles({ query = '', limit = 40 } = {}) {
  const q = query.trim().toLowerCase().replace(/[%_,()]/g, '');
  if (isDemo()) {
    return demoRead()
      .filter((r) => r.is_public && (!q || r.username.includes(q) || (r.display_name || '').toLowerCase().includes(q)))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, limit).map(fromRow);
  }
  let req = supabase.from(TABLE).select(LIST_FIELDS).eq('is_public', true).order('updated_at', { ascending: false }).limit(limit);
  if (q) req = req.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`);
  const { data, error } = await req;
  check(error);
  return (data || []).map(fromRow);
}

export async function getProfile(username) {
  if (isDemo()) return fromRow(demoRead().find((r) => r.username === username && (r.is_public || r.user_id === 'guest')));
  const { data, error } = await supabase.from(TABLE).select('*').eq('username', username).maybeSingle();
  check(error);
  return fromRow(data);
}

// ─── Instantané publié de la collection ──────────────────────────────────────
const cardSnapshot = (c) => c && ({
  id: c.id, name: c.name, number: c.number ?? '', detail: c.detail ?? undefined,
  images: c.images?.small ? { small: c.images.small } : {},
  set: c.set ? { id: c.set.id, name: c.set.label || c.set.name } : undefined,
  extra: c.extra,
});

/**
 * Ce que les visiteurs voient de la collection, selon les réglages du profil. Les cartes
 * possédées sont réduites à leur identifiant (et leur grade) ; les cartes perso et les listes
 * gardent de quoi s'afficher sans réseau.
 */
export function buildSnapshot({ owned, lists, favCards, customCards }, settings) {
  const snapshot = {};
  if (settings.collection) {
    snapshot.owned = Object.fromEntries(Object.entries(owned).map(([id, v]) => [
      id, v && typeof v === 'object' && v.graded ? { g: `${v.company} ${v.grade}` } : 1,
    ]));
    snapshot.custom = Object.values(customCards).filter((c) => owned[c.id]).map(cardSnapshot);
  }
  if (settings.lists) {
    snapshot.lists = Object.values(lists).map((l) => ({
      id: l.id, name: l.name, icon: l.icon, cards: Object.values(l.cards || {}).map(cardSnapshot),
    }));
  }
  if (settings.favorites) snapshot.favorites = Object.values(favCards).map(cardSnapshot);
  return snapshot;
}

export { cardSnapshot };

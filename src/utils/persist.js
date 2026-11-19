/**
 * Stockage persistant — double couche :
 *   1. SQLite local (sql.js + IndexedDB) → lecture rapide, offline
 *   2. Supabase (PostgreSQL cloud) → persistance serveur, survie au cache clear
 *
 * Seules les clés "utilisateur" (owned_cards, favorites, lists) sont
 * synchronisées vers Supabase. Le cache API ne quitte jamais le navigateur.
 */
import { getDb, persistDb } from './db';
import { supabase, getAuthUserId, SYNC_KEYS } from './supabase';

// ─── Lecture locale ───────────────────────────────────────────────────────────
export async function readStore(key) {
  try {
    const db = await getDb();
    const result = db.exec('SELECT value FROM kv_store WHERE key = ?', [key]);
    if (!result.length || !result[0].values.length) return null;
    return JSON.parse(result[0].values[0][0]);
  } catch (e) {
    console.warn('[persist] readStore error:', e);
    return null;
  }
}

// ─── Écriture locale + push Supabase (fire-and-forget) ───────────────────────
export async function writeStore(key, value) {
  try {
    const db = await getDb();
    const json = JSON.stringify(value);
    db.run('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)', [key, json]);
    await persistDb();

    if (SYNC_KEYS.has(key) && supabase) {
      (async () => {
        const userId = await getAuthUserId();
        if (!userId) return;
        supabase
          .from('pokecollect_data')
          .upsert({ user_id: userId, key, value: json, updated_at: Date.now() })
          .then(({ error }) => { if (error) console.warn('[sync] push error:', error.message); });
      })();
    }
  } catch (e) {
    console.warn('[persist] writeStore error:', e);
    throw e;
  }
}

// ─── Données locales rattachées à un compte ──────────────────────────────────
// La base locale (SQLite dans le navigateur) est partagée par tous les comptes qui se connectent
// sur l'appareil : on note à qui elle appartient, et on la vide quand un autre compte se connecte.
// Sans ça, un second compte héritait de la collection du premier… puis l'enregistrait comme la sienne.
const OWNER_KEY = 'pc_local_owner';

const readOwner = () => { try { return localStorage.getItem(OWNER_KEY); } catch (_) { return null; } };
const writeOwner = (id) => { try { if (id) localStorage.setItem(OWNER_KEY, id); else localStorage.removeItem(OWNER_KEY); } catch (_) {} };

/** Efface de l'appareil les données du compte (collection, favoris, listes, photos…). */
export async function clearLocalUserData() {
  const db = await getDb();
  const keys = [...SYNC_KEYS];
  db.run(`DELETE FROM kv_store WHERE key IN (${keys.map(() => '?').join(', ')})`, keys);
  await persistDb();
}

/**
 * À la connexion, avant d'afficher l'app : la base locale devient celle de `userId`.
 *   - Elle appartenait à un autre compte → vidée.
 *   - Le compte a des données en ligne → elles REMPLACENT les données locales (une clé absente en
 *     ligne est effacée localement).
 *   - Aucune donnée en ligne : on garde le local seulement s'il est déjà à ce compte (changements
 *     faits hors ligne), et on l'envoie. Sans propriétaire noté (installation d'avant ce correctif),
 *     il vient forcément d'un autre compte — l'app exige une connexion, et un compte qui a déjà
 *     enregistré quelque chose a des données en ligne : on le vide.
 * Hors ligne, l'app démarre avec les données locales si elles sont à ce compte.
 */
export async function syncLocalOwner(userId) {
  const previous = readOwner();
  if (previous && previous !== userId) await clearLocalUserData();
  if (!supabase || userId === 'guest') { writeOwner(userId); return; }
  try {
    const { data, error } = await supabase.from('pokecollect_data').select('key, value').eq('user_id', userId);
    if (error) throw error;
    const db = await getDb();
    if (data?.length) {
      const remote = new Map(data.filter((r) => SYNC_KEYS.has(r.key)).map((r) => [r.key, r.value]));
      for (const key of SYNC_KEYS) {
        if (remote.has(key)) db.run('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)', [key, remote.get(key)]);
        else db.run('DELETE FROM kv_store WHERE key = ?', [key]);
      }
      await persistDb();
      writeOwner(userId);
    } else if (previous === userId) {
      await pushAllToRemote();
    } else {
      await clearLocalUserData();
      writeOwner(userId);
    }
  } catch (e) {
    console.warn('[sync] chargement du compte impossible :', e?.message || e);
    // Hors ligne : on ne garde le local que s'il est bien à ce compte.
    if (previous !== userId) { await clearLocalUserData(); writeOwner(userId); }
  }
}

/** Déconnexion : rien du compte ne reste sur l'appareil (tout est déjà en ligne). */
export async function forgetLocalUser() {
  await pushAllToRemote().catch(() => {});
  await clearLocalUserData();
  writeOwner(null);
}

// ─── Pousse toutes les clés locales vers Supabase (sync forcée) ──────────────
export async function pushAllToRemote() {
  if (!supabase) return false;
  try {
    const userId = await getAuthUserId();
    if (!userId) return false;

    const db = await getDb();
    const keys = [...SYNC_KEYS];
    const result = db.exec(`SELECT key, value FROM kv_store WHERE key IN (${keys.map(() => '?').join(', ')})`, keys);
    if (!result.length || !result[0].values.length) return false;

    const rows = result[0].values.map(([key, value]) => ({
      user_id: userId,
      key,
      value,
      updated_at: Date.now(),
    }));

    const { error } = await supabase.from('pokecollect_data').upsert(rows);
    if (error) { console.warn('[sync] pushAll error:', error.message); return false; }
    return true;
  } catch (e) {
    console.warn('[sync] pushAll error:', e);
    return false;
  }
}

// ─── Supprime toutes les données distantes (reset complet) ───────────────────
export async function purgeRemote() {
  if (!supabase) return;
  const userId = await getAuthUserId();
  if (!userId) return;
  await supabase.from('pokecollect_data').delete().eq('user_id', userId);
}

/**
 * Client Supabase + helpers d'authentification email/password.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Lien reçu par email (réinitialisation du mot de passe) : lu avant que Supabase ne nettoie l'adresse.
const AUTH_LINK = new URLSearchParams(window.location.hash.replace(/^#/, ''));
/** L'app a été ouverte depuis un lien « mot de passe oublié » valide. */
export const recoveryLink = AUTH_LINK.get('type') === 'recovery';
/** Lien expiré ou déjà utilisé : message à afficher sur l'écran de connexion. */
export const authLinkError = AUTH_LINK.get('error') ? AUTH_LINK.get('error_code') || AUTH_LINK.get('error') : null;

function initSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.warn('[supabase] Init failed:', e.message);
    return null;
  }
}
export const supabase = initSupabase();

// ─── Clés synchronisées (jamais le cache API) ─────────────────────────────────
export const SYNC_KEYS = new Set(['owned_cards', 'favorite_cards', 'favorite_sets', 'custom_lists', 'favorite_products', 'owned_products', 'custom_cards', 'card_photos', 'recent_searches']);

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/**
 * Retourne l'ID de l'utilisateur connecté, ou null. Lu dans la session locale (getSession) et non
 * redemandé au serveur (getUser) : appelé à chaque écriture, getUser gardait le verrou de session
 * le temps d'un aller-retour réseau, et le rafraîchissement automatique du jeton échouait alors
 * (« Acquiring an exclusive Navigator LockManager lock … immediately failed »).
 */
export async function getAuthUserId() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/** Retourne la session en cours, ou null. */
export async function getSession() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/** Inscription. */
export async function signUp(email, password) {
  if (!supabase) return { error: { message: 'Supabase non configuré' } };
  return supabase.auth.signUp({ email, password });
}

/** Connexion. */
export async function signIn(email, password) {
  if (!supabase) return { error: { message: 'Supabase non configuré' } };
  return supabase.auth.signInWithPassword({ email, password });
}

/** Envoie l'email « mot de passe oublié » ; le lien ramène sur l'app pour choisir le nouveau. */
export async function resetPassword(email) {
  if (!supabase) return { error: { message: 'Supabase non configuré' } };
  return supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` });
}

/** Change le mot de passe du compte connecté (après le lien de réinitialisation). */
export async function updatePassword(password) {
  if (!supabase) return { error: { message: 'Supabase non configuré' } };
  return supabase.auth.updateUser({ password });
}

/** Déconnexion. */
export async function signOut() {
  if (!supabase) return;
  return supabase.auth.signOut();
}

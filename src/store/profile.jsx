import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useCollection } from './collection';
import { useWallet } from '../lib/prices';
import { setIdOf } from '../lib/tcg';
import {
  buildSnapshot, CommunityUnavailable, deleteMyProfile, getMyProfile, saveMyProfile, setDemoCommunity,
} from '../lib/community';

const Ctx = createContext(null);
export const useProfile = () => useContext(Ctx);

// Republication de la collection après une modification : on attend que la rafale de taps se calme.
const PUBLISH_DELAY_MS = 4000;

/**
 * Profil de l'utilisateur connecté. `status` : loading | none (pas encore de profil) | ready |
 * unavailable (table Supabase absente) | error. Tant que le profil est public, l'instantané de la
 * collection est republié à chaque changement.
 */
export function ProfileProvider({ userId, guest, children }) {
  const { ready, owned, lists, favCards, customCards } = useCollection();
  const wallet = useWallet(owned);
  const [state, setState] = useState({ status: 'loading', profile: null, error: null });
  const lastPublished = useRef(null);

  setDemoCommunity(guest);

  const load = useCallback(async () => {
    try {
      const profile = await getMyProfile(userId);
      lastPublished.current = profile ? JSON.stringify([profile.collection, profile.stats]) : null;
      setState({ status: profile ? 'ready' : 'none', profile, error: null });
    } catch (e) {
      setState({ status: e instanceof CommunityUnavailable ? 'unavailable' : 'error', profile: null, error: e.message });
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (fields) => {
    const profile = await saveMyProfile(userId, fields);
    setState({ status: 'ready', profile, error: null });
    return profile;
  }, [userId]);

  const remove = useCallback(async () => {
    await deleteMyProfile(userId);
    lastPublished.current = null;
    setState({ status: 'none', profile: null, error: null });
  }, [userId]);

  // Instantané public de la collection, selon les sections que le profil montre.
  const profile = state.profile;
  const settings = profile?.settings;
  const snapshot = useMemo(() => {
    if (!ready || !settings) return null;
    const collection = buildSnapshot({ owned, lists, favCards, customCards }, settings);
    const ids = Object.keys(owned);
    const stats = {
      cards: ids.length,
      sets: new Set(ids.map(setIdOf)).size,
      graded: Object.values(owned).filter((v) => v && typeof v === 'object' && v.graded).length,
      ...(settings.value && wallet && wallet.pending === 0 ? { value: Math.round(wallet.value * 100) / 100 } : {}),
    };
    return { collection, stats };
  }, [ready, settings, owned, lists, favCards, customCards, wallet]);

  useEffect(() => {
    if (state.status !== 'ready' || !profile?.isPublic || !snapshot) return undefined;
    const key = JSON.stringify([snapshot.collection, snapshot.stats]);
    if (key === lastPublished.current) return undefined;
    const timer = setTimeout(async () => {
      try {
        const saved = await saveMyProfile(userId, snapshot);
        lastPublished.current = key;
        setState((s) => ({ ...s, profile: { ...s.profile, collection: saved.collection, stats: saved.stats, updatedAt: saved.updatedAt } }));
      } catch (_) { /* hors ligne : republié au prochain changement */ }
    }, PUBLISH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.status, profile?.isPublic, snapshot, userId]);

  const value = useMemo(() => ({ ...state, userId, guest, save, remove, reload: load, snapshot }), [state, userId, guest, save, remove, load, snapshot]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

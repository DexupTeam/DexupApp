import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  getOwnedCards, toggleCard, setCardGrading,
  getFavoriteCards, toggleFavoriteCard,
  getFavoriteSets, toggleFavoriteSet,
  getFavoriteProducts, toggleFavoriteProduct,
  getOwnedProducts, toggleOwnedProduct,
  getCustomCards, saveCustomCard, deleteCustomCard, getCardPhotos, setCardPhoto,
} from '../utils/storage';
import { setCustomCards } from '../lib/extraCards';
import { getLists, createList, deleteList, renameList, addCardToList, removeCardFromList } from '../utils/lists';

const Ctx = createContext(null);
export const useCollection = () => useContext(Ctx);

const EMPTY = { owned: {}, favCards: {}, favSets: {}, favProducts: {}, ownedProducts: {}, lists: {}, customCards: {}, cardPhotos: {}, ready: false };

const flip = (id, value) => (map) => {
  const next = { ...map };
  if (next[id]) delete next[id]; else next[id] = value;
  return next;
};

export function CollectionProvider({ children }) {
  const [data, setData] = useState(EMPTY);
  const [activeCard, setActiveCard] = useState(null);
  // Cartes affichées par la vue qui a ouvert la fiche (dans son ordre) : flèches précédente / suivante.
  // dir : 0 = ouverture, -1 / 1 = on vient de la carte suivante / précédente (animation de la fiche).
  const [cardNav, setCardNav] = useState({ list: null, dir: 0 });
  const queue = useRef(Promise.resolve());

  const reload = useCallback(async () => {
    const [owned, favCards, favSets, favProducts, ownedProducts, lists, customCards, cardPhotos] = await Promise.all([
      getOwnedCards(), getFavoriteCards(), getFavoriteSets(), getFavoriteProducts(), getOwnedProducts(), getLists(),
      getCustomCards(), getCardPhotos(),
    ]);
    setCustomCards(customCards);
    setData({ owned, favCards, favSets, favProducts, ownedProducts, lists, customCards, cardPhotos, ready: true });
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Les écritures lisent puis réécrivent toute la clé : on les sérialise pour ne perdre aucun tap rapide.
  const write = useCallback((key, task, optimistic) => {
    if (optimistic) setData((d) => ({ ...d, [key]: optimistic(d[key]) }));
    queue.current = queue.current
      .then(task)
      .then((result) => { if (!optimistic) setData((d) => ({ ...d, [key]: { ...result } })); return result; })
      .catch((e) => { console.warn('[collection] write failed:', e); return reload(); });
    return queue.current;
  }, [reload]);

  const actions = useMemo(() => ({
    reload,
    openCard: (card, list) => { setActiveCard(card); setCardNav({ list: list?.length > 1 ? list : null, dir: 0 }); },
    stepCard: (card, dir) => { setActiveCard(card); setCardNav((n) => ({ ...n, dir })); },
    closeCard: () => { setActiveCard(null); setCardNav({ list: null, dir: 0 }); },
    toggleOwned: (cardId) => write('owned', () => toggleCard(cardId), flip(cardId, true)),
    setGrading: (cardId, grading) => write('owned', () => setCardGrading(cardId, grading)),
    toggleFavCard: (card) => write('favCards', () => toggleFavoriteCard(card), flip(card.id, card)),
    toggleFavSet: (set) => write('favSets', () => toggleFavoriteSet(set), flip(set.id, set)),
    toggleOwnedProduct: (id) => write('ownedProducts', () => toggleOwnedProduct(id), flip(id, true)),
    toggleFavProduct: (product) => write('favProducts', () => toggleFavoriteProduct(product), flip(product.id, product)),
    createList: (name, icon) => write('lists', () => createList(name, icon)),
    updateList: (id, name, icon) => write('lists', () => renameList(id, name, icon)),
    deleteList: (id) => write('lists', () => deleteList(id)),
    addToList: (listId, card) => write('lists', () => addCardToList(listId, {
      id: card.id, name: card.name, number: card.number, images: card.images,
      set: { id: card.set?.id, name: card.set?.name },
    })),
    removeFromList: (listId, cardId) => write('lists', () => removeCardFromList(listId, cardId)),
    // Carte perso : enregistrée puis ajoutée à la collection (avec son prix saisi, s'il y en a un).
    addCustomCard: async (card, { price, photo } = {}) => {
      await write('customCards', async () => { const all = await saveCustomCard(card); setCustomCards(all); return all; });
      if (photo) await write('cardPhotos', () => setCardPhoto(card.id, photo));
      await write('owned', async () => {
        await toggleCard(card.id);
        return setCardGrading(card.id, { graded: false, ...(card.lang ? { lang: card.lang } : {}), ...(price > 0 ? { price } : {}) });
      });
    },
    // Supprime une carte perso : de la collection, des listes et de la base perso.
    deleteCustomCard: async (cardId) => {
      await write('owned', async () => {
        const owned = await getOwnedCards();
        return owned[cardId] ? toggleCard(cardId) : owned;
      });
      await write('lists', async () => {
        let lists = await getLists();
        for (const list of Object.values(lists)) {
          if (list.cards?.[cardId]) lists = await removeCardFromList(list.id, cardId);
        }
        return lists;
      });
      await write('cardPhotos', () => setCardPhoto(cardId, null));
      await write('customCards', async () => { const all = await deleteCustomCard(cardId); setCustomCards(all); return all; });
    },
    setCardPhoto: (cardId, photo) => write('cardPhotos', () => setCardPhoto(cardId, photo)),
  }), [reload, write]);

  const value = useMemo(() => ({ ...data, activeCard, cardNav, ...actions }), [data, activeCard, cardNav, actions]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

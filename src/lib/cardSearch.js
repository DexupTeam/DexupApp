// Recherche locale dans une liste de cartes, en français comme en anglais.
// Les noms de cartes de l'API sont en anglais : « dracaufeu » cherche aussi « charizard »
// (table FR → EN des Pokémon, chargée une fois puis gardée en cache).
import { useEffect, useMemo, useState } from 'react';
import { getFrToEnMap } from '../utils/pokemonNames';

export const fold = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

let frToEn = null;

/**
 * Renvoie un test `(card, extraTexts) => boolean` pour la recherche `query` : nom anglais ou
 * français du Pokémon, numéro, détail (attaques des cartes chinoises) et `extraTexts` (noms
 * d'extension en français et en anglais, par exemple).
 */
export function useCardMatcher(query) {
  const [map, setMap] = useState(frToEn);
  useEffect(() => {
    if (map) return;
    getFrToEnMap().then((m) => { frToEn = m; setMap(m); }).catch(() => {});
  }, [map]);

  return useMemo(() => {
    const q = fold(query);
    if (!q) return () => true;
    // Noms anglais des Pokémon dont le nom français contient la recherche.
    const english = [];
    if (map && q.length >= 2) {
      for (const [fr, en] of Object.entries(map)) if (fold(fr).includes(q)) english.push(fold(en));
    }
    const number = q.replace(/^#/, '').replace(/^0+/, '');
    return (card, extraTexts = []) => {
      const name = fold(card.name);
      if (name.includes(q) || english.some((en) => name.includes(en))) return true;
      if (number && fold(card.number).replace(/^0+/, '') === number) return true;
      if (fold(card.detail).includes(q)) return true;
      return extraTexts.some((t) => fold(t).includes(q));
    };
  }, [query, map]);
}

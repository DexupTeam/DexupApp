import React, { useMemo, useState } from 'react';
import { SearchX } from 'lucide-react';
import { useCollection } from '../store/collection';
import { useLang } from '../utils/LanguageContext.jsx';
import { getLocalizedSetName } from '../utils/setNames';
import { setIdOf, sortCards, useSets } from '../lib/tcg';
import { useWallet } from '../lib/prices';
import { useCardMatcher } from '../lib/cardSearch';
import { CardsView } from './cards';
import { Empty, Pills, SearchField, ViewToggle, plural, usePersistedState } from './ui';

const SORTS = [
  { value: 'set', label: 'Extension' },
  { value: 'name', label: 'Nom' },
  { value: 'value', label: 'Valeur' },
];
const MINE = [
  { value: 'all', label: 'Toutes' },
  { value: 'have', label: 'Je l\'ai' },
  { value: 'missing', label: 'Il me manque' },
];


/**
 * Cartes d'un autre collectionneur, avec recherche (nom, numéro, extension), filtre par extension
 * et par ce que je possède moi-même, et tri par extension, nom ou valeur Cardmarket.
 */
export default function CardBrowser({ cards }) {
  const { owned } = useCollection();
  const { lang } = useLang();
  const { sets } = useSets();
  const [query, setQuery] = useState('');
  const [setFilter, setSetFilter] = useState('all');
  const [mine, setMine] = useState('all');
  const [sort, setSort] = useState('set');
  const [mode, setMode] = usePersistedState('pc_cards_view', 'grid');

  // Prix : demandés seulement quand on trie par valeur (une requête par carte la première fois).
  const priced = useMemo(() => (sort === 'value' ? Object.fromEntries(cards.map((c) => [c.id, 1])) : {}), [sort, cards]);
  const wallet = useWallet(priced);
  const values = sort === 'value' ? wallet?.values : undefined;

  const setMeta = useMemo(() => Object.fromEntries(sets.map((s, i) => [s.id, { ...s, rank: i }])), [sets]);
  const setName = (id, card) => (setMeta[id] ? getLocalizedSetName(setMeta[id].name, lang) : card?.set?.label || card?.set?.name || id.toUpperCase());

  // Extensions présentes, les plus récentes d'abord, avec leur nombre de cartes.
  const setOptions = useMemo(() => {
    const counts = {};
    for (const c of cards) counts[setIdOf(c.id)] = (counts[setIdOf(c.id)] || 0) + 1;
    return Object.entries(counts)
      .map(([id, count]) => ({ id, count, name: setName(id, cards.find((c) => setIdOf(c.id) === id)), rank: setMeta[id]?.rank ?? 9999 }))
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, setMeta, lang]);

  const matches = useCardMatcher(query);
  const shown = useMemo(() => {
    let list = cards.filter((c) => {
      const sid = setIdOf(c.id);
      if (setFilter !== 'all' && sid !== setFilter) return false;
      if (mine === 'have' && !owned[c.id]) return false;
      if (mine === 'missing' && owned[c.id]) return false;
      return matches(c, [setName(sid, c), c.set?.name]);
    });
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'value') list = [...list].sort((a, b) => (values?.[b.id] ?? -1) - (values?.[a.id] ?? -1) || a.name.localeCompare(b.name));
    else {
      // Par extension (les plus récentes d'abord), puis dans l'ordre des numéros.
      const bySet = {};
      for (const c of list) (bySet[setIdOf(c.id)] ||= []).push(c);
      list = Object.entries(bySet)
        .sort(([a], [b]) => (setMeta[a]?.rank ?? 9999) - (setMeta[b]?.rank ?? 9999))
        .flatMap(([, group]) => sortCards(group));
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, matches, setFilter, mine, sort, owned, values, setMeta, lang]);

  const filtered = query.trim() || setFilter !== 'all' || mine !== 'all';
  return (
    <>
      <div className="stack" style={{ gap: 10, marginBottom: 14 }}>
        <SearchField value={query} onChange={setQuery} placeholder="Nom (français ou anglais), numéro, extension" />
        <select className="input" value={setFilter} onChange={(e) => setSetFilter(e.target.value)} aria-label="Extension">
          <option value="all">Toutes les extensions ({cards.length})</option>
          {setOptions.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.count})</option>)}
        </select>
        <div className="row" style={{ gap: 8 }}>
          <select className="input grow" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Trier par" style={{ minWidth: 0 }}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>Trier par : {s.label.toLowerCase()}</option>)}
          </select>
          <ViewToggle mode={mode} onChange={setMode} />
        </div>
        <Pills value={mine} onChange={setMine} options={MINE} />
        <p className="tiny dim">
          {filtered ? `${plural(shown.length, 'carte')} sur ${cards.length}` : plural(cards.length, 'carte')}
          {sort === 'value' && wallet?.pending > 0 ? ` · prix en cours… ${wallet.pending} restante${wallet.pending > 1 ? 's' : ''}` : ''}
        </p>
      </div>
      {shown.length
        ? <CardsView cards={shown} mode={mode} caption="name" dimMissing={false} values={values} />
        : <Empty icon={SearchX} title="Aucune carte" text="Essaie une autre recherche ou un autre filtre." />}
    </>
  );
}

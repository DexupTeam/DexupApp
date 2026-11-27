import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Clock, Search as SearchIcon, SearchX, WifiOff, X } from '../components/icons';
import { getFrToEnMap, resolveSearchTerm } from '../utils/pokemonNames';
import { searchCards } from '../lib/tcg';
import { CardsView } from '../components/cards';
import { addRecentSearch, clearRecentSearches, getRecentSearches, removeRecentSearch } from '../utils/storage';
import { Empty, Loading, Page, Pills, SearchField, TopBar, plural } from '../components/ui';

const RARITIES = [
  { label: 'Toutes', value: null },
  { label: 'Commune', value: 'Common' },
  { label: 'Peu commune', value: 'Uncommon' },
  { label: 'Rare', value: 'Rare' },
  { label: 'Rare Holo', value: 'Rare Holo' },
  { label: 'Holo EX', value: 'Rare Holo EX' },
  { label: 'Holo GX', value: 'Rare Holo GX' },
  { label: 'Holo V', value: 'Rare Holo V' },
  { label: 'Ultra Rare', value: 'Rare Ultra' },
  { label: 'Promo', value: 'Promo' },
];

const IDLE = { status: 'idle', cards: [], total: 0, page: 1, term: '', translated: null };

export default function Search() {
  const { state } = useLocation();
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState(null);
  const [result, setResult] = useState(IDLE);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);
  const [recent, setRecent] = useState([]);

  useEffect(() => { getFrToEnMap(); getRecentSearches().then(setRecent); }, []);

  // Une recherche qui a donné des résultats entre dans l'historique quand on cesse de taper
  // (ou tout de suite avec Entrée) : pas de « sal », « sala »… à chaque lettre.
  const remember = (q) => { if (q.trim()) addRecentSearch(q).then(setRecent); };
  const found = result.status === 'done' && result.cards.length > 0;
  useEffect(() => {
    if (!found || !query.trim()) return undefined;
    const timer = setTimeout(() => remember(query), 1500);
    return () => clearTimeout(timer);
  }, [found, query]);

  useEffect(() => {
    const q = query.trim();
    const id = ++requestId.current;
    if (!q && !rarity) { setResult(IDLE); return; }

    const timer = setTimeout(async () => {
      setResult((r) => ({ ...r, status: 'loading' }));
      try {
        const term = q ? await resolveSearchTerm(q) : '';
        const { cards, total } = await searchCards({ name: term, rarity });
        if (id !== requestId.current) return;
        const translated = term && term.toLowerCase() !== q.toLowerCase() ? term : null;
        setResult({ status: 'done', cards, total, page: 1, term, translated });
      } catch (_) {
        if (id === requestId.current) setResult({ ...IDLE, status: 'error' });
      }
    }, q ? 450 : 0);
    return () => clearTimeout(timer);
  }, [query, rarity]);

  const loadMore = async () => {
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const page = result.page + 1;
      const { cards } = await searchCards({ name: result.term, rarity, page });
      if (id === requestId.current) setResult((r) => ({ ...r, cards: [...r.cards, ...cards], page }));
    } catch (_) { /* on garde les résultats déjà chargés */ }
    setLoadingMore(false);
  };

  const { status, cards, total, translated } = result;
  const remaining = total - cards.length;

  return (
    <Page>
      <TopBar title="Recherche" back={state?.focus ? "/" : undefined} />

      <div className="stack" style={{ gap: 12, marginBottom: 16 }}>
        <SearchField
          value={query} onChange={setQuery} placeholder="Nom du Pokémon (français ou anglais)"
          onSubmit={() => found && remember(query)}
          autoFocus={Boolean(state?.focus)}
        />
        <Pills options={RARITIES} value={rarity} onChange={setRarity} />
      </div>

      {status === 'idle' && recent.length > 0 && (
        <section className="recent" aria-label="Recherches récentes">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <p className="label" style={{ margin: 0 }}>Recherches récentes</p>
            <button className="link" onClick={() => clearRecentSearches().then(setRecent)}>Tout effacer</button>
          </div>
          <div className="card">
            {recent.map((r) => (
              <div key={r.q} className="recent-row">
                <button className="recent-go" onClick={() => setQuery(r.q)}>
                  <Clock size={18} /><span className="clamp1">{r.q}</span>
                </button>
                <button className="recent-del" aria-label={`Retirer « ${r.q} » des recherches récentes`} onClick={() => removeRecentSearch(r.q).then(setRecent)}>
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      {status === 'idle' && !recent.length && (
        <Empty
          icon={SearchIcon} title="Trouve n'importe quelle carte"
          text="Tape un nom — « Salamèche » fonctionne aussi bien que « Charmander » — ou choisis une rareté."
        />
      )}
      {status === 'loading' && <Loading label="Recherche en cours…" />}
      {status === 'error' && <Empty icon={WifiOff} title="Recherche impossible" text="Vérifie ta connexion internet puis réessaie." />}
      {status === 'done' && cards.length === 0 && (
        <Empty icon={SearchX} title="Aucun résultat" text="Vérifie l'orthographe ou essaie sans filtre de rareté." />
      )}

      {status === 'done' && cards.length > 0 && (
        <>
          <p className="small muted" style={{ marginBottom: 14 }}>
            {remaining > 0 ? `${cards.length} sur ${total} cartes` : plural(cards.length, 'carte')}
            {translated && <> · recherche traduite : <b style={{ color: 'var(--violet-ink)' }}>{translated}</b></>}
          </p>
          <CardsView cards={cards} caption="name" dimMissing={false} />
          {remaining > 0 && (
            <button className="btn btn-ghost btn-block" style={{ marginTop: 20 }} onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? <div className="spinner sm" /> : `Voir plus · ${remaining} restantes`}
            </button>
          )}
        </>
      )}
    </Page>
  );
}

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchX, WifiOff } from '../components/icons';
import { useCollection } from '../store/collection';
import { useLang } from '../utils/LanguageContext.jsx';
import { filterSets, getLocalizedSetName, resolveSetQuery } from '../utils/setNames';
import { ownedCountBySet, useSets } from '../lib/tcg';

// Logo de l'extension, ou son code quand elle n'en a pas (extensions chinoises).
function SetLogo({ set }) {
  return set.images?.logo
    ? <img src={set.images.logo} alt="" loading="lazy" />
    : <b style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)' }}>{set.code || set.id.toUpperCase()}</b>;
}
const setCode = (s) => (s.code || s.id).toUpperCase();
import {
  Empty, Loading, Page, Pills, Progress, SearchField, StarButton, Tappable, TopBar, ViewToggle,
  pct, usePersistedState,
} from '../components/ui';

export default function Sets() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const { owned, favSets, toggleFavSet } = useCollection();
  const { sets, loading, error, retry } = useSets();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [mode, setMode] = usePersistedState('pc_sets_view', 'list');

  const counts = useMemo(() => ownedCountBySet(owned), [owned]);
  const translated = useMemo(() => {
    const r = query.trim() ? resolveSetQuery(query) : null;
    return r?.wasFrench ? r.translated : null;
  }, [query]);

  const regionCount = useMemo(() => {
    const n = { cn: 0, ja: 0 };
    for (const s of sets) if (s.region) n[s.region]++;
    return n;
  }, [sets]);
  const shown = useMemo(() => {
    let list = filterSets(sets, query);
    if (!query.trim() && list.length) {
      // Les extensions chinoises et japonaises ont leur propre onglet : elles ne noient pas la liste principale.
      const region = { china: 'cn', japan: 'ja' }[scope] ?? null;
      if (scope !== 'started' && scope !== 'favs') list = list.filter((s) => (s.region ?? null) === region);
    }
    if (scope === 'started') list = list.filter((s) => counts[s.id]);
    if (scope === 'favs') list = list.filter((s) => favSets[s.id]);
    return list;
  }, [sets, query, scope, counts, favSets]);

  const open = (s) => navigate(`/sets/${s.id}`);

  return (
    <Page>
      <TopBar title="Extensions">
        <ViewToggle mode={mode} onChange={setMode} />
      </TopBar>

      <div className="stack" style={{ gap: 12, marginBottom: 16 }}>
        <SearchField value={query} onChange={setQuery} placeholder="Nom, série ou code (ex : 151, SV8)" />
        <Pills
          value={scope} onChange={setScope}
          options={[
            { value: 'all', label: 'Toutes', count: (sets.length - regionCount.cn - regionCount.ja) || undefined },
            { value: 'started', label: 'Entamées', count: Object.keys(counts).length },
            { value: 'favs', label: 'Favorites', count: Object.keys(favSets).length },
            { value: 'japan', label: 'Japon', count: regionCount.ja || undefined },
            { value: 'china', label: 'Chine', count: regionCount.cn || undefined },
          ]}
        />
        {translated && <p className="tiny muted">Recherche traduite : <b style={{ color: 'var(--violet-ink)' }}>{translated}</b></p>}
      </div>

      {loading && <Loading label="Chargement des extensions…" />}
      {error && (
        <Empty icon={WifiOff} title="Impossible de charger les extensions" text="Vérifie ta connexion internet puis réessaie.">
          <button className="btn btn-dark" onClick={retry}>Réessayer</button>
        </Empty>
      )}
      {!loading && !error && shown.length === 0 && (
        <Empty
          icon={SearchX} title="Aucune extension"
          text={scope === 'favs' ? "Touche l'étoile d'une extension pour la retrouver ici." : scope === 'started' ? 'Tu n\'as encore entamé aucune extension.' : 'Essaie un autre nom ou un code de set.'}
        />
      )}

      {mode === 'list' ? (
        <div className="stack">
          {shown.map((s) => {
            const n = counts[s.id] || 0;
            return (
              <Tappable key={s.id} onClick={() => open(s)}>
                <div className="thumb-box"><SetLogo set={s} /></div>
                <div className="grow">
                  <div className="row" style={{ gap: 6 }}>
                    <b className="clamp1">{getLocalizedSetName(s.name, lang)}</b>
                    <span className="tag tag-violet">{setCode(s)}</span>
                  </div>
                  <p className="tiny muted clamp1">{s.series} · {s.releaseDate}</p>
                  <div className="row" style={{ marginTop: 6 }}>
                    <div className="grow"><Progress value={n} total={s.total} /></div>
                    <span className="tiny muted" style={{ fontWeight: 600 }}>{n}/{s.total}</span>
                  </div>
                </div>
                <StarButton on={!!favSets[s.id]} onClick={() => toggleFavSet(s)} />
              </Tappable>
            );
          })}
        </div>
      ) : (
        <div className="set-grid">
          {shown.map((s) => {
            const n = counts[s.id] || 0;
            return (
              <Tappable key={s.id} className="set-cell" onClick={() => open(s)}>
                <span className="star"><StarButton on={!!favSets[s.id]} onClick={() => toggleFavSet(s)} /></span>
                <div className="logo"><SetLogo set={s} /></div>
                <b className="clamp2" style={{ fontSize: 14 }}>{getLocalizedSetName(s.name, lang)}</b>
                <Progress value={n} total={s.total} />
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="tag tag-violet">{setCode(s)}</span>
                  <span className="tiny muted" style={{ fontWeight: 600 }}>{n}/{s.total} · {pct(n, s.total)} %</span>
                </div>
              </Tappable>
            );
          })}
        </div>
      )}
    </Page>
  );
}

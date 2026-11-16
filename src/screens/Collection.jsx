import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, Layers, Plus, Trophy } from 'lucide-react';
import { useCollection } from '../store/collection';
import { useLang } from '../utils/LanguageContext.jsx';
import { getLocalizedSetName } from '../utils/setNames';
import { formatEuro, isGraded, loadCardsByIds, setIdOf, setLogoUrl, sortCards, useSets } from '../lib/tcg';
import { useWallet } from '../lib/prices';
import { CardsView } from '../components/cards';
import CustomCardSheet from '../components/CustomCardSheet';
import { CUSTOM_SET_ID } from '../lib/extraCards';
import { cardImage } from '../lib/photos';
import { Empty, Loading, Page, Segmented, Tappable, TopBar, ViewToggle, plural, usePersistedState } from '../components/ui';

const SORTS = [{ value: 'set', label: 'Par extension' }, { value: 'value', label: 'Par valeur' }];

// Charge une fois les données des cartes visées ; les cartes retirées ensuite restent affichées (grisées).
function useCardData(ids, ready) {
  const [state, setState] = useState({ map: {}, failed: [], loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!ready) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    loadCardsByIds(ids).then(({ map, failed }) => alive && setState({ map, failed, loading: false }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

function FailedSets({ failed, retry }) {
  if (!failed.length) return null;
  return (
    <div className="row msg msg-err" style={{ marginBottom: 14 }}>
      <span className="grow">
        {failed.length > 1 ? `${failed.length} extensions n'ont pas pu être chargées` : "1 extension n'a pas pu être chargée"} — des cartes manquent ci-dessous.
      </span>
      <button className="btn btn-dark btn-sm" onClick={retry}>Réessayer</button>
    </div>
  );
}

export function Collection() {
  const navigate = useNavigate();
  const { ready, owned, customCards, openCard } = useCollection();
  const [adding, setAdding] = useState(false);
  const { lang } = useLang();
  const { sets } = useSets();
  const [mode, setMode] = usePersistedState('pc_cards_view', 'grid');
  const [savedSort, setSort] = usePersistedState('pc_cards_sort', 'set');
  const [params] = useSearchParams();
  // Depuis « Valeur de la collection » (statistiques), on arrive directement sur le tri par valeur.
  const [sort, setSortState] = useState(params.get('sort') === 'value' ? 'value' : savedSort);
  const changeSort = (v) => { setSortState(v); setSort(v); };
  const { map: loaded, failed, loading, retry } = useCardData(Object.keys(owned), ready);
  // Les cartes perso viennent du store (pas du réseau) : toujours à jour, même juste après un ajout.
  const map = useMemo(() => {
    const all = { ...loaded };
    for (const [id, card] of Object.entries(customCards)) if (owned[id]) all[id] = card;
    return all;
  }, [loaded, customCards, owned]);
  const wallet = useWallet(owned);
  const values = wallet?.values;

  // Les plus chères d'abord ; les cartes non évaluées à la fin.
  const byValue = useMemo(() => (
    sort === 'value' && values
      ? Object.values(map).sort((a, b) => (values[b.id] ?? -1) - (values[a.id] ?? -1) || a.name.localeCompare(b.name))
      : []
  ), [sort, values, map]);

  const groups = useMemo(() => {
    const meta = Object.fromEntries(sets.map((s) => [s.id, s]));
    const bySet = {};
    for (const card of Object.values(map)) (bySet[setIdOf(card.id)] ||= []).push(card);
    return Object.entries(bySet)
      .map(([sid, cards]) => ({
        sid,
        cards: sid === CUSTOM_SET_ID ? cards.sort((a, b) => a.name.localeCompare(b.name)) : sortCards(cards),
        name: meta[sid] ? getLocalizedSetName(meta[sid].name, lang) : cards[0].set?.name ?? sid.toUpperCase(),
        // Les cartes perso en premier (les groupes sont triés par date de sortie croissante).
        date: sid === CUSTOM_SET_ID ? '0000' : meta[sid]?.releaseDate ?? cards[0].set?.releaseDate ?? sid,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [map, sets, lang]);

  const total = Object.keys(owned).length;

  return (
    <Page>
      <TopBar title="Ma collection" back="/binder">
        <button className="icon-btn" onClick={() => setAdding(true)} aria-label="Ajouter une carte perso" title="Carte absente de la base">
          <Plus size={21} />
        </button>
        {total > 0 && <ViewToggle mode={mode} onChange={setMode} />}
      </TopBar>
      {adding && <CustomCardSheet onClose={() => setAdding(false)} onAdded={(card) => openCard(card)} />}

      {(!ready || loading) && <Loading label="Chargement de ta collection…" />}
      {ready && !loading && <FailedSets failed={failed} retry={retry} />}
      {ready && !loading && groups.length === 0 && !failed.length && (
        <Empty icon={Layers} title="Aucune carte pour l'instant" text="Ouvre une extension et touche le + des cartes que tu possèdes.">
          <button className="btn btn-violet" onClick={() => navigate('/sets')}>Parcourir les extensions</button>
        </Empty>
      )}

      {ready && !loading && groups.length > 0 && (
        <>
          <div style={{ marginBottom: 12 }}><Segmented options={SORTS} value={sort} onChange={changeSort} /></div>
          <p className="small muted" style={{ marginBottom: 12 }}>
            {sort === 'value'
              ? [
                plural(total, 'carte'),
                wallet && formatEuro(wallet.value),
                wallet?.pending > 0 ? `actualisation des prix… ${wallet.pending} restante${wallet.pending > 1 ? 's' : ''}` : 'de la plus chère à la moins chère',
              ].filter(Boolean).join(' · ')
              : `${plural(total, 'carte')} · ${plural(groups.length, 'extension')} · triées par date de sortie`}
          </p>
          {sort === 'value' && (values
            ? <CardsView cards={byValue} mode={mode} caption="name" values={values} />
            : <Loading label="Calcul des valeurs…" />)}
          {sort === 'set' && groups.map((g) => (
            <section key={g.sid}>
              <button className="group-head" onClick={() => navigate(`/sets/${g.sid}`)}>
                <img src={setLogoUrl(g.sid)} alt="" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />
                <span className="h2 clamp1">{g.name}</span>
                <span className="tag">{g.cards.length}</span>
              </button>
              <CardsView cards={g.cards} mode={mode} caption="number" />
            </section>
          ))}
        </>
      )}
    </Page>
  );
}

export function Graded() {
  const { ready, owned, openCard, cardPhotos, customCards } = useCollection();
  const [closed, setClosed] = useState({});
  const gradedIds = useMemo(() => Object.keys(owned).filter((id) => isGraded(owned[id])), [owned]);
  const { map: loaded, failed, loading, retry } = useCardData(gradedIds, ready);
  const map = useMemo(() => ({ ...loaded, ...customCards }), [loaded, customCards]);

  const sections = useMemo(() => {
    const byCompany = {};
    for (const id of gradedIds) {
      const card = map[id];
      if (!card) continue;
      (byCompany[owned[id].company || 'Autres'] ||= []).push({ card, grade: owned[id].grade });
    }
    return Object.entries(byCompany)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([company, items]) => ({
        company,
        items: items.sort((x, y) => parseFloat(y.grade) - parseFloat(x.grade) || x.card.name.localeCompare(y.card.name)),
      }));
  }, [gradedIds, map, owned]);

  return (
    <Page>
      <TopBar title="Cartes gradées" back="/binder" />

      {(!ready || loading) && <Loading label="Chargement des grades…" />}
      {ready && !loading && <FailedSets failed={failed} retry={retry} />}
      {ready && !loading && sections.length === 0 && !failed.length && (
        <Empty icon={Trophy} title="Aucune carte gradée" text="Ouvre la fiche d'une carte que tu possèdes, puis « Ajouter un grade »." />
      )}

      {ready && !loading && sections.length > 0 && (
        <div className="stack" style={{ gap: 18 }}>
          <p className="small muted">{plural(gradedIds.length, 'carte')} · {plural(sections.length, 'société')}</p>
          {sections.map(({ company, items }) => {
            const open = !closed[company];
            return (
              <section key={company}>
                <button
                  className="row" style={{ width: '100%', marginBottom: 10 }} aria-expanded={open}
                  onClick={() => setClosed((c) => ({ ...c, [company]: open }))}
                >
                  <Trophy size={19} color="var(--gold)" />
                  <span className="h2 grow" style={{ textAlign: 'left' }}>{company}</span>
                  <span className="tag">{items.length}</span>
                  <ChevronDown size={18} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                </button>
                {open && (
                  <div className="stack">
                    {items.map(({ card, grade }) => (
                      <Tappable key={card.id} onClick={() => openCard(card)}>
                        <img className="card-thumb" src={cardImage(card, cardPhotos) ?? undefined} alt="" loading="lazy" />
                        <div className="grow">
                          <b className="clamp1">{card.name}</b>
                          <p className="small muted clamp1">#{card.number} · {card.set?.name}</p>
                        </div>
                        <span className="tag tag-gold" style={{ height: 34, padding: '0 12px', fontSize: 15, fontFamily: 'var(--display)' }}>{grade}</span>
                      </Tappable>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </Page>
  );
}

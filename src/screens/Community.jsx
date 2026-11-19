import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Heart, Layers, ListChecks, Lock, SearchX, Users, WifiOff } from 'lucide-react';
import { useCollection } from '../store/collection';
import { useProfile } from '../store/profile';
import { CommunityUnavailable, getProfile, listProfiles } from '../lib/community';
import { loadCardsByIds, setIdOf, useSets } from '../lib/tcg';
import { Avatar, ProfileHeader, Showcase, profileStats } from '../components/profile';
import { CardPlaceholder, CardsView } from '../components/cards';
import { PokeBall } from '../components/PokeBall';
import { Empty, Loading, Page, SearchField, Segmented, Tappable, TopBar, plural } from '../components/ui';

function ShowcaseThumbs({ cards }) {
  if (!cards?.length) return null;
  return (
    <span className="profile-row-cards" aria-hidden="true">
      {cards.slice(0, 3).map((c) => (
        <span key={c.id}>{c.images?.small ? <img src={c.images.small} alt="" loading="lazy" /> : <CardPlaceholder card={c} />}</span>
      ))}
    </span>
  );
}

// ─── Liste des collectionneurs ───────────────────────────────────────────────
export default function Community() {
  const navigate = useNavigate();
  const { profile: me, status: myStatus } = useProfile();
  const [query, setQuery] = useState('');
  const [state, setState] = useState({ loading: true, profiles: [], error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    // Petite attente pendant la frappe : une requête par pause, pas par lettre.
    const timer = setTimeout(() => {
      listProfiles({ query })
        .then((profiles) => alive && setState({ loading: false, profiles, error: null }))
        .catch((e) => alive && setState({ loading: false, profiles: [], error: e instanceof CommunityUnavailable ? 'unavailable' : 'network' }));
    }, query ? 300 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, attempt]);

  const { loading, profiles, error } = state;
  return (
    <Page>
      <TopBar title="Communauté">
        <button className="avatar-btn" style={{ borderRadius: '50%', padding: 0, overflow: 'hidden' }} onClick={() => navigate('/profile')} aria-label="Mon profil">
          <Avatar profile={me} size={42} />
        </button>
      </TopBar>

      {/* Pas encore de profil : on invite à le créer (sinon, la photo en haut à droite y mène). */}
      {myStatus === 'none' && (
        <Tappable className="list-row" onClick={() => navigate('/profile')} style={{ marginBottom: 12 }}>
          <Avatar profile={me} size={46} />
          <div className="grow" style={{ minWidth: 0 }}>
            <b className="clamp1">{me ? me.displayName : 'Crée ton profil'}</b>
            <p className="small muted clamp1">{me ? `@${me.username} · ${me.isPublic ? 'profil public' : 'profil privé'}` : 'Photo, bannière, tes 3 plus belles cartes'}</p>
          </div>
          <span className="link">{me ? 'Mon profil' : 'Créer'}</span>
        </Tappable>
      )}

      <div style={{ marginBottom: 14 }}>
        <SearchField value={query} onChange={setQuery} placeholder="Chercher un collectionneur" />
      </div>

      {loading && !profiles.length && <Loading />}
      {error === 'unavailable' && <Empty icon={Users} title="Communauté bientôt disponible" text="Les profils ne sont pas encore activés sur le serveur." />}
      {error === 'network' && (
        <Empty icon={WifiOff} title="Communauté indisponible" text="Vérifie ta connexion internet puis réessaie.">
          <button className="btn btn-dark" onClick={() => setAttempt((n) => n + 1)}>Réessayer</button>
        </Empty>
      )}
      {!loading && !error && !profiles.length && (
        <Empty icon={query ? SearchX : Users} title={query ? 'Aucun collectionneur' : 'Personne pour l\'instant'} text={query ? 'Essaie un autre pseudo.' : 'Sois le premier à rendre ton profil public.'} />
      )}

      <div className="stack">
        {profiles.map((p) => (
          <Tappable key={p.userId} onClick={() => navigate(`/community/${p.username}`)}>
            <Avatar profile={p} size={46} />
            <div className="grow" style={{ minWidth: 0 }}>
              <b className="clamp1">{p.displayName}{me?.userId === p.userId && <span className="tiny muted"> · toi</span>}</b>
              <p className="small muted clamp1">@{p.username}</p>
              <p className="tiny dim clamp1" style={{ marginTop: 2 }}>{profileStats(p).join(' · ')}</p>
            </div>
            <ShowcaseThumbs cards={p.showcase} />
          </Tappable>
        ))}
      </div>
    </Page>
  );
}

// ─── Profil d'un collectionneur ──────────────────────────────────────────────
function OwnedCards({ collection }) {
  const { sets } = useSets();
  const [state, setState] = useState({ loading: true, cards: [], failed: [] });
  const ids = useMemo(() => Object.keys(collection.owned || {}), [collection.owned]);

  useEffect(() => {
    let alive = true;
    setState({ loading: true, cards: [], failed: [] });
    // Les cartes perso du collectionneur sont publiées avec leur description ; les autres se chargent.
    const custom = new Map((collection.custom || []).map((c) => [c.id, c]));
    loadCardsByIds(ids.filter((id) => !custom.has(id))).then(({ map, failed }) => {
      if (alive) setState({ loading: false, cards: [...Object.values(map), ...custom.values()], failed });
    });
    return () => { alive = false; };
  }, [ids, collection.custom]);

  // Les extensions les plus récentes d'abord, comme la page des extensions.
  const order = useMemo(() => Object.fromEntries(sets.map((s, i) => [s.id, i])), [sets]);
  const sorted = useMemo(() => [...state.cards].sort((a, b) => (
    (order[setIdOf(a.id)] ?? 9999) - (order[setIdOf(b.id)] ?? 9999) || a.name.localeCompare(b.name)
  )), [state.cards, order]);

  if (state.loading) return <Loading label="Chargement de sa collection…" />;
  if (!sorted.length) return <Empty icon={Layers} title="Aucune carte" />;
  return (
    <>
      {state.failed.length > 0 && <p className="tiny dim" style={{ marginBottom: 10 }}>Certaines extensions n'ont pas pu être chargées.</p>}
      <CardsView cards={sorted} caption="name" dimMissing={false} />
    </>
  );
}

function Lists({ lists }) {
  const [open, setOpen] = useState(null);
  if (!lists?.length) return <Empty icon={ListChecks} title="Aucune liste" />;
  const current = lists.find((l) => l.id === open);
  if (current) {
    return (
      <>
        <button className="link" style={{ marginBottom: 12 }} onClick={() => setOpen(null)}>← Toutes ses listes</button>
        <h3 className="h2" style={{ marginBottom: 12 }}>{current.name}</h3>
        {current.cards.length ? <CardsView cards={current.cards} caption="name" dimMissing={false} /> : <Empty title="Liste vide" />}
      </>
    );
  }
  return (
    <div className="stack">
      {lists.map((l) => (
        <Tappable key={l.id} onClick={() => setOpen(l.id)}>
          <PokeBall id={l.icon} size={36} />
          <div className="grow"><b className="clamp1">{l.name}</b><p className="small muted">{plural(l.cards.length, 'carte')}</p></div>
          <ShowcaseThumbs cards={l.cards} />
        </Tappable>
      ))}
    </div>
  );
}

export function PublicProfile() {
  const { username } = useParams();
  const { profile: me } = useProfile();
  const { owned } = useCollection();
  const [state, setState] = useState({ loading: true, profile: null, error: null });
  const [tab, setTab] = useState(null);

  useEffect(() => {
    let alive = true;
    setState({ loading: true, profile: null, error: null });
    getProfile(username)
      .then((profile) => alive && setState({ loading: false, profile, error: null }))
      .catch((e) => alive && setState({ loading: false, profile: null, error: e.message }));
    return () => { alive = false; };
  }, [username]);

  const { loading, profile, error } = state;
  const isMe = profile && me?.userId === profile.userId;
  const collection = profile?.collection || {};
  const tabs = profile ? [
    collection.owned && { value: 'collection', label: 'Cartes' },
    collection.lists && { value: 'lists', label: 'Listes' },
    collection.favorites && { value: 'favorites', label: 'Favoris' },
  ].filter(Boolean) : [];
  const active = tabs.find((t) => t.value === tab)?.value ?? tabs[0]?.value;

  // Cartes de ce collectionneur que je possède aussi.
  const inCommon = useMemo(() => (
    isMe ? 0 : Object.keys(collection.owned || {}).filter((id) => owned[id]).length
  ), [collection.owned, owned, isMe]);

  return (
    <Page>
      <TopBar title={profile ? profile.displayName : `@${username}`} back="/community" />
      {loading && <Loading />}
      {!loading && (error || !profile) && (
        <Empty icon={Lock} title="Profil introuvable" text={error || 'Ce profil n\'existe pas ou n\'est pas public.'} />
      )}
      {profile && (
        <>
          <ProfileHeader profile={profile} />
          {!isMe && inCommon > 0 && <p className="small muted" style={{ margin: '-6px 0 16px' }}>{plural(inCommon, 'carte')} en commun avec toi</p>}

          {profile.showcase.length > 0 && (
            <section style={{ marginBottom: 22 }}>
              <Showcase cards={profile.showcase} />
            </section>
          )}

          {tabs.length > 0 ? (
            <>
              {tabs.length > 1 && <div style={{ marginBottom: 14 }}><Segmented options={tabs} value={active} onChange={setTab} /></div>}
              {active === 'collection' && <OwnedCards collection={collection} />}
              {active === 'lists' && <Lists lists={collection.lists} />}
              {active === 'favorites' && (collection.favorites.length
                ? <CardsView cards={collection.favorites} caption="name" dimMissing={false} />
                : <Empty icon={Heart} title="Aucun favori" />)}
            </>
          ) : (
            <Empty icon={Lock} title="Classeur privé" text={`${profile.displayName} ne montre pas sa collection.`} />
          )}
        </>
      )}
    </Page>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Heart, Layers, ListChecks, Lock, SearchX, Users, WifiOff } from 'lucide-react';
import { useCollection } from '../store/collection';
import { useProfile } from '../store/profile';
import { loadCardsByIds } from '../lib/tcg';
import { CommunityUnavailable, getFollowerCount, getProfile, listProfiles, listProfilesByIds } from '../lib/community';
import { Avatar, FollowButton, ProfileHeader, SHOWCASE_MAX, ShareButton, Showcase, TeamBadge, profileStats } from '../components/profile';
import { CardPlaceholder } from '../components/cards';
import CardBrowser from '../components/CardBrowser';
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
  const { profile: me, status: myStatus, following, followsStatus } = useProfile();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState(null); // following | all ; null = choix par défaut
  const [state, setState] = useState({ loading: true, profiles: [], error: null });
  const [attempt, setAttempt] = useState(0);
  // Par défaut : les comptes suivis s'il y en a, sinon tout le monde.
  const view = scope ?? (following.size > 0 ? 'following' : 'all');
  const followingKey = [...following].sort().join(',');

  useEffect(() => {
    if (followsStatus === 'loading') return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    // Petite attente pendant la frappe : une requête par pause, pas par lettre.
    const timer = setTimeout(() => {
      const q = query.trim().toLowerCase();
      const request = view === 'following'
        ? listProfilesByIds([...following]).then((list) => list.filter((p) => !q || p.username.includes(q) || p.displayName.toLowerCase().includes(q)))
        : listProfiles({ query });
      request
        .then((profiles) => alive && setState({ loading: false, profiles, error: null }))
        .catch((e) => alive && setState({ loading: false, profiles: [], error: e instanceof CommunityUnavailable ? 'unavailable' : 'network' }));
    }, query ? 300 : 0);
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, attempt, view, followingKey, followsStatus]);

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

      <div className="stack" style={{ gap: 10, marginBottom: 14 }}>
        {followsStatus !== 'unavailable' && (
          <Segmented
            value={view} onChange={setScope}
            options={[{ value: 'following', label: `Suivis${following.size ? ` (${following.size})` : ''}` }, { value: 'all', label: 'Tous' }]}
          />
        )}
        <SearchField value={query} onChange={setQuery} placeholder={view === 'following' ? 'Chercher parmi tes abonnements' : 'Chercher un collectionneur'} />
      </div>

      {loading && !profiles.length && <Loading />}
      {error === 'unavailable' && <Empty icon={Users} title="Communauté bientôt disponible" text="Les profils ne sont pas encore activés sur le serveur." />}
      {error === 'network' && (
        <Empty icon={WifiOff} title="Communauté indisponible" text="Vérifie ta connexion internet puis réessaie.">
          <button className="btn btn-dark" onClick={() => setAttempt((n) => n + 1)}>Réessayer</button>
        </Empty>
      )}
      {!loading && !error && !profiles.length && (view === 'following' && !query ? (
        <Empty icon={Users} title="Tu ne suis personne" text="Ouvre le profil d'un collectionneur et touche « Suivre » pour le retrouver ici.">
          <button className="btn btn-dark" onClick={() => setScope('all')}>Voir tous les collectionneurs</button>
        </Empty>
      ) : (
        <Empty icon={query ? SearchX : Users} title={query ? 'Aucun collectionneur' : 'Personne pour l\'instant'} text={query ? 'Essaie un autre pseudo.' : 'Sois le premier à rendre ton profil public.'} />
      ))}

      <div className="stack">
        {profiles.map((p) => (
          <Tappable key={p.userId} onClick={() => navigate(`/community/${p.username}`)}>
            <Avatar profile={p} size={46} />
            <div className="grow" style={{ minWidth: 0 }}>
              <b className="row" style={{ gap: 5, minWidth: 0 }}>
                <span className="clamp1">{p.displayName}</span>
                <TeamBadge profile={p} compact />
                {me?.userId === p.userId && <span className="tiny muted" style={{ flexShrink: 0 }}>· toi</span>}
              </b>
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

  if (state.loading) return <Loading label="Chargement de sa collection…" />;
  if (!state.cards.length) return <Empty icon={Layers} title="Aucune carte" />;
  return (
    <>
      {state.failed.length > 0 && <p className="tiny dim" style={{ marginBottom: 10 }}>Certaines extensions n'ont pas pu être chargées.</p>}
      <CardBrowser cards={state.cards} />
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
        {current.cards.length ? <CardBrowser cards={current.cards} /> : <Empty title="Liste vide" />}
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
  const [followers, setFollowers] = useState(null);

  useEffect(() => {
    let alive = true;
    setState({ loading: true, profile: null, error: null });
    setFollowers(null);
    getProfile(username)
      .then((profile) => alive && setState({ loading: false, profile, error: null }))
      .catch((e) => alive && setState({ loading: false, profile: null, error: e.message }));
    return () => { alive = false; };
  }, [username]);

  const { loading, profile, error } = state;
  const isMe = profile && me?.userId === profile.userId;

  useEffect(() => {
    if (!profile) return undefined;
    let alive = true;
    getFollowerCount(profile.userId).then((n) => alive && setFollowers(n)).catch(() => {});
    return () => { alive = false; };
  }, [profile]);
  const collection = profile?.collection || {};
  // En vitrine : les cartes choisies par le collectionneur, sinon ses favoris.
  const hasShowcase = profile?.showcase.length > 0;
  const favorites = collection.favorites || [];
  const featured = hasShowcase ? profile.showcase : favorites;
  // Sous la vitrine : ses cartes possédées, ses listes, et ses favoris s'ils ne sont pas déjà en vitrine.
  const tabs = profile ? [
    Object.keys(collection.owned || {}).length > 0 && { value: 'collection', label: 'Cartes possédées' },
    collection.lists?.length > 0 && { value: 'lists', label: 'Listes' },
    hasShowcase && favorites.length > 0 && { value: 'favorites', label: 'Favoris' },
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
          <ProfileHeader
            profile={profile} followers={followers}
            action={(
              <>
                <FollowButton profile={profile} onChange={(follow) => setFollowers((n) => (n ?? 0) + (follow ? 1 : -1))} />
                <ShareButton profile={profile} />
              </>
            )}
          />
          {!isMe && inCommon > 0 && <p className="small muted" style={{ margin: '-6px 0 16px' }}>{plural(inCommon, 'carte')} en commun avec toi</p>}

          {featured.length > 0 ? (
            <section className="section" style={{ marginTop: 6 }}>
              <h2 className="h2" style={{ marginBottom: 12 }}>{hasShowcase ? 'Vitrine' : 'Favoris'}</h2>
              <Showcase cards={featured} max={hasShowcase ? SHOWCASE_MAX : Infinity} />
            </section>
          ) : !tabs.length && (
            <Empty icon={Heart} title="Rien à montrer pour l'instant" text={`${profile.displayName} n'a encore mis aucune carte en avant.`} />
          )}

          {tabs.length > 0 && (
            <section className="section">
              {tabs.length > 1
                ? <div style={{ marginBottom: 14 }}><Segmented options={tabs} value={active} onChange={setTab} /></div>
                : <h2 className="h2" style={{ marginBottom: 12 }}>{tabs[0].label}</h2>}
              {active === 'collection' && <OwnedCards collection={collection} />}
              {active === 'lists' && <Lists lists={collection.lists} />}
              {active === 'favorites' && <CardBrowser cards={favorites} />}
            </section>
          )}
        </>
      )}
    </Page>
  );
}

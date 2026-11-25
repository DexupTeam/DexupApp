import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Check, ChevronRight, Share2, UserCheck, UserPlus, Users, WifiOff, Instagram, XSocial } from './icons';
import { SOCIALS } from '../lib/socials';
import { useCollection } from '../store/collection';
import { useProfile } from '../store/profile';
import { useLang } from '../utils/LanguageContext.jsx';
import { getLocalizedSetName } from '../utils/setNames';
import { formatEuro, setLogoUrl, useSets } from '../lib/tcg';
import { cardImage } from '../lib/photos';
import { isTeam } from '../data/team';
import { CardPlaceholder } from './cards';
import { CardName } from '../lib/cardNames';
import Logo from './Logo';
import { Empty, Loading, Sheet, Tappable, plural } from './ui';
import { getFollowers, listProfilesByIds } from '../lib/community';

/** Photo de profil, ou initiale sur fond neutre. */
export function Avatar({ profile, size = 44 }) {
  const initial = (profile?.displayName || profile?.username || '?').trim().charAt(0).toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {profile?.avatar ? <img src={profile.avatar} alt="" /> : profile ? initial : <Logo size={size * 0.7} />}
    </span>
  );
}

/** Badge « Dexup Team » des comptes de l'équipe (`compact` : icône seule, pour les listes). */
export function TeamBadge({ profile, compact }) {
  if (!isTeam(profile?.userId)) return null;
  return (
    <span className={`team-badge${compact ? ' is-compact' : ''}`} title="Membre de l'équipe Dexup">
      <BadgeCheck size={compact ? 15 : 13} />
      {!compact && 'Dexup Team'}
    </span>
  );
}

/** Statistiques d'un profil : nombre de cartes, d'extensions, valeur si elle est montrée. */
export function profileStats(profile) {
  const s = profile?.stats || {};
  return [
    s.cards != null && plural(s.cards, 'carte'),
    s.sets != null && plural(s.sets, 'extension'),
    profile?.settings?.value !== false && s.value > 0 && formatEuro(s.value),
  ].filter(Boolean);
}

/** Lien public d'un profil (l'app est routée par le « # » de l'adresse). */
export const profileUrl = (profile) => `${window.location.origin}/#/community/${profile.username}`;

/** Bouton de partage : feuille de partage du téléphone, sinon copie du lien. */
export function ShareButton({ profile }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = profileUrl(profile);
    const text = `Le classeur Pokémon de ${profile.displayName} sur Dexup`;
    if (navigator.share) {
      try { await navigator.share({ title: `${profile.displayName} (@${profile.username})`, text, url }); return; } catch (e) {
        if (e?.name === 'AbortError') return; // partage annulé par l'utilisateur
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) { window.prompt('Lien du profil', url); }
  };
  return (
    <button className="icon-btn" onClick={share} aria-label={copied ? 'Lien copié' : 'Partager le profil'} title={copied ? 'Lien copié' : 'Partager'}>
      {copied ? <Check size={20} /> : <Share2 size={20} />}
    </button>
  );
}

/**
 * Suivre / ne plus suivre un collectionneur. Rien pour son propre profil, ni tant que la table
 * des abonnements n'existe pas. `onChange(follow)` : après un changement réussi.
 */
export function FollowButton({ profile, onChange }) {
  const { userId, following, followsStatus, toggleFollow } = useProfile();
  const [error, setError] = useState(false);
  if (!profile || profile.userId === userId || followsStatus === 'unavailable' || followsStatus === 'loading') return null;
  const on = following.has(profile.userId);
  const click = async () => {
    setError(false);
    // Pas `onChange?.(await toggleFollow(…))` : sans onChange, l'argument ne serait jamais évalué.
    try {
      const follow = await toggleFollow(profile.userId);
      onChange?.(follow);
    } catch (_) { setError(true); }
  };
  return (
    <button
      className={`btn btn-sm follow-btn ${on ? 'btn-ghost' : 'btn-violet'}`} onClick={click} aria-pressed={on}
      aria-label={on ? `Ne plus suivre ${profile.displayName}` : `Suivre ${profile.displayName}`}
      title={error ? 'Échec, réessaie' : undefined}
    >
      {on ? <UserCheck size={16} /> : <UserPlus size={16} />}
      <span className="follow-label">{on ? 'Suivi' : 'Suivre'}</span>
    </button>
  );
}

/** L'extension préférée du collectionneur : logo et nom, ouvre l'extension. */
function FavoriteSet({ setId }) {
  const navigate = useNavigate();
  const { sets } = useSets();
  const { lang } = useLang();
  const set = sets.find((s) => s.id === setId);
  if (!set) return null;
  const logo = set.images?.logo ?? (set.code ? null : setLogoUrl(set.id));
  return (
    <button className="fav-set" onClick={() => navigate(`/sets/${set.id}`)}>
      <span className="tiny dim">Set préféré</span>
      {logo ? <img src={logo} alt="" loading="lazy" /> : <b className="tiny" style={{ fontFamily: 'var(--mono)' }}>{set.code}</b>}
      <b className="small clamp1">{getLocalizedSetName(set.name, lang)}</b>
    </button>
  );
}

/** Les abonnés d'un collectionneur : ceux qui ont un profil public, puis le nombre des autres. */
function FollowersSheet({ profile, total, onClose }) {
  const navigate = useNavigate();
  const { userId } = useProfile();
  const [state, setState] = useState({ loading: true, list: [], error: false });

  useEffect(() => {
    let alive = true;
    getFollowers(profile.userId)
      .then((ids) => listProfilesByIds(ids).then((list) => {
        // Dans l'ordre des abonnements, les plus récents d'abord.
        const rank = new Map(ids.map((id, i) => [id, i]));
        return list.sort((a, b) => rank.get(a.userId) - rank.get(b.userId));
      }))
      .then((list) => alive && setState({ loading: false, list, error: false }))
      .catch(() => alive && setState({ loading: false, list: [], error: true }));
    return () => { alive = false; };
  }, [profile.userId]);

  const { loading, list, error } = state;
  const hidden = Math.max(0, (total ?? 0) - list.length);
  const open = (p) => { onClose(); navigate(p.userId === userId ? '/profile' : `/community/${p.username}`); };
  return (
    <Sheet title={total != null ? plural(total, 'abonné') : 'Abonnés'} onClose={onClose} tall>
      {loading && <Loading />}
      {error && <Empty icon={WifiOff} title="Liste indisponible" text="Vérifie ta connexion internet puis réessaie." />}
      {!loading && !error && !list.length && !hidden && (
        <Empty icon={Users} title="Aucun abonné pour l'instant" text={`Personne ne suit encore ${profile.displayName}.`} />
      )}
      <div className="stack" style={{ gap: 8 }}>
        {list.map((p) => (
          <Tappable key={p.userId} onClick={() => open(p)}>
            <Avatar profile={p} size={42} />
            <div className="grow" style={{ minWidth: 0 }}>
              <b className="row" style={{ gap: 5, minWidth: 0 }}>
                <span className="clamp1">{p.displayName}</span>
                <TeamBadge profile={p} compact />
                {p.userId === userId && <span className="tiny muted" style={{ flexShrink: 0 }}>· toi</span>}
              </b>
              <p className="small muted clamp1">@{p.username}</p>
            </div>
            {/* Suivre depuis la liste sans ouvrir le profil. */}
            <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}><FollowButton profile={p} /></span>
          </Tappable>
        ))}
      </div>
      {!loading && !error && hidden > 0 && (
        <p className="tiny dim" style={{ textAlign: 'center', marginTop: 14 }}>
          {list.length ? 'Et ' : ''}{plural(hidden, 'abonné')} au profil privé ou sans profil
        </p>
      )}
    </Sheet>
  );
}

/**
 * Bannière, photo, nom, pseudo, bio et statistiques. `action` : bouton à droite du nom (partage),
 * `children` : boutons sous les statistiques.
 */
const SOCIAL_ICONS = { x: XSocial, instagram: Instagram };

// Liens X / Instagram du profil (pseudos rangés dans settings) : logo seul, à gauche du partage.
export function SocialLinks({ settings }) {
  return SOCIALS.filter((s) => settings?.[s.key] && s.re.test(settings[s.key])).map((s) => {
    const Icon = SOCIAL_ICONS[s.key];
    return (
      <a
        key={s.key} className="icon-btn" href={s.url(settings[s.key])} target="_blank" rel="noopener noreferrer"
        aria-label={`${s.label} : @${settings[s.key]}`} title={`@${settings[s.key]}`}
      >
        <Icon size={19} />
      </a>
    );
  });
}

export function ProfileHeader({ profile, action, followers, children }) {
  const [showFollowers, setShowFollowers] = useState(false);
  return (
    <div className="profile-head">
      <div className="profile-banner">{profile.banner && <img src={profile.banner} alt="" />}</div>
      <div className="profile-id">
        <Avatar profile={profile} size={112} />
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 className="h1 clamp2" style={{ fontSize: 26 }}>{profile.displayName}</h1>
          <p className="row" style={{ gap: "4px 8px", minWidth: 0, flexWrap: "wrap" }}>
            <span className="small muted clamp1">@{profile.username}</span>
            <TeamBadge profile={profile} />
          </p>
        </div>
        {action && <div className="profile-action row" style={{ gap: 8 }}>{action}</div>}
      </div>
      {profile.bio && <p className="profile-bio">{profile.bio}</p>}
      {/* Statistiques à gauche, set préféré à droite sur la même ligne (en dessous si la place manque). */}
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {followers != null && (
          <button className="tag tag-btn" onClick={() => setShowFollowers(true)} aria-label={`Voir les ${plural(followers, 'abonné')}`}>
            {plural(followers, 'abonné')} <ChevronRight size={11} />
          </button>
        )}
        {profileStats(profile).map((s) => <span key={s} className="tag">{s}</span>)}
        {!profile.isPublic && <span className="tag tag-gold">Profil privé</span>}
        {profile.settings?.favoriteSet && <FavoriteSet setId={profile.settings.favoriteSet} />}
      </div>
      {children && <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>{children}</div>}
      {showFollowers && <FollowersSheet profile={profile} total={followers} onClose={() => setShowFollowers(false)} />}
    </div>
  );
}

/** Cartes mises en avant (vitrine, jusqu'à 9) ; un clic ouvre la fiche. `empty` : contenu si aucune carte. */
export const SHOWCASE_MAX = 9;
export function Showcase({ cards, empty, max = SHOWCASE_MAX }) {
  const { openCard, cardPhotos } = useCollection();
  if (!cards?.length) return empty ?? null;
  return (
    <div className="showcase">
      {cards.slice(0, max).map((card) => {
        // Une photo perso est publiée avec la carte : elle prime sur l'image officielle.
        const image = card.images?.small || cardImage(card, cardPhotos);
        return (
          <button key={card.id} className="showcase-card" onClick={() => openCard(card, cards.slice(0, max))} aria-label={`${card.name} — voir la fiche`}>
            <span className="showcase-img">{image ? <img src={image} alt="" loading="lazy" /> : <CardPlaceholder card={card} />}</span>
            <b className="clamp1"><CardName card={card} /></b>
            {card.set?.name && <span className="tiny muted clamp1">{card.set.name}</span>}
          </button>
        );
      })}
    </div>
  );
}

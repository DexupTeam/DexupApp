import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Share2, UserCheck, UserPlus } from 'lucide-react';
import { useCollection } from '../store/collection';
import { useProfile } from '../store/profile';
import { useLang } from '../utils/LanguageContext.jsx';
import { getLocalizedSetName } from '../utils/setNames';
import { formatEuro, setLogoUrl, useSets } from '../lib/tcg';
import { cardImage } from '../lib/photos';
import { CardPlaceholder } from './cards';
import Logo from './Logo';
import { plural } from './ui';

/** Photo de profil, ou initiale sur fond neutre. */
export function Avatar({ profile, size = 44 }) {
  const initial = (profile?.displayName || profile?.username || '?').trim().charAt(0).toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {profile?.avatar ? <img src={profile.avatar} alt="" /> : profile ? initial : <Logo size={size * 0.7} />}
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
    try { onChange?.(await toggleFollow(profile.userId)); } catch (_) { setError(true); }
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

/**
 * Bannière, photo, nom, pseudo, bio et statistiques. `action` : bouton à droite du nom (partage),
 * `children` : boutons sous les statistiques.
 */
export function ProfileHeader({ profile, action, followers, children }) {
  return (
    <div className="profile-head">
      <div className="profile-banner">{profile.banner && <img src={profile.banner} alt="" />}</div>
      <div className="profile-id">
        <Avatar profile={profile} size={112} />
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 className="h1 clamp2" style={{ fontSize: 26 }}>{profile.displayName}</h1>
          <p className="small muted clamp1">@{profile.username}</p>
        </div>
        {action && <div className="profile-action row" style={{ gap: 8 }}>{action}</div>}
      </div>
      {profile.bio && <p className="profile-bio">{profile.bio}</p>}
      {profile.settings?.favoriteSet && <FavoriteSet setId={profile.settings.favoriteSet} />}
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {followers != null && <span className="tag">{plural(followers, 'abonné')}</span>}
        {profileStats(profile).map((s) => <span key={s} className="tag">{s}</span>)}
        {!profile.isPublic && <span className="tag tag-gold">Profil privé</span>}
      </div>
      {children && <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>{children}</div>}
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
          <button key={card.id} className="showcase-card" onClick={() => openCard(card)} aria-label={`${card.name} — voir la fiche`}>
            <span className="showcase-img">{image ? <img src={image} alt="" loading="lazy" /> : <CardPlaceholder card={card} />}</span>
            <b className="clamp1">{card.name}</b>
            {card.set?.name && <span className="tiny muted clamp1">{card.set.name}</span>}
          </button>
        );
      })}
    </div>
  );
}

import React from 'react';
import { useCollection } from '../store/collection';
import { formatEuro } from '../lib/tcg';
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

/** Bannière, photo, nom, pseudo, bio et statistiques. `children` : boutons sous le nom. */
export function ProfileHeader({ profile, children }) {
  return (
    <div className="profile-head">
      <div className="profile-banner">{profile.banner && <img src={profile.banner} alt="" />}</div>
      <div className="profile-id">
        <Avatar profile={profile} size={84} />
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 className="h1 clamp1" style={{ fontSize: 26 }}>{profile.displayName}</h1>
          <p className="small muted clamp1">@{profile.username}</p>
        </div>
      </div>
      {profile.bio && <p className="profile-bio">{profile.bio}</p>}
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {profileStats(profile).map((s) => <span key={s} className="tag">{s}</span>)}
        {!profile.isPublic && <span className="tag tag-gold">Profil privé</span>}
      </div>
      {children && <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>{children}</div>}
    </div>
  );
}

/** Les trois cartes mises en avant ; un clic ouvre la fiche. `empty` : contenu si aucune carte. */
export function Showcase({ cards, empty }) {
  const { openCard, cardPhotos } = useCollection();
  if (!cards?.length) return empty ?? null;
  return (
    <div className="showcase">
      {cards.slice(0, 3).map((card) => {
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

import React, { useState } from 'react';
import { Check, Minus, Plus, Star, Trophy } from 'lucide-react';
import { useCollection } from '../store/collection';
import { getGradingInfo } from '../utils/storage';
import { formatEuro } from '../lib/tcg';
import { cardImage } from '../lib/photos';

/** Carte sans image (extension chinoise, carte perso sans photo) : son nom sur un dos de carte. */
export function CardPlaceholder({ card }) {
  return (
    <span className="card-ph">
      <b className="clamp2">{card.name}</b>
      {card.detail && <span className="clamp2">{card.detail}</span>}
      {card.set?.code && <i>{card.set.code}</i>}
    </span>
  );
}

/**
 * Numéro affiché d'une carte : « #025 ». Sans numéro (extensions chinoises), son prix Cardmarket,
 * qui distingue le mieux les variantes d'une même carte ; sinon ce qui la décrit.
 */
export const cardLabel = (card) => {
  if (card.number) return `#${card.number}`;
  if (card.marketPrice?.trend > 0) return formatEuro(card.marketPrice.trend);
  if (card.extra === 'cn' || card.extra === 'ja') return 'Prix inconnu';
  return card.set?.label || '—';
};

// `value` : undefined = prix non affiché, null = carte non évaluée.
const priceLabel = (value) => (value == null ? 'Non évaluée' : formatEuro(value));

function useCardState(card) {
  const { owned, favCards, cardPhotos, toggleOwned, openCard } = useCollection();
  const grading = getGradingInfo(owned[card.id]);
  return {
    image: cardImage(card, cardPhotos),
    isOwned: !!owned[card.id],
    isFav: !!favCards[card.id],
    grading,
    open: () => openCard(card),
    // Retirer une carte efface son grade, sa langue et son prix saisi : on passe par la fiche pour confirmer.
    quickToggle: () => (grading || owned[card.id]?.lang || owned[card.id]?.price ? openCard(card) : toggleOwned(card.id)),
  };
}

function ToggleButton({ card, isOwned, onToggle, onRemove, inline }) {
  if (onRemove) {
    return (
      <button
        className={inline ? 'icon-btn' : 'ctile-toggle is-remove'}
        style={inline ? { color: 'var(--danger)' } : undefined}
        aria-label={`Retirer ${card.name} de la liste`}
        onClick={(e) => { e.stopPropagation(); onRemove(card); }}
      >
        <Minus size={18} />
      </button>
    );
  }
  return (
    <button
      className={inline ? `icon-btn${isOwned ? ' is-violet' : ''}` : `ctile-toggle${isOwned ? ' is-on' : ''}`}
      aria-pressed={isOwned}
      aria-label={isOwned ? `Retirer ${card.name} de ma collection` : `Ajouter ${card.name} à ma collection`}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
    >
      {isOwned ? <Check size={18} strokeWidth={3} /> : <Plus size={18} />}
    </button>
  );
}

function CardTile({ card, caption, onRemove, dim, value }) {
  const { image, isOwned, isFav, grading, open, quickToggle } = useCardState(card);
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`ctile${isOwned || !dim ? '' : ' is-missing'}`}>
      <button className={`ctile-img${loaded || !image ? ' is-loaded' : ''}`} onClick={open} aria-label={`${card.name} — voir la fiche`}>
        {image
          ? <img src={image} alt="" loading="lazy" onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} />
          : <CardPlaceholder card={card} />}
        {isFav && <span className="ctile-fav"><Star size={11} fill="currentColor" /></span>}
        {grading && <span className="ctile-grade">{grading.company} {grading.grade}</span>}
      </button>
      <ToggleButton card={card} isOwned={isOwned} onToggle={quickToggle} onRemove={onRemove} />
      <div className="ctile-cap">
        {caption === 'name' ? (
          <>
            <b className="clamp1">{card.name}</b>
            <span className="clamp1">{value !== undefined ? priceLabel(value) : card.set?.label || card.set?.name}</span>
          </>
        ) : (
          <span className="clamp1">{cardLabel(card)}</span>
        )}
      </div>
    </div>
  );
}

function CardRow({ card, caption, onRemove, dim, value }) {
  const { image, isOwned, isFav, grading, open, quickToggle } = useCardState(card);
  const setName = card.set?.label || card.set?.name;
  const meta = caption === 'name'
    ? `${cardLabel(card)}${setName ? ` · ${setName}` : ''}`
    : `${cardLabel(card)} · ${card.rarity || '—'}`;
  return (
    <div
      className="list-row tap" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) open(); }}
    >
      {image ? (
        <img
          className="card-thumb" src={image} alt="" loading="lazy"
          style={isOwned || !dim ? undefined : { filter: 'grayscale(1)', opacity: 0.5 }}
        />
      ) : <span className="card-thumb card-ph card-ph-sm"><b className="clamp2">{card.name}</b></span>}
      <div className="grow">
        <b className="clamp1">{card.name}</b>
        <p className="small muted clamp1">{meta}</p>
        <div className="row" style={{ gap: 6, marginTop: 4 }}>
          {grading && <span className="tag tag-gold"><Trophy size={11} /> {grading.company} {grading.grade}</span>}
          {isFav && <span className="tag tag-gold"><Star size={11} fill="currentColor" /> Favori</span>}
        </div>
      </div>
      {value !== undefined && <b className={value == null ? 'small dim' : undefined} style={{ fontFamily: 'var(--mono)', fontSize: 13, whiteSpace: 'nowrap' }}>{priceLabel(value)}</b>}
      <ToggleButton card={card} isOwned={isOwned} onToggle={quickToggle} onRemove={onRemove} inline />
    </div>
  );
}

/**
 * Grille ou liste de cartes. `caption` : 'number' (dans un set) ou 'name' (résultats mélangés).
 * `dimMissing` grise les cartes non possédées (inutile dans des résultats de recherche).
 * `onRemove` remplace le bouton d'ajout par un bouton de retrait (édition d'une liste).
 * `values` ({ identifiant → valeur en € }) affiche la valeur de chaque carte.
 */
export function CardsView({ cards, mode = 'grid', caption = 'name', onRemove, dimMissing = true, values }) {
  const valueOf = (c) => (values ? values[c.id] ?? null : undefined);
  if (mode === 'list') {
    return (
      <div className="stack">
        {cards.map((c) => <CardRow key={c.id} card={c} caption={caption} onRemove={onRemove} dim={dimMissing} value={valueOf(c)} />)}
      </div>
    );
  }
  return (
    <div className="card-grid">
      {cards.map((c) => <CardTile key={c.id} card={c} caption={caption} onRemove={onRemove} dim={dimMissing} value={valueOf(c)} />)}
    </div>
  );
}

export function filterByOwnership(cards, owned, filter) {
  if (filter === 'owned') return cards.filter((c) => owned[c.id]);
  if (filter === 'missing') return cards.filter((c) => !owned[c.id]);
  return cards;
}

export const OWNERSHIP_FILTERS = [
  { value: 'all', label: 'Toutes' },
  { value: 'owned', label: 'Possédées' },
  { value: 'missing', label: 'Manquantes' },
];

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, ChartLine, Layers, Newspaper, Search, ShoppingBag } from '../components/icons';
import { useCollection } from '../store/collection';
import { useLang } from '../utils/LanguageContext.jsx';
import { getLocalizedSetName } from '../utils/setNames';
import { formatEuro, isGraded, ownedCountBySet, useSets } from '../lib/tcg';
import { useWallet } from '../lib/prices';
import { useProfile } from '../store/profile';
import { Avatar } from '../components/profile';
import { Page, Progress, pct, plural } from '../components/ui';
import { EventsSheet, NewsSheet, StatsSheet } from '../components/sheets';

// Fait défiler le nombre de 0 jusqu'à sa valeur au premier affichage.
function useCountUp(target, duration = 600) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) { setValue(0); return undefined; }
    const start = performance.now();
    let raf = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function SetChip({ set, owned, lang, onClick }) {
  return (
    <button className="set-chip" onClick={onClick}>
      <div className="logo"><img src={set.images?.logo} alt="" loading="lazy" /></div>
      <b className="clamp1">{getLocalizedSetName(set.name, lang)}</b>
      <Progress value={owned} total={set.total} />
      <span className="tiny muted">{owned} / {set.total} · {pct(owned, set.total)} %</span>
    </button>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { owned } = useCollection();
  const { lang } = useLang();
  const { sets } = useSets();
  const [sheet, setSheet] = useState(null);
  const wallet = useWallet(owned);
  const shownTotal = useCountUp(Object.keys(owned).length);

  const counts = useMemo(() => ownedCountBySet(owned), [owned]);
  const total = Object.keys(owned).length;
  const graded = useMemo(() => Object.values(owned).filter(isGraded).length, [owned]);
  const setNames = useMemo(
    () => ({ ...Object.fromEntries(sets.map((s) => [s.id, getLocalizedSetName(s.name, lang)])), custom: 'Cartes perso' }),
    [sets, lang]
  );
  const inProgress = useMemo(
    () => sets
      .filter((s) => counts[s.id] && counts[s.id] < s.total)
      .sort((a, b) => counts[b.id] / b.total - counts[a.id] / a.total)
      .slice(0, 12),
    [sets, counts]
  );
  const latest = sets.slice(0, 8);
  const goSet = (s) => navigate(`/sets/${s.id}`);
  const close = () => setSheet(null);
  // iOS n'ouvre le clavier que pour un champ focalisé pendant le tap : un champ temporaire le garde ouvert
  // le temps que la page Recherche affiche le sien (autoFocus), qui reprend le focus.
  const openSearch = () => {
    const tmp = document.createElement('input');
    tmp.setAttribute('aria-hidden', 'true');
    tmp.style.cssText = 'position:fixed;top:0;left:0;opacity:0;height:0;font-size:16px;';
    document.body.appendChild(tmp);
    tmp.focus();
    setTimeout(() => tmp.remove(), 1000);
    navigate('/search', { state: { focus: true } });
  };

  return (
    <Page>
      <header className="topbar">
        <h1 className="brand">Dexup</h1>
        <button className="avatar-btn" style={{ borderRadius: '50%', padding: 0, overflow: 'hidden' }} onClick={() => navigate('/profile')} aria-label="Mon profil">
          <Avatar profile={profile} size={42} />
        </button>
      </header>

      {/* Téléphone : la recherche n'est plus dans la barre du bas, elle s'ouvre d'ici. */}
      <button type="button" className="field home-search" onClick={openSearch}>
        <Search size={19} />
        <span>Rechercher une carte</span>
      </button>

      <button className="hero" onClick={() => setSheet('stats')} aria-label="Voir mes statistiques">
        <span className="hero-go"><ArrowUpRight size={20} /></span>
        <p style={{ fontWeight: 600, opacity: 0.9 }}>Ma collection</p>
        <p className="hero-num">{shownTotal}</p>
        <p style={{ opacity: 0.9 }}>{total > 1 ? 'cartes possédées' : 'carte possédée'}</p>
        <div className="hero-stats">
          <span className="hero-chip"><b>{Object.keys(counts).length}</b>{Object.keys(counts).length > 1 ? 'sets entamés' : 'set entamé'}</span>
          <span className="hero-chip"><b>{graded}</b>{graded > 1 ? 'gradées' : 'gradée'}</span>
          {total > 0 && <span className="hero-chip"><b>{wallet ? formatEuro(wallet.value) : '…'}</b>valeur</span>}
        </div>
      </button>

      <div className="tiles" style={{ marginTop: 12 }}>
        <button className="tile tile-white" onClick={() => navigate('/binder/collection')}>
          <Layers size={28} />
          <div><b>Mes cartes</b><span>{plural(total, 'carte')}</span></div>
        </button>
        <button className="tile tile-sky" onClick={() => setSheet('news')}>
          <Newspaper size={28} />
          <div><b>Actualités</b><span>Le TCG en direct</span></div>
        </button>
        <button className="tile tile-peach" onClick={() => setSheet('events')}>
          <CalendarDays size={28} />
          <div><b>Agenda</b><span>Salons et sorties</span></div>
        </button>
        <button className="tile tile-mint" onClick={() => navigate('/products')}>
          <ShoppingBag size={28} />
          <div><b>Produits</b><span>Boosters, ETB, displays</span></div>
        </button>
        <button className="tile" onClick={() => navigate('/finance')}>
          <ChartLine size={28} />
          <div><b>Finance</b><span>{total > 0 && wallet ? `${formatEuro(wallet.value)} · courbes` : 'Valeur et courbes'}</span></div>
        </button>
      </div>

      {inProgress.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="h2">En cours</h2>
            <button className="link" onClick={() => navigate('/sets')}>Toutes les extensions</button>
          </div>
          <div className="hscroll">
            {inProgress.map((s) => <SetChip key={s.id} set={s} owned={counts[s.id]} lang={lang} onClick={() => goSet(s)} />)}
          </div>
        </section>
      )}

      {latest.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="h2">Dernières sorties</h2>
            {inProgress.length === 0 && <button className="link" onClick={() => navigate('/sets')}>Tout voir</button>}
          </div>
          <div className="hscroll">
            {latest.map((s) => <SetChip key={s.id} set={s} owned={counts[s.id] || 0} lang={lang} onClick={() => goSet(s)} />)}
          </div>
        </section>
      )}

      {sheet === 'stats' && <StatsSheet onClose={close} setNames={setNames} wallet={wallet} />}
      {sheet === 'news' && <NewsSheet onClose={close} />}
      {sheet === 'events' && <EventsSheet onClose={close} />}
    </Page>
  );
}

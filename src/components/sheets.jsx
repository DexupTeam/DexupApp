import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Boxes, ChevronRight, ExternalLink, Gift, Layers, MapPin, Newspaper, Package, WifiOff } from './icons';
import { useCollection } from '../store/collection';
import { formatEuro, isGraded, ownedCountBySet, openUrl, setLogoUrl, useSets } from '../lib/tcg';
import { findSetInText } from '../utils/setNames';
import { loadNews, formatNewsDate } from '../lib/news';
import { loadReleases, isUpcoming, formatReleaseDate, RELEASES_SOURCE } from '../lib/releases';
import { loadEvents, isPast, formatEventDate, eventTagClass } from '../lib/events';
import { Empty, Loading, Segmented, Sheet, plural } from './ui';
import { PokeBallPicker } from './PokeBall';
import PriceChart from './PriceChart';
import { useWalletHistory } from '../lib/priceHistory';

// ─── Statistiques (totaux, grading, répartition par set) ─────────────────────
// Courbe de la valeur de la collection, une fois les prix actualisés.
export function WalletChart({ owned, wallet }) {
  const points = useWalletHistory(owned, wallet.pending > 0 ? null : wallet.value);
  return <PriceChart points={wallet.pending > 0 ? null : points} title="Évolution de la valeur" />;
}

export function StatsSheet({ onClose, setNames = {}, wallet }) {
  const { owned } = useCollection();
  const navigate = useNavigate();
  const stats = useMemo(() => {
    const entries = Object.values(owned);
    const graded = entries.filter(isGraded);
    const byCompany = {};
    const byGrade = {};
    for (const g of graded) {
      byCompany[g.company] = (byCompany[g.company] || 0) + 1;
      const k = `${g.company} ${g.grade}`;
      byGrade[k] = (byGrade[k] || 0) + 1;
    }
    const desc = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
    return {
      total: entries.length, graded: graded.length,
      byCompany: desc(byCompany), byGrade: desc(byGrade), bySet: desc(ownedCountBySet(owned)),
    };
  }, [owned]);

  return (
    <Sheet title="Statistiques" onClose={onClose} tall>
      {stats.total === 0 ? (
        <Empty title="Rien à compter pour l'instant" text="Ajoute tes premières cartes : tes statistiques apparaîtront ici." />
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          <div className="card card-pad">
            <div className="kv"><span>Cartes possédées</span><b style={{ color: 'var(--violet-ink)', fontSize: 18 }}>{stats.total}</b></div>
            {wallet && (
              <button
                className="kv tap" style={{ width: '100%', textAlign: 'left' }}
                aria-label="Valeur de la collection : voir mes cartes triées par valeur"
                onClick={() => navigate('/binder/collection?sort=value')}
              >
                <span>
                  Valeur de la collection
                  <span className="tiny dim" style={{ display: 'block' }}>
                    {wallet.pending > 0
                      ? `Actualisation des prix… ${wallet.pending} carte${wallet.pending > 1 ? 's' : ''} restante${wallet.pending > 1 ? 's' : ''}`
                      : [
                        'Prix tendance Cardmarket',
                        wallet.priced < wallet.total && `${wallet.priced} cartes sur ${wallet.total} évaluées`,
                        wallet.updatedAt && `actualisé le ${new Date(wallet.updatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`,
                      ].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <b style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{formatEuro(wallet.value)} <ChevronRight size={16} /></b>
              </button>
            )}
            <div className="kv"><span>Sets entamés</span><b>{stats.bySet.length}</b></div>
            <div className="kv"><span>Cartes gradées</span><b>{stats.graded}</b></div>
            <div className="kv"><span>Cartes non gradées</span><b>{stats.total - stats.graded}</b></div>
          </div>

          {wallet && wallet.value > 0 && <WalletChart owned={owned} wallet={wallet} />}

          {stats.graded > 0 && (
            <>
              <div>
                <p className="label">Grading par société</p>
                <div className="card card-pad">
                  {stats.byCompany.map(([k, n]) => <div className="kv" key={k}><span>{k}</span><b>{n}</b></div>)}
                </div>
              </div>
              <div>
                <p className="label">Grades les plus fréquents</p>
                <div className="card card-pad">
                  {stats.byGrade.map(([k, n]) => <div className="kv" key={k}><span>{k}</span><b>× {n}</b></div>)}
                </div>
              </div>
            </>
          )}

          <div>
            <p className="label">Répartition par set</p>
            <div className="stack">
              {stats.bySet.map(([sid, n]) => (
                <div className="list-row" key={sid}>
                  <div className="thumb-box" style={{ width: 64, height: 42 }}>
                    <img src={setLogoUrl(sid)} alt="" loading="lazy" onError={(e) => { e.target.style.visibility = 'hidden'; }} />
                  </div>
                  <div className="grow">
                    <b className="clamp1">{setNames[sid] ?? sid.toUpperCase()}</b>
                    <p className="tiny dim">{sid.toUpperCase()}</p>
                  </div>
                  <b style={{ color: 'var(--violet-ink)' }}>{n}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ─── Actualités ──────────────────────────────────────────────────────────────
export function NewsSheet({ onClose }) {
  return (
    <Sheet title="Actualités TCG" onClose={onClose} tall>
      <NewsList />
    </Sheet>
  );
}

// Icône selon le type de produit, quand aucune extension connue n'est citée.
function releaseIcon(name) {
  const n = name.toLowerCase();
  if (/display/.test(n)) return Boxes;
  if (/deck/.test(n)) return Layers;
  if (/classeur|portfolio/.test(n)) return BookOpen;
  if (/booster|blister|duopack|lot de/.test(n)) return Package;
  return Gift; // coffrets, boîtes, collections
}

function ReleaseThumb({ item, sets }) {
  const set = findSetInText(item.name, sets);
  const [broken, setBroken] = useState(false);
  const Icon = releaseIcon(item.name);
  return (
    <div className="thumb-box" style={{ width: 56, height: 40, padding: 4, color: 'var(--ink-3)' }}>
      {set && !broken
        ? <img src={set.images?.logo ?? setLogoUrl(set.id)} alt="" loading="lazy" onError={() => setBroken(true)} />
        : <Icon size={20} />}
    </div>
  );
}

function ReleasesList() {
  const { sets } = useSets();
  const [state, setState] = useState({ loading: true, error: false, releases: [] });
  const [attempt, setAttempt] = useState(0);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: false, releases: [] });
    loadReleases()
      .then((releases) => alive && setState({ loading: false, error: false, releases }))
      .catch(() => alive && setState({ loading: false, error: true, releases: [] }));
    return () => { alive = false; };
  }, [attempt]);

  const { loading, error, releases } = state;
  if (loading) return <Loading label="Chargement du calendrier…" />;
  if (error) {
    return (
      <Empty icon={WifiOff} title="Calendrier indisponible" text="Vérifie ta connexion internet puis réessaie.">
        <button className="btn btn-dark" onClick={() => setAttempt((n) => n + 1)}>Réessayer</button>
      </Empty>
    );
  }
  const upcoming = releases.filter(isUpcoming);
  const past = releases.filter((r) => !isUpcoming(r)).reverse(); // les plus récentes d'abord

  const day = (r) => (
    <div className="card card-pad" key={r.date}>
      <p className="dot-label" style={{ color: 'var(--violet-ink)', marginBottom: 6 }}>
        {formatReleaseDate(r.date)}
      </p>
      {r.items.map((item, i) => (
        <div className="row" key={i} style={{ gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
          <ReleaseThumb item={item} sets={sets} />
          <span className="grow small">{item.name}</span>
          {item.langs.map((l) => <span key={l} className={`tag${l === 'JP' ? ' tag-peach' : l === 'FR' ? ' tag-violet' : ''}`}>{l}</span>)}
        </div>
      ))}
    </div>
  );

  return (
    <div className="stack">
      <p className="tiny dim">Produits FR / US et extensions japonaises · {RELEASES_SOURCE}</p>
      {upcoming.length ? upcoming.map(day) : <p className="small muted">Aucune sortie annoncée pour l'instant.</p>}
      {past.length > 0 && (
        <button className="btn btn-ghost btn-sm" onClick={() => setShowPast((v) => !v)} aria-expanded={showPast}>
          {showPast ? 'Masquer les sorties passées' : `Sorties passées (${past.length})`}
        </button>
      )}
      {showPast && past.map(day)}
      <button className="btn btn-ghost btn-sm" onClick={() => openUrl('https://www.pokecardex.com/calendrier')}>
        Calendrier complet sur PokéCardex <ExternalLink size={15} />
      </button>
    </div>
  );
}

function NewsList() {
  const [state, setState] = useState({ loading: true, error: false, articles: [] });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: false, articles: [] });
    loadNews()
      .then((articles) => alive && setState({ loading: false, error: false, articles }))
      .catch(() => alive && setState({ loading: false, error: true, articles: [] }));
    return () => { alive = false; };
  }, [attempt]);

  const { loading, error, articles } = state;
  return (
    <>
      {loading && <Loading label="Chargement des actualités…" />}
      {error && (
        <Empty icon={WifiOff} title="Actualités indisponibles" text="Vérifie ta connexion internet puis réessaie.">
          <button className="btn btn-dark" onClick={() => setAttempt((n) => n + 1)}>Réessayer</button>
        </Empty>
      )}
      {!loading && !error && (
        <div className="stack">
          <p className="tiny dim">
            {articles[0]?.domain} · mis à jour toutes les 24 h
          </p>
          {articles.map((a, i) => (
            <button className="list-row" key={i} onClick={() => openUrl(a.link)}>
              <div className="thumb-box" style={{ padding: 0, overflow: 'hidden', color: 'var(--ink-3)' }}>
                {a.thumbnail
                  ? <img src={a.thumbnail} alt="" loading="lazy" style={{ objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                  : <Newspaper size={22} />}
              </div>
              <span className="grow">
                <b className="clamp2" style={{ fontSize: 14 }}>{a.title}</b>
                <span className="row tiny dim" style={{ gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  {a.domain && <span className="tag tag-violet">{a.domain}</span>}
                  {a.date && <span>{formatNewsDate(a.date)}</span>}
                  {a.score > 0 && <span>▲ {a.score}</span>}
                </span>
              </span>
              <ChevronRight size={18} color="var(--ink-3)" />
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Événements ──────────────────────────────────────────────────────────────
const AGENDA_TABS = [{ value: 'events', label: 'Conventions' }, { value: 'releases', label: 'Sorties' }];

export function EventsSheet({ onClose }) {
  const [tab, setTab] = useState('events');
  return (
    <Sheet title="Agenda" onClose={onClose} tall>
      <div style={{ marginBottom: 14 }}><Segmented options={AGENDA_TABS} value={tab} onChange={setTab} /></div>
      {tab === 'events' ? <EventsList /> : <ReleasesList />}
    </Sheet>
  );
}

function EventsList() {
  const [events, setEvents] = useState(null);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => { loadEvents().then(setEvents); }, []);

  if (!events) return <Loading />;

  const upcoming = events.filter((e) => !isPast(e));
  const past = events.filter(isPast);
  const shown = showPast ? events : upcoming;
  const next = upcoming[0];

  return (
    <div className="stack">
      <p className="tiny dim">Salons de collection · France & Europe · {upcoming.length} à venir</p>

      {next && (
        <div className="card-pad" style={{ background: 'var(--ink)', color: '#fff', borderRadius: 'var(--r)' }}>
          <p className="dot-label" style={{ opacity: 0.85 }}>Prochain salon</p>
          <p className="h2" style={{ margin: '4px 0' }}>{next.name}</p>
          <p className="small" style={{ opacity: 0.9 }}>
            {formatEventDate(next.date)}{next.dateEnd && next.dateEnd !== next.date ? ` → ${formatEventDate(next.dateEnd)}` : ''} · {next.city}
          </p>
        </div>
      )}

      {shown.map((ev) => {
        const d = new Date(`${ev.date}T00:00:00`);
        const done = isPast(ev);
        return (
          <button
            key={ev.id} className="list-row" style={done ? { opacity: 0.55 } : undefined}
            onClick={() => ev.url && openUrl(ev.url)}
          >
            <span className="thumb-box" style={{ width: 52, height: 56, flexDirection: 'column', padding: 0 }}>
              <b style={{ fontFamily: 'var(--display)', fontSize: 19, lineHeight: 1, color: done ? 'var(--ink-3)' : 'var(--violet-ink)' }}>{d.getDate()}</b>
              <span className="tiny dim" style={{ textTransform: 'uppercase', fontWeight: 700 }}>
                {d.toLocaleDateString('fr-FR', { month: 'short' })}
              </span>
            </span>
            <span className="grow">
              <span className={`tag ${eventTagClass(ev.type)}`}>{ev.type}</span>
              <b className="clamp2" style={{ fontSize: 14, marginTop: 4 }}>{ev.name}</b>
              <span className="row tiny muted" style={{ gap: 4, marginTop: 2 }}><MapPin size={12} /> {[ev.venue, ev.city].filter(Boolean).join(', ')}</span>
              {ev.dateEnd && ev.dateEnd !== ev.date && <span className="tiny dim">Jusqu'au {formatEventDate(ev.dateEnd)}</span>}
            </span>
            {ev.url && <ChevronRight size={18} color="var(--ink-3)" />}
          </button>
        );
      })}

      {upcoming.length === 0 && !showPast && <p className="small dim" style={{ textAlign: 'center', padding: 20 }}>Aucun salon annoncé pour le moment.</p>}

      {past.length > 0 && (
        <button className="btn btn-ghost btn-sm" onClick={() => setShowPast((v) => !v)}>
          {showPast ? 'Masquer les salons passés' : `Voir ${plural(past.length, 'salon')} passé${past.length > 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  );
}

// ─── Création / édition d'une liste ──────────────────────────────────────────
export function ListEditorSheet({ list, onClose }) {
  const { createList, updateList } = useCollection();
  const [name, setName] = useState(list?.name ?? '');
  const [icon, setIcon] = useState(list?.icon ?? 'poke');

  const save = async () => {
    const n = name.trim();
    if (!n) return;
    if (list) await updateList(list.id, n, icon); else await createList(n, icon);
    onClose();
  };

  return (
    <Sheet title={list ? 'Modifier la liste' : 'Nouvelle liste'} onClose={onClose} level={1}>
      <div className="stack" style={{ gap: 16 }}>
        <div>
          <label className="label" htmlFor="list-name">Nom</label>
          <input
            id="list-name" className="input" autoFocus placeholder="Wishlist, échanges, master set…"
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          />
        </div>
        <div>
          <p className="label">Icône</p>
          <PokeBallPicker value={icon} onChange={setIcon} />
        </div>
        <button className="btn btn-violet btn-block" disabled={!name.trim()} onClick={save}>
          {list ? 'Enregistrer' : 'Créer la liste'}
        </button>
      </div>
    </Sheet>
  );
}

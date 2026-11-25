// Finance : ce que vaut la collection et comment cette valeur se répartit (cartes chères, extensions,
// tranches de prix, cartes gradées, produits scellés) et bouge (courbe, hausses et baisses sur 30 jours).
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChartLine } from '../components/icons';
import { useCollection } from '../store/collection';
import { useLang } from '../utils/LanguageContext.jsx';
import { getLocalizedSetName } from '../utils/setNames';
import { formatEuro, isGraded, loadCardsByIds, setIdOf, useSets } from '../lib/tcg';
import { loadPriceStore, manualValue, useWallet } from '../lib/prices';
import { cardImage } from '../lib/photos';
import { CardName } from '../lib/cardNames';
import { CUSTOM_SET_ID } from '../lib/extraCards';
import priceData from '../data/productPrices.json';
import { WalletChart } from '../components/sheets';
import { CardPlaceholder } from '../components/cards';
import { Empty, Loading, Page, TopBar, plural } from '../components/ui';

const BUCKETS = [
  { label: '< 1 €', max: 1 },
  { label: '1–5 €', max: 5 },
  { label: '5–20 €', max: 20 },
  { label: '20–50 €', max: 50 },
  { label: '50–100 €', max: 100 },
  { label: '100 € +', max: Infinity },
];
const SETS_SHOWN = 8;
const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);
const fmtPct = (v, digits = 1) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: digits })} %`;
const signed = (v) => `${v >= 0 ? '+' : '−'}${formatEuro(Math.abs(v))}`;

// Cartes possédées avec leurs données (nom, image, extension) ; les cartes perso viennent du store.
function useOwnedCards(owned, customCards, ready) {
  const [map, setMap] = useState(null);
  useEffect(() => {
    if (!ready) return undefined;
    let alive = true;
    loadCardsByIds(Object.keys(owned)).then(({ map: loaded }) => {
      if (!alive) return;
      const all = { ...loaded };
      for (const [id, card] of Object.entries(customCards)) if (owned[id]) all[id] = card;
      setMap(all);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, Object.keys(owned).length]);
  return map;
}

function Stat({ label, value, sub }) {
  return (
    <div className="fin-stat">
      <span className="fin-stat-label">{label}</span>
      <b className="fin-stat-value">{value}</b>
      {sub && <span className="tiny dim">{sub}</span>}
    </div>
  );
}

function Section({ title, note, children }) {
  return (
    <section className="section">
      <div className="section-head" style={{ marginBottom: note ? 4 : 14 }}><h2 className="h2">{title}</h2></div>
      {note && <p className="small muted" style={{ marginBottom: 14 }}>{note}</p>}
      {children}
    </section>
  );
}

// Ligne de carte : vignette, nom, extension, et la valeur à droite (avec une ligne de détail).
function CardLine({ rank, card, value, detail, detailClass, onOpen }) {
  const { cardPhotos } = useCollection();
  const { lang } = useLang();
  const image = cardImage(card, cardPhotos);
  return (
    <button className="fin-card" onClick={onOpen}>
      {rank != null && <span className="fin-rank">{rank}</span>}
      {image ? <img className="card-thumb" src={image} alt="" loading="lazy" /> : <span className="card-thumb fin-ph"><CardPlaceholder card={card} /></span>}
      <span className="fin-card-text">
        <b><CardName card={card} /></b>
        <span className="small muted">{card.set?.name ? getLocalizedSetName(card.set.name, lang) : ''}{card.number ? ` · #${card.number}` : ''}</span>
      </span>
      <span className="fin-card-value">
        <b>{formatEuro(value)}</b>
        {detail && <span className={`tiny ${detailClass ?? 'dim'}`}>{detail}</span>}
      </span>
    </button>
  );
}

// Barres horizontales (une seule série : la valeur), libellé et montant affichés à côté de chaque barre.
function HBars({ rows, total }) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  return (
    <div className="card card-pad fin-hbars">
      {rows.map((r) => (
        <div key={r.key} className="fin-hbar" title={`${r.label} : ${formatEuro(r.value)} · ${plural(r.count, 'carte')} · ${fmtPct(pct(r.value, total))}`}>
          <div className="fin-hbar-head">
            <span className="clamp1">{r.label}</span>
            <b>{formatEuro(r.value)}</b>
          </div>
          <div className="fin-hbar-track"><i style={{ width: `${max ? Math.max(1.5, (r.value / max) * 100) : 0}%` }} /></div>
          <span className="tiny dim">{plural(r.count, 'carte')} · {fmtPct(pct(r.value, total))} de la valeur</span>
        </div>
      ))}
    </div>
  );
}

// Histogramme des tranches de prix : hauteur = nombre de cartes ; la valeur de la tranche est dessous.
function Histogram({ buckets, total }) {
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const [hover, setHover] = useState(null);
  return (
    <div className="card card-pad">
      <div className="fin-histo" role="img" aria-label={buckets.map((b) => `${b.label} : ${plural(b.count, 'carte')}, ${formatEuro(b.value)}`).join(' ; ')}>
        {buckets.map((b, i) => (
          <div
            key={b.label} className={`fin-col${hover === i ? ' is-hover' : ''}`}
            onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}
          >
            <span className="fin-col-count">{b.count}</span>
            <div className="fin-col-track"><i style={{ height: `${b.count ? Math.max(3, (b.count / max) * 100) : 0}%` }} /></div>
            <span className="fin-col-label">{b.label}</span>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 12, minHeight: 20 }}>
        {hover !== null
          ? `${buckets[hover].label} : ${plural(buckets[hover].count, 'carte')} pour ${formatEuro(buckets[hover].value)} (${fmtPct(pct(buckets[hover].value, total))} de la valeur)`
          : 'Survole ou touche une colonne pour voir sa valeur.'}
      </p>
    </div>
  );
}

export default function Finance() {
  const navigate = useNavigate();
  const { ready, owned, ownedProducts, customCards, openCard } = useCollection();
  const { sets } = useSets();
  const { lang } = useLang();
  const wallet = useWallet(owned);
  const cards = useOwnedCards(owned, customCards, ready);
  const [prices, setPrices] = useState(null);
  // Prix connus (tendance, moyenne 30 j) : relus quand l'actualisation des prix se termine.
  useEffect(() => { loadPriceStore().then((s) => setPrices({ ...s })); }, [wallet?.pending === 0]);

  const stats = useMemo(() => {
    if (!wallet || !cards) return null;
    const values = wallet.values;
    const priced = Object.keys(values).filter((id) => cards[id]).sort((a, b) => values[b] - values[a]);
    const cardsValue = priced.reduce((s, id) => s + values[id], 0);
    const sorted = priced.map((id) => values[id]);
    const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : 0;

    const sealedIds = Object.keys(ownedProducts).filter((id) => priceData.prices[id] > 0);
    const sealed = sealedIds.reduce((s, id) => s + priceData.prices[id], 0);

    const top = priced.slice(0, 10);
    const topValue = top.reduce((s, id) => s + values[id], 0);

    const setName = (sid, card) => (sid === CUSTOM_SET_ID ? 'Cartes perso'
      : getLocalizedSetName(sets.find((x) => x.id === sid)?.name ?? card.set?.name ?? sid, lang));
    const bySetMap = {};
    for (const id of priced) {
      const sid = setIdOf(id);
      const row = (bySetMap[sid] ||= { key: sid, label: setName(sid, cards[id]), value: 0, count: 0 });
      row.value += values[id];
      row.count += 1;
    }
    const bySetAll = Object.values(bySetMap).sort((a, b) => b.value - a.value);
    const bySet = bySetAll.slice(0, SETS_SHOWN);
    if (bySetAll.length > SETS_SHOWN) {
      const rest = bySetAll.slice(SETS_SHOWN);
      bySet.push({ key: 'other', label: `Autres (${rest.length} extensions)`, value: rest.reduce((s, r) => s + r.value, 0), count: rest.reduce((s, r) => s + r.count, 0) });
    }

    const buckets = BUCKETS.map((b) => ({ ...b, count: 0, value: 0 }));
    for (const id of priced) {
      const b = buckets.find((x) => values[id] < x.max);
      b.count += 1;
      b.value += values[id];
    }

    const graded = priced.filter((id) => isGraded(owned[id]));
    const gradedValue = graded.reduce((s, id) => s + values[id], 0);

    // Hausses et baisses : prix tendance du jour face à la moyenne des 30 derniers jours (Cardmarket).
    const moves = [];
    for (const id of priced) {
      if (manualValue(owned[id]) !== null) continue;
      const e = prices?.[id];
      // Sous 0,50 €, un centime fait des pourcentages énormes : on ne garde que les cartes qui pèsent.
      if (!(e?.trend > 0 && e?.avg30 >= 0.5)) continue;
      const delta = e.trend - e.avg30;
      if (Math.abs(delta) < 0.05) continue;
      moves.push({ id, delta, pct: pct(delta, e.avg30), value: values[id] });
    }
    const gains = moves.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5);
    const losses = moves.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5);

    return {
      cardsValue, sealed, sealedCount: sealedIds.length, total: cardsValue + sealed, priced: priced.length,
      avg: priced.length ? cardsValue / priced.length : 0, median, top, topValue, bySet, buckets,
      graded: graded.length, gradedValue, gains, losses,
    };
  }, [wallet, cards, prices, ownedProducts, owned, sets, lang]);

  const total = Object.keys(owned).length;
  const open = (ids) => (id) => openCard(cards[id], ids.map((x) => cards[x]));

  return (
    <Page>
      <TopBar title="Finance" back="/" />

      {(!ready || !stats) && total > 0 && <Loading label="Calcul de la valeur de ta collection…" />}
      {ready && total === 0 && (
        <Empty icon={ChartLine} title="Rien à évaluer pour l'instant" text="Ajoute des cartes à ta collection : leur valeur et son évolution apparaîtront ici.">
          <button className="btn btn-violet" onClick={() => navigate('/sets')}>Parcourir les extensions</button>
        </Empty>
      )}

      {stats && (
        <>
          <div className="fin-hero">
            <p className="fin-kicker">Valeur totale</p>
            <p className="fin-total">{formatEuro(stats.total)}</p>
            <p className="small muted">
              {wallet.pending > 0
                ? `Actualisation des prix… ${wallet.pending} carte${wallet.pending > 1 ? 's' : ''} restante${wallet.pending > 1 ? 's' : ''}`
                : `Prix Cardmarket${stats.sealed > 0 ? ' · cartes et produits scellés' : ''}`}
            </p>
          </div>

          <div className="fin-stats">
            <Stat label="Cartes" value={formatEuro(stats.cardsValue)} sub={`${stats.priced} évaluées sur ${total}`} />
            <Stat label="Scellé" value={formatEuro(stats.sealed)} sub={plural(stats.sealedCount, 'produit')} />
            <Stat label="Moyenne" value={formatEuro(stats.avg)} sub="par carte évaluée" />
            <Stat label="Médiane" value={formatEuro(stats.median)} sub="la moitié vaut plus" />
          </div>

          {wallet.value > 0 && <div style={{ marginTop: 14 }}><WalletChart owned={owned} wallet={wallet} /></div>}

          {stats.top.length > 0 && (
            <Section
              title="Les plus chères"
              note={stats.priced > 10 ? `Ces ${stats.top.length} cartes font ${fmtPct(pct(stats.topValue, stats.cardsValue), 0)} de la valeur de tes cartes.` : null}
            >
              <div className="card fin-list">
                {stats.top.map((id, i) => (
                  <CardLine
                    key={id} rank={i + 1} card={cards[id]} value={wallet.values[id]}
                    detail={fmtPct(pct(wallet.values[id], stats.cardsValue))} onOpen={() => open(stats.top)(id)}
                  />
                ))}
              </div>
            </Section>
          )}

          {(stats.gains.length > 0 || stats.losses.length > 0) && (
            <Section title="Ce qui bouge" note="Prix tendance du jour comparé à la moyenne des 30 derniers jours sur Cardmarket.">
              <div className="fin-moves">
                {[['En hausse', stats.gains, 'is-up', '▲'], ['En baisse', stats.losses, 'is-down', '▼']].map(([label, list, cls, arrow]) => (
                  <div key={label}>
                    <p className="label">{label}</p>
                    {list.length ? (
                      <div className="card fin-list">
                        {list.map((m) => (
                          <CardLine
                            key={m.id} card={cards[m.id]} value={m.value}
                            detail={`${arrow} ${signed(m.delta)} · ${m.pct >= 0 ? '+' : '−'}${fmtPct(Math.abs(m.pct), 0)}`} detailClass={cls}
                            onOpen={() => open(list.map((x) => x.id))(m.id)}
                          />
                        ))}
                      </div>
                    ) : <p className="small dim">Rien de notable.</p>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {stats.bySet.length > 0 && (
            <Section title="Par extension">
              <HBars rows={stats.bySet} total={stats.cardsValue} />
            </Section>
          )}

          {stats.priced > 0 && (
            <Section title="Par tranche de prix">
              <Histogram buckets={stats.buckets} total={stats.cardsValue} />
            </Section>
          )}

          {stats.graded > 0 && (
            <Section title="Cartes gradées">
              <div className="fin-stats">
                <Stat label="Gradées" value={plural(stats.graded, 'carte')} sub={formatEuro(stats.gradedValue)} />
                <Stat label="Part de la valeur" value={fmtPct(pct(stats.gradedValue, stats.cardsValue), 0)} sub="valeurs que tu as saisies" />
              </div>
            </Section>
          )}

          <p className="tiny dim" style={{ marginTop: 28, textAlign: 'center' }}>
            Prix tendance Cardmarket, sauf pour les cartes dont tu as saisi la valeur (gradées) ou le prix constaté.
          </p>
        </>
      )}
    </Page>
  );
}

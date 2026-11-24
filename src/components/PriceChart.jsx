// Courbe d'évolution d'un prix (carte, produit scellé, collection) : période au choix, variation sur la
// période, et lecture au doigt (ou à la souris) de la valeur d'un jour précis.
import React, { useEffect, useMemo, useState } from 'react';
import { formatEuro } from '../lib/tcg';
import { Segmented } from './ui';

const DAY = 24 * 60 * 60 * 1000;
const RANGES = [
  { value: '1m', label: '1M', days: 31 },
  { value: '3m', label: '3M', days: 92 },
  { value: '6m', label: '6M', days: 183 },
  { value: '1y', label: '1A', days: 366 },
  { value: 'max', label: 'Max', days: Infinity },
];
const H = 168;
const PAD = { top: 12, right: 52, bottom: 24, left: 4 };

const shortDate = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDate = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
// Libellé d'une graduation : autant de décimales que l'écart entre graduations en demande.
const axisEuro = (v, step) => {
  if (v >= 1000 && step >= 100) return `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: step >= 1000 ? 0 : 1 })} k€`;
  const digits = [0, 1, 2].find((d) => Math.abs(step * 10 ** d - Math.round(step * 10 ** d)) < 1e-6) ?? 2;
  return `${v.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} €`;
};

function niceTicks(min, max) {
  if (max - min < 1e-9) { const pad = Math.max(max * 0.1, 0.05); min -= pad; max += pad; }
  const raw = (max - min) / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { lo: Math.max(0, lo), hi, step, ticks: ticks.filter((v) => v >= 0) };
}

// Largeur réelle du tracé (ref en callback : l'élément n'existe qu'une fois les points chargés).
function useWidth() {
  const [node, ref] = useState(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    if (!node) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [ref, width];
}

/**
 * points : [{ t, v, est }] triés par date (est = estimation d'après les moyennes Cardmarket).
 * null = chargement ; moins de 2 points = courbe en construction.
 */
export default function PriceChart({ points, title = 'Évolution du prix', emptyNote }) {
  const [range, setRange] = useState('max');
  const [hover, setHover] = useState(null);
  const [ref, width] = useWidth();

  const span = points?.length ? points.at(-1).t - points[0].t : 0;
  const options = RANGES.filter((r) => r.value === 'max' || r.days * DAY < span);
  const active = options.some((o) => o.value === range) ? range : 'max';

  const shown = useMemo(() => {
    if (!points?.length) return [];
    const days = RANGES.find((r) => r.value === active).days;
    if (!Number.isFinite(days)) return points;
    const from = points.at(-1).t - days * DAY;
    const inside = points.filter((p) => p.t >= from);
    const before = points.filter((p) => p.t < from).at(-1);
    // La courbe commence au bord de la période, avec la valeur qu'avait le prix ce jour-là.
    return before && (!inside.length || inside[0].t > from) ? [{ ...before, t: from }, ...inside] : inside;
  }, [points, active]);

  const geo = useMemo(() => {
    if (shown.length < 2) return null;
    const vals = shown.map((p) => p.v);
    const { lo, hi, step, ticks } = niceTicks(Math.min(...vals), Math.max(...vals));
    const t0 = shown[0].t;
    const t1 = shown.at(-1).t;
    const w = width - PAD.left - PAD.right;
    const h = H - PAD.top - PAD.bottom;
    const x = (t) => PAD.left + ((t - t0) / (t1 - t0 || 1)) * w;
    const y = (v) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * h;
    const xy = shown.map((p) => [x(p.t), y(p.v)]);
    const line = (pts) => pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join('');
    const firstReal = shown.findIndex((p, i) => i > 0 && !shown[i - 1].est);
    const split = firstReal === -1 ? xy.length : firstReal; // segments estimés : de 0 à split-1
    return {
      x, y, ticks, step, xy,
      est: split > 1 ? line(xy.slice(0, split)) : null,
      real: line(xy.slice(Math.max(0, split - 1))),
      area: `${line(xy)}L${xy.at(-1)[0].toFixed(1)},${PAD.top + h}L${xy[0][0].toFixed(1)},${PAD.top + h}Z`,
      bottom: PAD.top + h,
    };
  }, [shown, width]);

  if (points === null) {
    return (
      <div className="card card-pad chart">
        <p className="chart-title">{title}</p>
        <div className="row" style={{ height: 80, justifyContent: 'center' }}><div className="spinner sm" /></div>
      </div>
    );
  }
  if (!points.length) return null;

  const first = shown[0] ?? points[0];
  const last = shown.at(-1) ?? points.at(-1);
  const focus = hover !== null && shown[hover] ? shown[hover] : last;
  const delta = focus.v - first.v;
  const pct = first.v > 0 ? (delta / first.v) * 100 : 0;
  const trend = Math.abs(pct) < 0.05 ? 'flat' : delta > 0 ? 'up' : 'down';
  const hasEst = shown.some((p) => p.est);

  const onPointer = (e) => {
    if (!geo) return;
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * width;
    let best = 0;
    geo.xy.forEach(([a], i) => { if (Math.abs(a - px) < Math.abs(geo.xy[best][0] - px)) best = i; });
    setHover(best);
  };

  return (
    <div className="card card-pad chart">
      <div className="chart-head">
        <div>
          <p className="chart-title">{title}</p>
          <p className="chart-value">{formatEuro(focus.v)}</p>
          <p className="tiny dim">{hover !== null ? `${longDate(focus.t)}${focus.est ? ' · estimation' : ''}` : `au ${longDate(last.t)}`}</p>
        </div>
        {geo && (
          <span className={`chart-delta is-${trend}`}>
            {delta >= 0 ? '+' : '−'}{formatEuro(Math.abs(delta))}
            <small>{delta >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(1).replace('.', ',')} %</small>
          </span>
        )}
      </div>

      {geo ? (
        <div ref={ref} className="chart-plot">
          <svg
            width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img"
            aria-label={`${title} : de ${formatEuro(first.v)} le ${longDate(first.t)} à ${formatEuro(last.v)} le ${longDate(last.t)}`}
            onPointerDown={onPointer} onPointerMove={onPointer} onPointerLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-line)" stopOpacity="0.16" />
                <stop offset="100%" stopColor="var(--chart-line)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {geo.ticks.map((v) => (
              <g key={v}>
                <line className="chart-grid" x1={PAD.left} x2={width - PAD.right} y1={geo.y(v)} y2={geo.y(v)} />
                <text className="chart-axis" x={width - PAD.right + 6} y={geo.y(v) + 3.5}>{axisEuro(v, geo.step)}</text>
              </g>
            ))}
            <path d={geo.area} fill="url(#chart-fill)" />
            {geo.est && <path d={geo.est} className="chart-line is-est" />}
            <path d={geo.real} className="chart-line" />
            <text className="chart-axis" x={PAD.left} y={H - 6}>{shortDate(shown[0].t)}</text>
            <text className="chart-axis" x={width - PAD.right} y={H - 6} textAnchor="end">{shortDate(shown.at(-1).t)}</text>
            {hover !== null && geo.xy[hover] && (
              <line className="chart-cursor" x1={geo.xy[hover][0]} x2={geo.xy[hover][0]} y1={PAD.top} y2={geo.bottom} />
            )}
            <circle className="chart-dot" r="4" cx={geo.xy[hover ?? geo.xy.length - 1][0]} cy={geo.xy[hover ?? geo.xy.length - 1][1]} />
          </svg>
        </div>
      ) : (
        <p className="small muted" style={{ marginTop: 8 }} ref={ref}>
          {emptyNote ?? 'La courbe se remplit jour après jour à partir de maintenant.'}
        </p>
      )}

      {geo && options.length > 1 && (
        <div style={{ marginTop: 10 }}>
          <Segmented options={options.map(({ value, label }) => ({ value, label }))} value={active} onChange={(v) => { setRange(v); setHover(null); }} />
        </div>
      )}
      {geo && hasEst && (
        <p className="tiny dim" style={{ marginTop: 8 }}>
          Pointillés : estimation d'après les moyennes Cardmarket sur 30 et 7 jours, en attendant que l'historique quotidien se remplisse.
        </p>
      )}
    </div>
  );
}

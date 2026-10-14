/**
 * Charts for the wall.
 *
 * All SVG, all drawn to one scale, all with a hover layer — a chart on an operations
 * screen is read at a glance and then interrogated. Series colours come from the skin's
 * fixed categorical order; severity colours are reserved and never used as a series.
 */
import { Fragment, useId, useMemo, useState, type ReactNode } from 'react';
import { T } from './theme';

const nice = (max: number) => {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  const f = max / p;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return n * p;
};

/* ---------- one line, small, inside a tile ---------- */

export function Spark({ values, colour = T.accent, width = 72, height = 22 }: { values: number[]; colour?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const step = width / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`);
  const last = values[values.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={pts.join(' ')} fill="none" stroke={colour} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity=".9" />
      <circle cx={width} cy={height - 2 - (last / max) * (height - 4)} r="2" fill={colour} />
    </svg>
  );
}

/* ---------- lines over days ---------- */

export type Series = { key: string; label: string; colour: string; values: number[]; area?: boolean };

export function Lines({ labels, series, height = 180, yLabel }: { labels: string[]; series: Series[]; height?: number; yLabel?: string }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const padL = 34, padR = 10, padT = 10, padB = 22;
  const innerW = width - padL - padR, innerH = height - padT - padB;
  const max = nice(Math.max(1, ...series.flatMap(s => s.values)));
  const n = labels.length;
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const every = Math.max(1, Math.ceil(n / 8));
  const path = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={series.map(s => s.label).join(', ')}
        onMouseLeave={() => setHover(null)}
        onMouseMove={e => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * width; const i = Math.round(((px - padL) / innerW) * (n - 1)); setHover(Math.min(n - 1, Math.max(0, i))); }}>
        <defs>{series.map(s => <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={s.colour} stopOpacity=".28" /><stop offset="1" stopColor={s.colour} stopOpacity="0" /></linearGradient>)}</defs>
        {ticks.map(tv => <g key={tv}><line x1={padL} x2={width - padR} y1={y(tv)} y2={y(tv)} stroke={T.line} strokeWidth="1" /><text x={padL - 6} y={y(tv) + 3.5} fontSize="9.5" fill={T.subtle} textAnchor="end" fontFamily={T.mono}>{tv}</text></g>)}
        {labels.map((l, i) => (i === n - 1 || (i % every === 0 && n - 1 - i >= every / 2)) ? <text key={i} x={x(i)} y={height - 6} fontSize="9.5" fill={T.subtle} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontFamily={T.mono}>{l}</text> : null)}
        {series.map(s => s.area && s.values.length > 1 ? <path key={`a${s.key}`} d={`${path(s.values)} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`} fill={`url(#${id}-${s.key})`} /> : null)}
        {series.map(s => <path key={s.key} d={path(s.values)} fill="none" stroke={s.colour} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
        {series.map(s => n > 0 ? <circle key={`e${s.key}`} cx={x(n - 1)} cy={y(s.values[n - 1] ?? 0)} r="3" fill={s.colour} stroke={T.surface} strokeWidth="1.5" /> : null)}
        {hover !== null ? <g><line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke={T.line2} strokeDasharray="2 2" />{series.map(s => <circle key={`h${s.key}`} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r="3.5" fill={s.colour} stroke={T.surface} strokeWidth="1.5" />)}</g> : null}
        {yLabel ? <text x={padL} y={padT - 1} fontSize="9" fill={T.subtle}>{yLabel}</text> : null}
      </svg>
      {hover !== null ? (
        <div style={{ position: 'absolute', top: 4, left: `${(x(hover) / width) * 100}%`, transform: hover > n / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)', background: T.surface3, border: `1px solid ${T.line2}`, borderRadius: 6, padding: '5px 8px', fontSize: 11, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 2 }}>
          <div style={{ color: T.muted, fontFamily: T.mono, marginBottom: 2 }}>{labels[hover]}</div>
          {series.map(s => <div key={s.key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ width: 7, height: 7, borderRadius: 2, background: s.colour }} />{s.label} <b className="cc-num">{s.values[hover] ?? 0}</b></div>)}
        </div>
      ) : null}
      <Legend items={series.map(s => [s.label, s.colour])} />
    </div>
  );
}

export function Legend({ items }: { items: [string, string][] }) {
  return <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4, fontSize: 11, color: T.muted }}>{items.map(([l, c]) => <span key={l} style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{l}</span>)}</div>;
}

/* ---------- horizontal bars ---------- */

export function HBars({ rows, colour, max: givenMax, format = v => String(v), valueWidth = 36 }: { rows: { label: ReactNode; value: number; colour?: string; note?: string }[]; colour?: string; max?: number; format?: (v: number) => string; valueWidth?: number }) {
  const max = givenMax ?? Math.max(1, ...rows.map(r => r.value));
  if (rows.length === 0) return <div style={{ fontSize: 12, color: T.subtle, padding: '6px 0' }}>Nothing in this range.</div>;
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      {rows.map((r, i) => (
        <div key={i} title={r.note} style={{ display: 'grid', gridTemplateColumns: `minmax(90px, 32%) 1fr ${valueWidth}px`, gap: 8, alignItems: 'center', fontSize: 12 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.text }}>{r.label}</span>
          <span style={{ height: 8, background: T.surface3, borderRadius: 3, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(r.value / max) * 100}%`, background: r.colour ?? colour ?? T.series[0], borderRadius: 3, transition: 'width .3s' }} /></span>
          <span className="cc-num" style={{ textAlign: 'right', color: T.muted }}>{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- 24 columns ---------- */

export function HourStrip({ hours, colour = T.series[0] }: { hours: { hour: number; reported: number }[]; colour?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const byHour = Array.from({ length: 24 }, (_, h) => hours.find(x => x.hour === h)?.reported ?? 0);
  const max = Math.max(1, ...byHour);
  const peak = byHour.indexOf(max);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 2, alignItems: 'end', height: 56 }}>
        {byHour.map((v, h) => (
          <div key={h} onMouseEnter={() => setHover(h)} onMouseLeave={() => setHover(null)} title={`${String(h).padStart(2, '0')}:00 — ${v}`}
            style={{ height: `${Math.max(3, (v / max) * 100)}%`, background: h === peak ? T.warn : colour, opacity: hover === null || hover === h ? 0.95 : 0.45, borderRadius: '2px 2px 0 0', transition: 'opacity .1s' }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: T.subtle, fontFamily: T.mono, marginTop: 3 }}>
        <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
      </div>
      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{hover !== null ? <><b className="cc-num">{String(hover).padStart(2, '0')}:00</b> · {byHour[hover]} reported</> : <>Busiest hour <b className="cc-num" style={{ color: T.warn }}>{String(peak).padStart(2, '0')}:00</b> · {max} reported</>}</div>
    </div>
  );
}

/* ---------- the response ladder ---------- */

export function Ladder({ steps }: { steps: { label: string; median: number | null; before: number | null; p90: number | null; count: number }[] }) {
  const max = nice(Math.max(1, ...steps.map(s => Math.max(s.median ?? 0, s.p90 ?? 0, s.before ?? 0))));
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {steps.map(s => {
        const change = s.median !== null && s.before !== null && s.before > 0 ? Math.round(((s.median - s.before) / s.before) * 100) : null;
        return (
          <div key={s.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(84px, 26%) 1fr 70px 58px', gap: 8, alignItems: 'center', fontSize: 12 }}>
            <span>{s.label}</span>
            <span style={{ position: 'relative', height: 10, background: T.surface3, borderRadius: 3 }}>
              {s.p90 !== null ? <span title={`90th percentile ${s.p90} min`} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(s.p90 / max) * 100}%`, background: T.line2, borderRadius: 3 }} /> : null}
              {s.median !== null ? <span title={`median ${s.median} min`} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(s.median / max) * 100}%`, background: T.series[0], borderRadius: 3 }} /> : null}
              {s.before !== null ? <span title={`previous period ${s.before} min`} style={{ position: 'absolute', left: `${(s.before / max) * 100}%`, top: -2, width: 2, height: 14, background: T.warn }} /> : null}
            </span>
            <span className="cc-num" style={{ textAlign: 'right' }}>{s.median === null ? <span style={{ color: T.subtle }}>—</span> : <>{s.median} <span style={{ color: T.subtle }}>min</span></>}</span>
            <span className="cc-num" style={{ textAlign: 'right', fontSize: 11, color: change === null ? T.subtle : change <= 0 ? T.good : T.bad }}>{change === null ? `n=${s.count}` : `${change > 0 ? '+' : ''}${change}%`}</span>
          </div>
        );
      })}
      <Legend items={[['Median', T.series[0]], ['90th percentile', T.line2], ['Previous period', T.warn]]} />
    </div>
  );
}

/* ---------- a ring, for a share ---------- */

export function Ring({ part, whole, colour = T.accent, size = 54, label }: { part: number; whole: number; colour?: string; size?: number; label?: string }) {
  const r = (size - 6) / 2, c = 2 * Math.PI * r;
  const share = whole === 0 ? 0 : part / whole;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? `${Math.round(share * 100)}%`} style={{ display: 'block' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.surface3} strokeWidth="5" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colour} strokeWidth="5" strokeDasharray={`${c * share} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dy="4" textAnchor="middle" fontSize="12" fontWeight="600" fill={T.text} fontFamily={T.mono}>{whole === 0 ? '—' : `${Math.round(share * 100)}%`}</text>
    </svg>
  );
}

/* ---------- a calendar heat of weeks × weekdays ---------- */

export function WeekHeat({ days }: { days: { day: string; reported: number }[] }) {
  const cells = useMemo(() => days.map(d => ({ ...d, dow: (new Date(d.day).getUTCDay() + 6) % 7 })), [days]);
  const max = Math.max(1, ...cells.map(c => c.reported));
  const weeks: typeof cells[] = [];
  cells.forEach(c => { if (weeks.length === 0 || c.dow === 0) weeks.push([]); weeks[weeks.length - 1].push(c); });
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
      <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 11px)', gap: 3, fontSize: 8.5, color: T.subtle, fontFamily: T.mono }}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} style={{ lineHeight: '11px' }}>{d}</span>)}</div>
      {weeks.map((w, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateRows: 'repeat(7, 11px)', gap: 3 }}>
          {Array.from({ length: 7 }, (_, dow) => { const c = w.find(x => x.dow === dow); return <span key={dow} title={c ? `${c.day} · ${c.reported}` : ''} style={{ width: 11, height: 11, borderRadius: 2, background: c ? `rgba(56,189,248,${0.12 + (c.reported / max) * 0.85})` : 'transparent' }} />; })}
        </div>
      ))}
    </div>
  );
}

/* ---------- weekday × hour ---------- */

export function Heatmap({ cells, metric = 'reported' }: { cells: { weekday: number; hour: number; reported: number; critical: number; medianAckMinutes: number | null }[]; metric?: 'reported' | 'critical' | 'ack' }) {
  const [hover, setHover] = useState<{ wd: number; h: number } | null>(null);
  const value = (c: typeof cells[number]) => (metric === 'reported' ? c.reported : metric === 'critical' ? c.critical : (c.medianAckMinutes ?? 0));
  const max = Math.max(1, ...cells.map(value));
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const at = (wd: number, h: number) => cells.find(c => c.weekday === wd && c.hour === h);
  const colour = metric === 'critical' ? '255,77,94' : metric === 'ack' ? '255,176,32' : '56,189,248';
  const hovered = hover ? at(hover.wd, hover.h) : null;
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '34px repeat(24, 1fr)', gap: 2 }}>
        <span />
        {Array.from({ length: 24 }, (_, h) => <span key={h} style={{ fontSize: 8.5, color: T.subtle, fontFamily: T.mono, textAlign: 'center' }}>{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>)}
        {days.map((d, wd) => (
          <Fragment key={d}>
            <span style={{ fontSize: 10, color: T.subtle, fontFamily: T.mono, lineHeight: '16px' }}>{d}</span>
            {Array.from({ length: 24 }, (_, h) => { const c = at(wd, h); const v = c ? value(c) : 0; return <div key={h} onMouseEnter={() => setHover({ wd, h })} onMouseLeave={() => setHover(null)} style={{ height: 16, borderRadius: 3, background: v === 0 ? T.surface3 : `rgba(${colour},${0.15 + 0.85 * (v / max)})`, outline: hover?.wd === wd && hover?.h === h ? `1px solid ${T.text}` : 'none' }} />; })}
          </Fragment>
        ))}
      </div>
      <div style={{ fontSize: 11, color: T.muted, marginTop: 6, minHeight: 16 }}>
        {hovered && hover ? <><b>{days[hover.wd]} {String(hover.h).padStart(2, '0')}:00</b> · {hovered.reported} reported · {hovered.critical} critical{hovered.medianAckMinutes !== null ? ` · acknowledged in ${hovered.medianAckMinutes} min` : ''}</> : <>Darker is {metric === 'ack' ? 'slower to acknowledge' : 'busier'}. Hover a cell.</>}
      </div>
    </div>
  );
}

/* ---------- a stacked bar per row ---------- */

export function Stacked({ rows, keys }: { rows: { label: ReactNode; parts: Record<string, number>; total?: number }[]; keys: { key: string; label: string; colour: string }[] }) {
  const max = Math.max(1, ...rows.map(r => r.total ?? Object.values(r.parts).reduce((a, b) => a + b, 0)));
  if (rows.length === 0) return <div style={{ fontSize: 12, color: T.subtle }}>Nothing in this range.</div>;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map((r, i) => {
        const total = r.total ?? Object.values(r.parts).reduce((a, b) => a + b, 0);
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 28%) 1fr 40px', gap: 8, alignItems: 'center', fontSize: 12 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
            <span style={{ display: 'flex', height: 10, width: `${(total / max) * 100}%`, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
              {keys.map(k => (r.parts[k.key] ?? 0) > 0 ? <span key={k.key} title={`${k.label}: ${r.parts[k.key]}`} style={{ width: `${(r.parts[k.key] / total) * 100}%`, background: k.colour }} /> : null)}
            </span>
            <span className="cc-num" style={{ textAlign: 'right', color: T.muted }}>{total}</span>
          </div>
        );
      })}
      <Legend items={keys.map(k => [k.label, k.colour])} />
    </div>
  );
}

/* ---------- lines with a ghost of the period before ---------- */

export function Trend({ labels, series, ghost, height = 200, unit }: { labels: string[]; series: Series[]; ghost?: Series[]; height?: number; unit?: string }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const shown = series.filter(s => !hidden.has(s.key));
  const ghostShown = (ghost ?? []).filter(s => !hidden.has(s.key));
  const width = 720, padL = 36, padR = 12, padT = 12, padB = 24;
  const innerW = width - padL - padR, innerH = height - padT - padB;
  const max = nice(Math.max(1, ...shown.flatMap(s => s.values), ...ghostShown.flatMap(s => s.values)));
  const n = labels.length;
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const path = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const every = Math.max(1, Math.ceil(n / 10));
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" onMouseLeave={() => setHover(null)}
        onMouseMove={e => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * width; setHover(Math.min(n - 1, Math.max(0, Math.round(((px - padL) / innerW) * (n - 1))))); }}>
        <defs>{shown.map(s => <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={s.colour} stopOpacity=".22" /><stop offset="1" stopColor={s.colour} stopOpacity="0" /></linearGradient>)}</defs>
        {[0, max / 4, max / 2, (3 * max) / 4, max].map(tv => <g key={tv}><line x1={padL} x2={width - padR} y1={y(tv)} y2={y(tv)} stroke={T.line} /><text x={padL - 6} y={y(tv) + 3.5} fontSize="9.5" fill={T.subtle} textAnchor="end" fontFamily={T.mono}>{Number.isInteger(tv) ? tv : tv.toFixed(1)}</text></g>)}
        {labels.map((l, i) => (i === n - 1 || (i % every === 0 && n - 1 - i >= every / 2)) ? <text key={i} x={x(i)} y={height - 7} fontSize="9.5" fill={T.subtle} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontFamily={T.mono}>{l}</text> : null)}
        {ghostShown.map(s => s.values.length > 1 ? <path key={`g${s.key}`} d={path(s.values)} fill="none" stroke={s.colour} strokeWidth="1.5" strokeDasharray="3 3" opacity=".45" /> : null)}
        {shown.map(s => s.area && s.values.length > 1 ? <path key={`a${s.key}`} d={`${path(s.values)} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`} fill={`url(#${id}-${s.key})`} /> : null)}
        {shown.map(s => <path key={s.key} d={path(s.values)} fill="none" stroke={s.colour} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
        {hover !== null ? <g><line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke={T.line2} strokeDasharray="2 2" />{shown.map(s => <circle key={`h${s.key}`} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r="3.5" fill={s.colour} stroke={T.surface} strokeWidth="1.5" />)}</g> : null}
        {unit ? <text x={padL} y={padT - 2} fontSize="9" fill={T.subtle}>{unit}</text> : null}
      </svg>
      {hover !== null ? (
        <div style={{ position: 'absolute', top: 4, left: `${(x(hover) / width) * 100}%`, transform: hover > n / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)', background: T.surface3, border: `1px solid ${T.line2}`, borderRadius: 6, padding: '5px 8px', fontSize: 11, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 2 }}>
          <div style={{ color: T.muted, fontFamily: T.mono, marginBottom: 2 }}>{labels[hover]}</div>
          {shown.map(s => <div key={s.key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ width: 7, height: 7, borderRadius: 2, background: s.colour }} />{s.label} <b className="cc-num">{s.values[hover] ?? 0}</b>{ghostShown.find(g => g.key === s.key) ? <span style={{ color: T.subtle }} className="cc-num">· was {ghostShown.find(g => g.key === s.key)!.values[hover] ?? 0}</span> : null}</div>)}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4, fontSize: 11 }}>
        {series.map(s => <button key={s.key} type="button" onClick={() => setHidden(h => { const next = new Set(h); if (next.has(s.key)) next.delete(s.key); else next.add(s.key); return next; })} style={{ display: 'inline-flex', gap: 5, alignItems: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: hidden.has(s.key) ? T.subtle : T.muted, textDecoration: hidden.has(s.key) ? 'line-through' : 'none', padding: 0, fontSize: 11 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: s.colour, opacity: hidden.has(s.key) ? 0.3 : 1 }} />{s.label}</button>)}
        {ghost && ghost.length > 0 ? <span style={{ color: T.subtle, display: 'inline-flex', gap: 5, alignItems: 'center' }}><span style={{ width: 12, borderTop: `1.5px dashed ${T.muted}` }} />period before</span> : null}
      </div>
    </div>
  );
}

/* ---------- a sortable league table ---------- */

export function League<R>({ rows, columns, keyOf, initial, limit = 12 }: { rows: R[]; columns: { key: string; label: string; value: (r: R) => number | string | null; render?: (r: R) => ReactNode; right?: boolean; width?: number | string }[]; keyOf: (r: R) => string; initial: string; limit?: number }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: initial, dir: -1 });
  const [all, setAll] = useState(false);
  const col = columns.find(c => c.key === sort.key) ?? columns[0];
  const sorted = [...rows].sort((a, b) => { const va = col.value(a), vb = col.value(b); if (va === null || va === undefined) return 1; if (vb === null || vb === undefined) return -1; return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * sort.dir; });
  const shown = all ? sorted : sorted.slice(0, limit);
  if (rows.length === 0) return <div style={{ fontSize: 12, color: T.subtle, padding: '8px 0' }}>Nothing in this range.</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr>{columns.map(c => <th key={c.key} onClick={() => setSort(s => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : -1 }))} style={{ textAlign: c.right ? 'right' : 'left', fontSize: 10.5, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', color: sort.key === c.key ? T.accent : T.subtle, padding: '5px 8px', borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap', cursor: 'pointer', width: c.width, userSelect: 'none' }}>{c.label}{sort.key === c.key ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}</th>)}</tr></thead>
        <tbody>{shown.map((r, i) => <tr key={keyOf(r)} className="cc-row">{columns.map((c, j) => <td key={c.key} className={typeof c.value(r) === 'number' ? 'cc-num' : undefined} style={{ textAlign: c.right ? 'right' : 'left', padding: '6px 8px', borderBottom: `1px solid ${T.line}`, color: j === 0 ? T.text : T.muted, fontWeight: j === 0 ? 600 : 400 }}>{j === 0 ? <span style={{ display: 'inline-flex', gap: 8, alignItems: 'baseline' }}><span className="cc-num" style={{ color: T.subtle, fontSize: 10.5, width: 16 }}>{i + 1}</span>{c.render ? c.render(r) : c.value(r)}</span> : (c.render ? c.render(r) : (c.value(r) ?? '—'))}</td>)}</tr>)}</tbody>
      </table>
      {rows.length > limit ? <button type="button" onClick={() => setAll(a => !a)} style={{ border: 'none', background: 'transparent', color: T.accent, fontSize: 11.5, cursor: 'pointer', padding: '6px 8px' }}>{all ? 'Show fewer' : `Show all ${rows.length}`}</button> : null}
    </div>
  );
}

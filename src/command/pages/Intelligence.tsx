/**
 * Intelligence — the same figures the report holds, asked of one place.
 *
 * Open a district, a station, the country, or a ministry's whole portfolio and this is the
 * second tab: what to do first (recommendations, each with the figure that triggered it),
 * where the reports come from (province, district, station), what kind of case they are,
 * how fast each step is answered, and — for a ministry — how the institutions under it
 * compare. Nothing is computed here: the API writes the sentences beside the arithmetic, and
 * this page lays them out so a commander reads the sentence and then finds the number.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CATEGORY, OUTCOME, commandApi, errorWords, type AnalyticsReport, type Recommendation } from '../api';
import { HBars, Ladder, League, Stacked, Trend } from '../charts';
import { LiveMap } from '../LiveMap';
import { T } from '../theme';
import { Btn, Empty, ErrorLine, Eyebrow, Loading, Panel, Pill, Segmented, Tile, minutesWord, pct } from '../ui';
import { useCommand } from '../useCommand';
import { Change } from './Analytics';

const PRIORITY: Record<Recommendation['priority'], { label: string; colour: string; tone: 'bad' | 'warn' | 'info' }> = {
  now: { label: 'Do now', colour: T.bad, tone: 'bad' },
  soon: { label: 'This week', colour: T.warn, tone: 'warn' },
  watch: { label: 'Keep an eye', colour: T.info, tone: 'info' },
};
const OUTCOME_COLOURS: Record<number, string> = { 1: T.good, 2: T.warn, 3: T.series[4], 4: T.subtle, 5: T.bad, 6: T.line2, 7: T.series[0], 8: T.muted };
const CATEGORY_KEYS = [1, 2, 3, 4, 5, 6];

/** What an Intelligence tab is asked about. Empty means the whole desk. */
export type IntelScope = { districtSlug?: string | null; facilityId?: string | null };

export function useIntel(days: number, scope: IntelScope) {
  const { institutionId, tick } = useCommand();
  const [data, setData] = useState<AnalyticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const district = scope.districtSlug ?? null;
  const facility = scope.facilityId ?? null;
  useEffect(() => {
    setData(null);
    commandApi.analytics({ days, institutionId, districtSlug: district, facilityId: facility, compare: true })
      .then(d => { setData(d); setError(null); })
      .catch(caught => setError(errorWords(caught, 'Could not load the intelligence view.')));
  }, [days, institutionId, district, facility, tick]);
  return { data, error };
}

/* ------------------------------------------------------------------ recommendations */

export function Recommendations({ items, onDistrict, onStation }: {
  items: Recommendation[];
  onDistrict?: (slug: string) => void;
  onStation?: (id: string) => void;
}) {
  const now = items.filter(r => r.priority === 'now').length;
  return (
    <Panel flush title={<>What to do{now > 0 ? <span style={{ color: T.bad }}> · {now} now</span> : null}</>} note="each one carries the figure that says why">
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} data-recommendations>
        {items.map((r, i) => {
          const p = PRIORITY[r.priority] ?? PRIORITY.watch;
          const open = r.facilityId && onStation ? () => onStation(r.facilityId!) : r.districtSlug && onDistrict ? () => onDistrict(r.districtSlug!) : null;
          return (
            <li key={`${r.kind}-${i}`} data-priority={r.priority} style={{ display: 'grid', gridTemplateColumns: '4px minmax(0, 1fr) auto', gap: 12, padding: '11px 14px 11px 0', borderBottom: `1px solid ${T.line}`, alignItems: 'start' }}>
              <span style={{ background: p.colour, alignSelf: 'stretch', borderRadius: '0 2px 2px 0' }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Pill tone={p.tone}>{p.label}</Pill>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.headline}</span>
                </div>
                <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55, marginTop: 4, maxWidth: 760 }}>{r.detail}</div>
                {open ? <button type="button" onClick={open} style={{ border: 'none', background: 'transparent', color: T.accent, fontSize: 12, cursor: 'pointer', padding: 0, marginTop: 6 }}>{r.facilityId ? 'Open the station' : 'Open the district'} →</button> : null}
              </div>
              {r.figure ? <span className="cc-num" style={{ fontSize: 18, fontWeight: 600, color: p.colour, whiteSpace: 'nowrap' }}>{r.figure}</span> : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ------------------------------------------------------------------ small tables */

/** A count with a bar behind it, scaled to the biggest in its column. */
function Share({ value, max, colour = T.series[0] }: { value: number; max: number; colour?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', width: '100%' }}>
      <span style={{ height: 6, width: 56, background: T.surface3, borderRadius: 3, overflow: 'hidden', display: 'inline-block' }}>
        <span style={{ display: 'block', height: '100%', width: `${max === 0 ? 0 : Math.max(3, (value / max) * 100)}%`, background: colour }} />
      </span>
      <b className="cc-num" style={{ color: T.text, minWidth: 22, textAlign: 'right' }}>{value}</b>
    </span>
  );
}

const ackColour = (m: number | null) => (m === null ? T.subtle : m <= 5 ? T.good : m >= 15 ? T.bad : m >= 10 ? T.warn : T.muted);

export function RegionTable({ data, compare }: { data: NonNullable<AnalyticsReport['regions']>; compare: boolean }) {
  const max = Math.max(1, ...data.map(r => r.reported));
  return (
    <League rows={data} keyOf={r => r.province} initial="reported" limit={8} columns={[
      { key: 'name', label: 'Region', value: r => r.province, render: r => <>{r.province}<span style={{ color: T.subtle, fontWeight: 400 }}> · {r.districts} {r.districts === 1 ? 'district' : 'districts'}</span></> },
      { key: 'reported', label: 'Reported', value: r => r.reported, right: true, render: r => <Share value={r.reported} max={max} /> },
      { key: 'vs', label: 'vs before', value: r => (r.reportedBefore === 0 ? null : r.reported - r.reportedBefore), right: true, render: r => <Change now={r.reported} before={r.reportedBefore} on={compare} /> },
      { key: 'critical', label: 'P1', value: r => r.critical, right: true, render: r => <span style={{ color: r.critical > 0 ? T.bad : T.subtle }}>{r.critical}</span> },
      { key: 'unrouted', label: 'Unrouted', value: r => r.unrouted, right: true, render: r => <span style={{ color: r.unrouted > 0 ? T.warn : T.subtle }}>{r.unrouted}</span> },
      { key: 'ack', label: 'To ack', value: r => r.medianAckMinutes, right: true, render: r => <span style={{ color: ackColour(r.medianAckMinutes) }}>{minutesWord(r.medianAckMinutes)}</span> },
      { key: 'scene', label: 'To scene', value: r => r.medianSceneMinutes, right: true, render: r => minutesWord(r.medianSceneMinutes) },
      { key: 'mix', label: 'Kinds of case', value: r => r.reported, render: r => <MixBar counts={r.byCategory} total={r.reported} /> },
    ]} />
  );
}

/** Medical … other as one thin stacked bar — the colour of each is the colour of its category everywhere. */
export function MixBar({ counts, total, width = 96 }: { counts: number[]; total: number; width?: number }) {
  if (total === 0) return <span style={{ color: T.subtle }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', height: 8, width, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
      {counts.map((n, i) => n > 0 ? <span key={i} title={`${CATEGORY[i + 1] ?? ''}: ${n}`} style={{ width: `${(n / total) * 100}%`, background: T.series[i % T.series.length] }} /> : null)}
    </span>
  );
}

export function CategoryKey() {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: T.muted }}>
      {CATEGORY_KEYS.map(c => <span key={c} style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><span style={{ width: 9, height: 9, borderRadius: 2, background: T.series[(c - 1) % T.series.length] }} />{CATEGORY[c]}</span>)}
    </div>
  );
}

/** Stations down the side, kinds of case across: where each kind of report is coming from. */
export function MatrixTable({ rows, onStation }: { rows: NonNullable<AnalyticsReport['matrix']>; onStation?: (id: string) => void }) {
  const max = Math.max(1, ...rows.flatMap(r => r.byCategory));
  return (
    <div style={{ overflowX: 'auto' }} data-matrix>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 560 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '5px 10px', fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', color: T.subtle, borderBottom: `1px solid ${T.line}` }}>Station</th>
            {CATEGORY_KEYS.map(c => <th key={c} style={{ textAlign: 'center', padding: '5px 6px', fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', color: T.subtle, borderBottom: `1px solid ${T.line}` }}>{CATEGORY[c]}</th>)}
            <th style={{ textAlign: 'right', padding: '5px 10px', fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', color: T.subtle, borderBottom: `1px solid ${T.line}` }}>All</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.facilityId} className={onStation ? 'cc-row' : undefined} style={{ cursor: onStation ? 'pointer' : 'default' }} onClick={onStation ? () => onStation(r.facilityId) : undefined}>
              <td style={{ padding: '6px 10px', fontWeight: 600, borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap' }}>{r.name}</td>
              {CATEGORY_KEYS.map((c, i) => {
                const n = r.byCategory[i] ?? 0;
                return (
                  <td key={c} className="cc-num" title={`${r.name} · ${CATEGORY[c]}: ${n}`} style={{ textAlign: 'center', padding: '6px', borderBottom: `1px solid ${T.line}`, color: n === 0 ? T.subtle : T.text, background: n === 0 ? 'transparent' : `color-mix(in srgb, ${T.series[i % T.series.length]} ${Math.round(12 + (n / max) * 48)}%, transparent)` }}>{n === 0 ? '·' : n}</td>
                );
              })}
              <td className="cc-num" style={{ textAlign: 'right', padding: '6px 10px', borderBottom: `1px solid ${T.line}`, fontWeight: 600 }}>{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The ministry's table: every institution under it against the others, on the numbers a minister asks for. */
export function InstitutionLeague({ rows, compare }: { rows: NonNullable<AnalyticsReport['institutionsLeague']>; compare: boolean }) {
  const max = Math.max(1, ...rows.map(r => r.reported));
  return (
    <League rows={rows} keyOf={r => r.institutionId} initial="reported" limit={12} columns={[
      { key: 'name', label: 'Institution', value: r => r.name, render: r => <>{r.shortName ?? r.name}<span style={{ color: T.subtle, fontWeight: 400 }}> · {r.sectorName}</span></> },
      { key: 'reported', label: 'Reported', value: r => r.reported, right: true, render: r => <Share value={r.reported} max={max} /> },
      { key: 'vs', label: 'vs before', value: r => (r.reportedBefore === 0 ? null : r.reported - r.reportedBefore), right: true, render: r => <Change now={r.reported} before={r.reportedBefore} on={compare} /> },
      { key: 'critical', label: 'P1', value: r => r.critical, right: true, render: r => <span style={{ color: r.critical > 0 ? T.bad : T.subtle }}>{r.critical}</span> },
      { key: 'open', label: 'Open', value: r => r.stillOpen, right: true },
      { key: 'unrouted', label: 'Unrouted', value: r => r.unrouted, right: true, render: r => <span style={{ color: r.unrouted > 0 ? T.warn : T.subtle }}>{r.unrouted}</span> },
      { key: 'ten', label: '≤10 min', value: r => r.acknowledgedWithinTenPct, right: true, render: r => (r.acknowledgedWithinTenPct === null ? '—' : <span style={{ color: r.acknowledgedWithinTenPct >= 80 ? T.good : r.acknowledgedWithinTenPct < 50 ? T.warn : T.muted }}>{r.acknowledgedWithinTenPct}%</span>) },
      { key: 'ack', label: 'To ack', value: r => r.medianAckMinutes, right: true, render: r => <span style={{ color: ackColour(r.medianAckMinutes) }}>{minutesWord(r.medianAckMinutes)}</span> },
      { key: 'scene', label: 'To scene', value: r => r.medianSceneMinutes, right: true, render: r => minutesWord(r.medianSceneMinutes) },
      { key: 'mix', label: 'Kinds of case', value: r => r.reported, render: r => <MixBar counts={r.byCategory} total={r.reported} /> },
    ]} />
  );
}

/** Per kind of case: how many, against before, how many critical, and how long each step took. */
export function CaseTypeTable({ data, compare }: { data: AnalyticsReport['categories']; compare: boolean }) {
  return (
    <League rows={data.filter(c => c.reported > 0 || c.reportedBefore > 0)} keyOf={c => String(c.category)} initial="reported" limit={8} columns={[
      { key: 'name', label: 'Kind of case', value: c => CATEGORY[c.category] ?? c.label, render: c => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: T.series[(c.category - 1) % T.series.length] }} />{CATEGORY[c.category] ?? c.label}</span> },
      { key: 'reported', label: 'Reported', value: c => c.reported, right: true },
      { key: 'vs', label: 'vs before', value: c => (c.reportedBefore === 0 ? null : c.reported - c.reportedBefore), right: true, render: c => <Change now={c.reported} before={c.reportedBefore} on={compare} /> },
      { key: 'critical', label: 'P1', value: c => c.critical, right: true, render: c => <span style={{ color: c.critical > 0 ? T.bad : T.subtle }}>{c.critical}</span> },
      { key: 'resolved', label: 'Resolved', value: c => c.resolved, right: true, render: c => pct(c.resolved, c.reported) },
      { key: 'ack', label: 'To ack', value: c => c.medianAckMinutes, right: true, render: c => <span style={{ color: ackColour(c.medianAckMinutes) }}>{minutesWord(c.medianAckMinutes)}</span> },
      { key: 'scene', label: 'To scene', value: c => c.medianSceneMinutes, right: true, render: c => minutesWord(c.medianSceneMinutes) },
    ]} />
  );
}

/* ------------------------------------------------------------------ the two views of a page */

export type PageView = 'overview' | 'intel';

/** Which of a page's two views is showing, kept in the address so a link opens the same one. */
export function usePageView(): [PageView, (view: PageView) => void] {
  const [params, setParams] = useSearchParams();
  const view: PageView = params.get('view') === 'intel' ? 'intel' : 'overview';
  const set = (next: PageView) => {
    const p = new URLSearchParams(params);
    if (next === 'intel') p.set('view', 'intel'); else p.delete('view');
    setParams(p, { replace: true });
  };
  return [view, set];
}

export function ViewTabs({ value, onChange }: { value: PageView; onChange: (view: PageView) => void }) {
  return <Segmented value={value} onChange={onChange} options={[['overview', 'Overview'], ['intel', 'Intelligence']]} />;
}

/* ------------------------------------------------------------------ the tab */

export function Intelligence({ days, scope, title, open = true }: { days: number; scope: IntelScope; title?: ReactNode; open?: boolean }) {
  const { shapes } = useCommand();
  const navigate = useNavigate();
  const { data, error } = useIntel(days, scope);
  const toDistrict = (slug: string) => navigate(`/districts/${slug}`);
  const toStation = (id: string) => navigate(`/stations/${id}`);
  const labels = useMemo(() => data?.series.map(p => (data.window.granularity === 'month' ? p.bucket : p.bucket.slice(5))) ?? [], [data]);

  if (!open) return null;
  if (error) return <ErrorLine>{error}</ErrorLine>;
  if (!data) return <Loading label="Working out what the numbers say…" />;

  const h = data.headline;
  const compare = !!data.window.compareFrom;
  const several = (data.window.institutions ?? 1) > 1;
  const regions = data.regions ?? [];
  const matrix = data.matrix ?? [];
  const league = data.institutionsLeague ?? [];
  const showDistricts = !scope.districtSlug && !scope.facilityId && data.districts.length > 1;
  const showStations = !scope.facilityId && data.stations.length > 1;
  const hotspots = data.hotspots;
  const paramsKey = new URLSearchParams({ days: String(days), ...(scope.districtSlug ? { d: scope.districtSlug } : {}) }).toString();

  return (
    <div style={{ display: 'grid', gap: 12 }} data-intelligence>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11.5, color: T.subtle }}>{title ?? data.window.scope} · {data.window.from.slice(0, 10)} → {data.window.to.slice(0, 10)} · {h.reported} {h.reported === 1 ? 'report' : 'reports'}{several ? ` across ${data.window.institutions} institutions` : ''}</div>
        <span style={{ flex: 1 }} />
        <Btn size="xs" onClick={() => navigate(`/analytics?${paramsKey}`)}>Open the full report</Btn>
      </div>

      <Recommendations items={data.recommendations ?? []} onDistrict={scope.districtSlug ? undefined : toDistrict} onStation={toStation} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <Tile label="Reported" value={h.reported} note={<Change now={h.reported} before={h.reportedBefore} on={compare} />} />
        <Tile label="Critical" value={h.critical} tone={h.critical > 0 ? T.bad : undefined} note={<Change now={h.critical} before={h.criticalBefore} on={compare} invert />} />
        <Tile label="Answered ≤ 10 min" value={h.acknowledgedWithinTenPct === null ? '—' : `${h.acknowledgedWithinTenPct}%`} tone={h.acknowledgedWithinTenPct !== null && h.acknowledgedWithinTenPct >= 80 ? T.good : h.acknowledgedWithinTenPct !== null && h.acknowledgedWithinTenPct < 50 ? T.warn : undefined} note={<Change now={h.acknowledgedWithinTenPct} before={h.acknowledgedWithinTenPctBefore} on={compare} points />} />
        <Tile label="Median to answer" value={h.ladder.toAcknowledge.medianMinutes ?? '—'} note={<>min · 90th {minutesWord(h.ladder.toAcknowledge.p90Minutes)}</>} />
        <Tile label="Median to scene" value={h.ladder.toScene.medianMinutes ?? '—'} note={<>min · {h.ladder.toScene.count} measured</>} />
        <Tile label="Unrouted" value={h.unrouted} tone={h.unrouted > 0 ? T.warn : undefined} note={<Change now={h.unrouted} before={h.unroutedBefore} on={compare} invert />} />
      </div>

      {several && league.length > 1 ? (
        <Panel flush title="The institutions under this ministry" note="ranked on the same figures, read-only">
          <div style={{ padding: '4px 8px' }}><InstitutionLeague rows={league} compare={compare} /></div>
        </Panel>
      ) : null}

      <div className="cc-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
        {regions.length > 1 ? (
          <Panel flush title="By region" note={`${regions.length} of the country's regions`}>
            <div style={{ padding: '4px 8px' }}><RegionTable data={regions} compare={compare} /></div>
          </Panel>
        ) : null}
        {showDistricts ? (
          <Panel flush title="By district" note={`${data.districts.length} with reports`}>
            <div style={{ padding: '4px 8px' }}>
              <League rows={data.districts} keyOf={d => d.slug} initial="reported" limit={8} columns={[
                { key: 'name', label: 'District', value: d => d.name, render: d => <button type="button" onClick={() => toDistrict(d.slug)} style={{ border: 'none', background: 'transparent', color: T.text, fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 12 }}>{d.name}</button> },
                { key: 'reported', label: 'Reported', value: d => d.reported, right: true },
                { key: 'critical', label: 'P1', value: d => d.critical, right: true, render: d => <span style={{ color: d.critical > 0 ? T.bad : T.subtle }}>{d.critical}</span> },
                { key: 'ack', label: 'To ack', value: d => d.medianAckMinutes, right: true, render: d => <span style={{ color: ackColour(d.medianAckMinutes) }}>{minutesWord(d.medianAckMinutes)}</span> },
                { key: 'mix', label: 'Kinds of case', value: d => d.reported, render: d => <MixBar counts={d.byCategory} total={d.reported} /> },
              ]} />
            </div>
          </Panel>
        ) : null}
        {showStations ? (
          <Panel flush title="By police station" note={`${data.stations.length} answering`}>
            <div style={{ padding: '4px 8px' }}>
              <League rows={data.stations} keyOf={s => s.facilityId} initial="reported" limit={10} columns={[
                { key: 'name', label: 'Station', value: s => s.name, render: s => <button type="button" onClick={() => toStation(s.facilityId)} style={{ border: 'none', background: 'transparent', color: T.text, fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 12, textAlign: 'left' }}>{s.name}</button> },
                { key: 'reported', label: 'Reported', value: s => s.reported, right: true },
                { key: 'critical', label: 'P1', value: s => s.critical, right: true, render: s => <span style={{ color: s.critical > 0 ? T.bad : T.subtle }}>{s.critical}</span> },
                { key: 'ten', label: '≤10', value: s => s.acknowledgedWithinTenPct, right: true, render: s => (s.acknowledgedWithinTenPct === null ? '—' : <span style={{ color: s.acknowledgedWithinTenPct >= 80 ? T.good : s.acknowledgedWithinTenPct < 50 ? T.warn : T.muted }}>{s.acknowledgedWithinTenPct}%</span>) },
                { key: 'ack', label: 'Ack', value: s => s.medianAckMinutes, right: true, render: s => <span style={{ color: ackColour(s.medianAckMinutes) }}>{s.medianAckMinutes === null ? '—' : `${s.medianAckMinutes}m`}</span> },
                { key: 'scene', label: 'Scene', value: s => s.medianSceneMinutes, right: true, render: s => (s.medianSceneMinutes === null ? '—' : `${s.medianSceneMinutes}m`) },
                { key: 'esc', label: 'Esc.', value: s => s.escalations, right: true, render: s => <span style={{ color: s.escalations > 0 ? T.warn : T.subtle }}>{s.escalations}</span> },
              ]} />
            </div>
          </Panel>
        ) : null}
        <Panel flush title="By kind of case" note="and how fast each is answered">
          <div style={{ padding: '4px 8px' }}><CaseTypeTable data={data.categories} compare={compare} /></div>
        </Panel>
      </div>

      {matrix.length > 1 ? (
        <Panel flush title="Where each kind of case comes from" note="station × kind of case" action={<CategoryKey />}>
          <div style={{ padding: '4px 4px' }}><MatrixTable rows={matrix} onStation={toStation} /></div>
        </Panel>
      ) : null}

      <div className="cc-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
        <Panel title="Response time" note="median at each step, against the period before">
          <Ladder steps={[
            { label: 'Answered', median: h.ladder.toAcknowledge.medianMinutes, before: h.ladderBefore.toAcknowledge.medianMinutes, p90: h.ladder.toAcknowledge.p90Minutes, count: h.ladder.toAcknowledge.count },
            { label: 'Somebody sent', median: h.ladder.toAssign.medianMinutes, before: h.ladderBefore.toAssign.medianMinutes, p90: h.ladder.toAssign.p90Minutes, count: h.ladder.toAssign.count },
            { label: 'On the way', median: h.ladder.toEnRoute.medianMinutes, before: h.ladderBefore.toEnRoute.medianMinutes, p90: h.ladder.toEnRoute.p90Minutes, count: h.ladder.toEnRoute.count },
            { label: 'On scene', median: h.ladder.toScene.medianMinutes, before: h.ladderBefore.toScene.medianMinutes, p90: h.ladder.toScene.p90Minutes, count: h.ladder.toScene.count },
            { label: 'Resolved', median: h.ladder.toResolve.medianMinutes, before: h.ladderBefore.toResolve.medianMinutes, p90: h.ladder.toResolve.p90Minutes, count: h.ladder.toResolve.count },
          ]} />
          <div style={{ marginTop: 12 }}>
            <Eyebrow style={{ marginBottom: 6 }}>Speed by {data.window.granularity}</Eyebrow>
            <Trend labels={labels} height={120} unit="minutes" series={[
              { key: 'ack', label: 'To answer', colour: T.series[0], values: data.series.map(p => p.medianAckMinutes ?? 0) },
              { key: 'scene', label: 'To scene', colour: T.series[1], values: data.series.map(p => p.medianSceneMinutes ?? 0) },
            ]} />
          </div>
        </Panel>
        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <Panel title="What became of them" note="by kind of case">
            <Stacked rows={data.categories.filter(c => c.reported > 0).map(c => ({ label: CATEGORY[c.category] ?? c.label, total: c.reported, parts: Object.fromEntries(c.outcomes.map(o => [String(o.outcome), o.count])) }))}
              keys={Object.entries(OUTCOME).map(([v, l]) => ({ key: v, label: l, colour: OUTCOME_COLOURS[Number(v)] ?? T.muted }))} />
          </Panel>
          <Panel title="Most reported" note="top situations">
            <HBars rows={data.situations.slice(0, 8).map(s => ({ label: s.words, value: s.count, colour: T.series[(s.category - 1) % T.series.length], note: `${s.critical} critical · answered in ${minutesWord(s.medianAckMinutes)}` }))} />
          </Panel>
        </div>
      </div>

      {hotspots.length > 0 && !scope.facilityId ? (
        <Panel title="Where, on the map" note={`${hotspots.length} clusters · private reports are never placed`} flush>
          <div style={{ height: 300 }}><LiveMap live={null} shapes={shapes} hotspots={hotspots} fit height="100%" /></div>
        </Panel>
      ) : null}

      {h.reported === 0 ? <Panel><Empty>Nothing has been reported in this window. The recommendations start at ten reports.</Empty></Panel> : null}
    </div>
  );
}

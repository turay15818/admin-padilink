/**
 * The report.
 *
 * One window, chosen at the top, and every question a Ministry asks of it answered below:
 * how many and how that compares, how fast at each step of the ladder, when in the week and
 * the day, where on the map and in which district, which stations, responders and
 * dispatchers answered, what was reported and what became of it. The sentences at the top
 * are written by the API beside the arithmetic, so a sentence can never contradict the
 * chart under it. Everything is scoped to this desk by the API; a national desk sees the
 * country or the institution it is standing at.
 *
 * "Print" opens the same figures as a white report for a PDF or paper.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CATEGORY, OUTCOME, RESPONDER_ROLE, SEVERITY_WORDS, commandApi, errorWords, type AnalyticsReport, type AnalyticsRequest } from '../api';
import { HBars, Heatmap, Ladder, League, Ring, Stacked, Trend } from '../charts';
import { LiveMap } from '../LiveMap';
import { T } from '../theme';
import { Btn, Empty, ErrorLine, Eyebrow, Input, Loading, Panel, Segmented, Select, Tile, delta, minutesWord, pct } from '../ui';
import { useCommand } from '../useCommand';
import { CaseTypeTable, CategoryKey, InstitutionLeague, MatrixTable, Recommendations, RegionTable } from './Intelligence';

const OUTCOME_COLOURS: Record<number, string> = { 1: T.good, 2: T.warn, 3: T.series[4], 4: T.subtle, 5: T.bad, 6: T.line2, 7: T.series[0], 8: T.muted };

export type Filters = { days: number; from: string; to: string; granularity: '' | 'day' | 'week' | 'month'; category: string; severity: string; district: string; compare: boolean };
export const DEFAULT_FILTERS: Filters = { days: 30, from: '', to: '', granularity: '', category: '', severity: '', district: '', compare: true };

export function filtersFromParams(p: URLSearchParams): Filters {
  return { days: Number(p.get('days') ?? 30) || 30, from: p.get('from') ?? '', to: p.get('to') ?? '', granularity: (p.get('g') as Filters['granularity']) ?? '', category: p.get('cat') ?? '', severity: p.get('sev') ?? '', district: p.get('d') ?? '', compare: p.get('cmp') !== '0' };
}
export function paramsFromFilters(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.from && f.to) { p.set('from', f.from); p.set('to', f.to); } else if (f.days !== 30) p.set('days', String(f.days));
  if (f.granularity) p.set('g', f.granularity);
  if (f.category) p.set('cat', f.category);
  if (f.severity) p.set('sev', f.severity);
  if (f.district) p.set('d', f.district);
  if (!f.compare) p.set('cmp', '0');
  return p;
}
export function requestFrom(f: Filters, institutionId: string | null): AnalyticsRequest {
  return { days: f.days, from: f.from && f.to ? f.from : null, to: f.from && f.to ? f.to : null, granularity: f.granularity || null, institutionId, category: f.category ? Number(f.category) : null, severity: f.severity ? Number(f.severity) : null, districtSlug: f.district || null, compare: f.compare };
}

export function useReport(filters: Filters) {
  const { institutionId } = useCommand();
  const [data, setData] = useState<AnalyticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(requestFrom(filters, institutionId));
  useEffect(() => {
    setData(null);
    commandApi.analytics(JSON.parse(key) as AnalyticsRequest).then(d => { setData(d); setError(null); }).catch(caught => setError(errorWords(caught, 'Could not load the report.')));
  }, [key]);
  return { data, error, request: JSON.parse(key) as AnalyticsRequest };
}

export function Analytics() {
  const { shapes, institutionName, access } = useCommand();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const setFilters = (next: Partial<Filters>) => setParams(paramsFromFilters({ ...filters, ...next }), { replace: true });
  const { data, error, request } = useReport(filters);
  const [exporting, setExporting] = useState(false);

  const exportCsv = () => {
    setExporting(true);
    commandApi.analyticsExport(request).then(x => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([x.csv], { type: 'text/csv;charset=utf-8' })); a.download = x.fileName; a.click(); URL.revokeObjectURL(a.href); }).catch(() => { /* the button says nothing happened */ }).finally(() => setExporting(false));
  };

  const h = data?.headline;
  const labels = data?.series.map(p => data.window.granularity === 'month' ? p.bucket : p.bucket.slice(5)) ?? [];
  const hotspots = data?.hotspots ?? [];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Segmented value={filters.from && filters.to ? 0 : filters.days} onChange={d => setFilters({ days: d as number, from: '', to: '' })} options={[[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, 'Year'], ...(filters.from && filters.to ? [[0, 'Custom'] as [number, string]] : [])]} />
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <span style={{ width: 128 }}><Input value={filters.from} onChange={v => setFilters({ from: v })} type="date" /></span>
          <span style={{ color: T.subtle }}>→</span>
          <span style={{ width: 128 }}><Input value={filters.to} onChange={v => setFilters({ to: v })} type="date" /></span>
        </span>
        <Segmented size="xs" value={filters.granularity} onChange={g => setFilters({ granularity: g })} options={[['', 'Auto'], ['day', 'Day'], ['week', 'Week'], ['month', 'Month']]} />
        <span style={{ width: 130 }}><Select value={filters.category} onChange={v => setFilters({ category: v })}><option value="">Every category</option>{Object.entries(CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></span>
        <span style={{ width: 120 }}><Select value={filters.severity} onChange={v => setFilters({ severity: v })}><option value="">Every severity</option>{Object.entries(SEVERITY_WORDS).map(([v, l]) => <option key={v} value={v}>P{v} {l}</option>)}</Select></span>
        <span style={{ width: 150 }}><Select value={filters.district} onChange={v => setFilters({ district: v })}><option value="">Every district</option>{shapes.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}</Select></span>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, color: T.muted, cursor: 'pointer' }}><input type="checkbox" checked={filters.compare} onChange={e => setFilters({ compare: e.target.checked })} style={{ accentColor: T.accent }} /> compare</label>
        <span style={{ flex: 1 }} />
        <Btn size="xs" disabled={!data || exporting} onClick={exportCsv}>{exporting ? 'Preparing…' : 'Incidents CSV'}</Btn>
        <Btn size="xs" tone="accent" disabled={!data} onClick={() => navigate(`/analytics/report?${paramsFromFilters(filters).toString()}`)}>Print report</Btn>
      </div>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      {!data || !h ? <Loading label="Working the numbers…" /> : (<>
        <div style={{ fontSize: 11.5, color: T.subtle }}>{data.window.from.slice(0, 10)} → {data.window.to.slice(0, 10)} · {data.window.days} days by {data.window.granularity} · {institutionName ?? data.window.scope}{data.window.filters ? ` · ${data.window.filters}` : ''}{data.window.compareFrom ? ` · compared with ${data.window.compareFrom.slice(0, 10)} → ${data.window.compareTo!.slice(0, 10)}` : ''}</div>

        {/* the paragraph */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
          {data.findings.map((f, i) => (
            <div key={i} style={{ border: `1px solid ${f.tone === 'bad' ? 'rgba(255,77,94,.4)' : f.tone === 'warn' ? 'rgba(255,176,32,.35)' : f.tone === 'good' ? 'rgba(45,212,160,.35)' : T.line}`, borderLeft: `3px solid ${f.tone === 'bad' ? T.bad : f.tone === 'warn' ? T.warn : f.tone === 'good' ? T.good : T.accent}`, borderRadius: T.radius, padding: '10px 12px', background: T.surface, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {f.figure ? <span className="cc-num" style={{ fontSize: 20, fontWeight: 600, color: f.tone === 'bad' ? T.bad : f.tone === 'warn' ? T.warn : f.tone === 'good' ? T.good : T.text, whiteSpace: 'nowrap', lineHeight: 1.1 }}>{f.figure}</span> : null}
              <span style={{ fontSize: 12.5, lineHeight: 1.5, color: T.text }}>{f.text}</span>
            </div>
          ))}
        </div>

        {/* what to do */}
        {(data.recommendations?.length ?? 0) > 0 ? <Recommendations items={data.recommendations!} onDistrict={slug => setFilters({ district: slug })} onStation={id => navigate(`/stations/${id}`)} /> : null}

        {/* the numbers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(136px, 1fr))', gap: 8 }}>
          <Tile label="Reported" value={h.reported} note={<Change now={h.reported} before={h.reportedBefore} on={filters.compare} />} />
          <Tile label="Resolved" value={pct(h.resolved, h.reported)} note={<>{h.resolved} of {h.reported} · {h.stillOpen} still open</>} />
          <Tile label="Critical" value={h.critical} tone={h.critical > 0 ? T.bad : undefined} note={<Change now={h.critical} before={h.criticalBefore} on={filters.compare} invert />} />
          <Tile label="Acknowledged ≤ 10 min" value={h.acknowledgedWithinTenPct === null ? '—' : `${h.acknowledgedWithinTenPct}%`} tone={h.acknowledgedWithinTenPct !== null && h.acknowledgedWithinTenPct >= 80 ? T.good : h.acknowledgedWithinTenPct !== null && h.acknowledgedWithinTenPct < 50 ? T.warn : undefined} note={<Change now={h.acknowledgedWithinTenPct} before={h.acknowledgedWithinTenPctBefore} on={filters.compare} points />} />
          <Tile label="On scene ≤ 30 min" value={h.onSceneWithinThirtyPct === null ? '—' : `${h.onSceneWithinThirtyPct}%`} note={<Change now={h.onSceneWithinThirtyPct} before={h.onSceneWithinThirtyPctBefore} on={filters.compare} points />} />
          <Tile label="Median to acknowledge" value={h.ladder.toAcknowledge.medianMinutes ?? '—'} note={<>min · 90th {minutesWord(h.ladder.toAcknowledge.p90Minutes)}</>} />
          <Tile label="Median to scene" value={h.ladder.toScene.medianMinutes ?? '—'} note={<>min · {h.ladder.toScene.count} measured</>} />
          <Tile label="Unrouted" value={h.unrouted} tone={h.unrouted > 0 ? T.warn : undefined} note={<Change now={h.unrouted} before={h.unroutedBefore} on={filters.compare} invert />} />
          <Tile label="Sent" value={h.assignmentsMade} note={<>{h.assignmentsDeclined} declined · {h.assignmentsStoodDown} stood down · accept {minutesWord(h.toAccept.medianMinutes)}</>} />
          <Tile label="Escalations" value={h.escalations} tone={h.escalations > 0 ? T.warn : undefined} note={<Change now={h.escalations} before={h.escalationsBefore} on={filters.compare} invert />} />
          <Tile label="People affected" value={h.peopleAffected} note={<>{h.childrenInvolved} with children · {h.anonymous} anonymous</>} />
          <Tile label="Coverage" value={<Ring part={h.reported - h.unrouted} whole={h.reported} size={44} />} note={<>{pct(h.withPin, h.reported)} with a pin · {pct(h.withEvidence, h.reported)} with evidence</>} />
        </div>

        {/* the trend */}
        <div className="cc-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 12 }}>
          <Panel title={`Volume by ${data.window.granularity}`} note={filters.compare && data.seriesBefore.length ? 'dashed: the period before' : undefined}>
            <Trend labels={labels} series={[
              { key: 'r', label: 'Reported', colour: T.series[0], values: data.series.map(p => p.reported), area: true },
              { key: 's', label: 'Resolved', colour: T.series[2], values: data.series.map(p => p.resolved) },
              { key: 'c', label: 'Critical', colour: T.bad, values: data.series.map(p => p.critical) },
              { key: 'a', label: 'Sent', colour: T.series[3], values: data.series.map(p => p.assignments) },
              { key: 'e', label: 'Escalations', colour: T.series[4], values: data.series.map(p => p.escalations) },
              { key: 'u', label: 'Unrouted', colour: T.warn, values: data.series.map(p => p.unrouted) },
            ]} ghost={filters.compare && data.seriesBefore.length === data.series.length ? [{ key: 'r', label: 'Reported', colour: T.series[0], values: data.seriesBefore.map(p => p.reported) }, { key: 'c', label: 'Critical', colour: T.bad, values: data.seriesBefore.map(p => p.critical) }] : undefined} />
          </Panel>
          <Panel title="Response ladder" note="median vs the period before">
            <Ladder steps={[
              { label: 'Acknowledged', median: h.ladder.toAcknowledge.medianMinutes, before: h.ladderBefore.toAcknowledge.medianMinutes, p90: h.ladder.toAcknowledge.p90Minutes, count: h.ladder.toAcknowledge.count },
              { label: 'Somebody sent', median: h.ladder.toAssign.medianMinutes, before: h.ladderBefore.toAssign.medianMinutes, p90: h.ladder.toAssign.p90Minutes, count: h.ladder.toAssign.count },
              { label: 'On the way', median: h.ladder.toEnRoute.medianMinutes, before: h.ladderBefore.toEnRoute.medianMinutes, p90: h.ladder.toEnRoute.p90Minutes, count: h.ladder.toEnRoute.count },
              { label: 'On scene', median: h.ladder.toScene.medianMinutes, before: h.ladderBefore.toScene.medianMinutes, p90: h.ladder.toScene.p90Minutes, count: h.ladder.toScene.count },
              { label: 'Resolved', median: h.ladder.toResolve.medianMinutes, before: h.ladderBefore.toResolve.medianMinutes, p90: h.ladder.toResolve.p90Minutes, count: h.ladder.toResolve.count },
            ]} />
            <div style={{ marginTop: 14 }}>
              <Eyebrow style={{ marginBottom: 6 }}>Speed by {data.window.granularity}</Eyebrow>
              <Trend labels={labels} height={130} unit="minutes" series={[
                { key: 'ack', label: 'To acknowledge', colour: T.series[0], values: data.series.map(p => p.medianAckMinutes ?? 0) },
                { key: 'scene', label: 'To scene', colour: T.series[1], values: data.series.map(p => p.medianSceneMinutes ?? 0) },
              ]} />
            </div>
          </Panel>
        </div>

        {/* when and where */}
        <div className="cc-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
          <Panel title="When — weekday × hour">
            <HeatmapWithMetric cells={data.heatmap} />
          </Panel>
          <Panel title="Where — hotspots" note={`${hotspots.length} clusters · private incidents never placed`} flush>
            <div style={{ height: 320 }}><LiveMap live={null} shapes={shapes} hotspots={hotspots} fit height="100%" /></div>
          </Panel>
        </div>

        {(data.window.institutions ?? 1) > 1 && (data.institutionsLeague?.length ?? 0) > 1 ? (
          <Panel flush title="Institutions" note={`${data.institutionsLeague!.length} compared on the same figures`}>
            <div style={{ padding: '4px 8px' }}><InstitutionLeague rows={data.institutionsLeague!} compare={filters.compare} /></div>
          </Panel>
        ) : null}

        <div className="cc-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
          {(data.regions?.length ?? 0) > 1 ? <Panel flush title="Regions" note="provinces, rolled up from their districts"><div style={{ padding: '4px 8px' }}><RegionTable data={data.regions!} compare={filters.compare} /></div></Panel> : null}
          <Panel flush title="Kinds of case" note="and how fast each is answered"><div style={{ padding: '4px 8px' }}><CaseTypeTable data={data.categories} compare={filters.compare} /></div></Panel>
        </div>
        {(data.matrix?.length ?? 0) > 1 ? (
          <Panel flush title="Where each kind of case comes from" note="station × kind of case" action={<CategoryKey />}>
            <div style={{ padding: '4px 4px' }}><MatrixTable rows={data.matrix!} onStation={id => navigate(`/stations/${id}`)} /></div>
          </Panel>
        ) : null}

        <div className="cc-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 12 }}>
          <Panel title="Districts" note={`${data.districts.length} with reports`} flush>
            <div style={{ padding: '4px 8px' }}>
              <League rows={data.districts} keyOf={d => d.slug} initial="reported" columns={[
                { key: 'name', label: 'District', value: d => d.name, render: d => <>{d.name}{d.topSituation ? <span style={{ color: T.subtle, fontWeight: 400 }}> · {d.topSituation}</span> : null}</> },
                { key: 'reported', label: 'Reported', value: d => d.reported, right: true, render: d => <><b className="cc-num" style={{ color: T.text }}>{d.reported}</b>{filters.compare ? <span className="cc-num" style={{ color: T.subtle, fontSize: 10.5 }}> · {d.reportedBefore}</span> : null}</> },
                { key: 'critical', label: 'P1', value: d => d.critical, right: true, render: d => <span style={{ color: d.critical > 0 ? T.bad : T.subtle }}>{d.critical}</span> },
                { key: 'unrouted', label: 'Unrouted', value: d => d.unrouted, right: true, render: d => <span style={{ color: d.unrouted > 0 ? T.warn : T.subtle }}>{d.unrouted}</span> },
                { key: 'ack', label: 'To ack', value: d => d.medianAckMinutes, right: true, render: d => minutesWord(d.medianAckMinutes) },
                { key: 'scene', label: 'To scene', value: d => d.medianSceneMinutes, right: true, render: d => minutesWord(d.medianSceneMinutes) },
                { key: 'mix', label: 'Severity mix', value: d => d.reported, render: d => <span style={{ display: 'inline-flex', height: 8, width: 90, borderRadius: 3, overflow: 'hidden', gap: 1 }}>{d.bySeverity.map((n, i) => n > 0 ? <span key={i} title={`P${i + 1}: ${n}`} style={{ width: `${(n / d.reported) * 100}%`, background: T.severity[i] }} /> : null)}</span> },
              ]} />
            </div>
          </Panel>
          <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
            <Panel title="What — by category and outcome">
              <Stacked rows={data.categories.map(c => ({ label: CATEGORY[c.category] ?? c.label, total: c.reported, parts: Object.fromEntries(c.outcomes.map(o => [String(o.outcome), o.count])) }))} keys={Object.entries(OUTCOME).map(([v, l]) => ({ key: v, label: l, colour: OUTCOME_COLOURS[Number(v)] ?? T.muted }))} />
            </Panel>
            <Panel title="Situations" note="top 15">
              <HBars rows={data.situations.map(s => ({ label: s.words, value: s.count, colour: T.series[(s.category - 1) % T.series.length], note: `${s.critical} critical · acknowledged in ${minutesWord(s.medianAckMinutes)}` }))} />
            </Panel>
          </div>
        </div>

        {/* who */}
        <div className="cc-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          <Panel title="Stations" note={`${data.stations.length} answered`} flush>
            <div style={{ padding: '4px 8px' }}>
              <League rows={data.stations} keyOf={s => s.facilityId} initial="reported" limit={8} columns={[
                { key: 'name', label: 'Station', value: s => s.name, render: s => <>{s.name}{access.national ? <span style={{ color: T.subtle, fontWeight: 400 }}> · {s.institutionName}</span> : null}</> },
                { key: 'reported', label: 'Rep.', value: s => s.reported, right: true },
                { key: 'ten', label: '≤10', value: s => s.acknowledgedWithinTenPct, right: true, render: s => s.acknowledgedWithinTenPct === null ? '—' : <span style={{ color: s.acknowledgedWithinTenPct >= 80 ? T.good : s.acknowledgedWithinTenPct < 50 ? T.warn : T.muted }}>{s.acknowledgedWithinTenPct}%</span> },
                { key: 'ack', label: 'Ack', value: s => s.medianAckMinutes, right: true, render: s => s.medianAckMinutes === null ? '—' : `${s.medianAckMinutes}m` },
                { key: 'scene', label: 'Scene', value: s => s.medianSceneMinutes, right: true, render: s => s.medianSceneMinutes === null ? '—' : `${s.medianSceneMinutes}m` },
                { key: 'sent', label: 'Sent', value: s => s.assignments, right: true },
                { key: 'esc', label: 'Esc.', value: s => s.escalations, right: true, render: s => <span style={{ color: s.escalations > 0 ? T.warn : T.subtle }}>{s.escalations}</span> },
              ]} />
            </div>
          </Panel>
          <Panel title="Responders" note={`${data.responders.length} sent at least once`} flush>
            <div style={{ padding: '4px 8px' }}>
              <League rows={data.responders} keyOf={r => r.responderId} initial="completed" limit={8} columns={[
                { key: 'name', label: 'Responder', value: r => r.name, render: r => <>{r.name}<span style={{ color: T.subtle, fontWeight: 400 }}> · {RESPONDER_ROLE[r.role]?.toLowerCase()}</span></> },
                { key: 'assigned', label: 'Sent', value: r => r.assigned, right: true },
                { key: 'completed', label: 'Done', value: r => r.completed, right: true },
                { key: 'declined', label: 'Decl.', value: r => r.declined, right: true, render: r => <span style={{ color: r.declined > 0 ? T.warn : T.subtle }}>{r.declined}</span> },
                { key: 'accept', label: 'Accept', value: r => r.medianAcceptMinutes, right: true, render: r => r.medianAcceptMinutes === null ? '—' : `${r.medianAcceptMinutes}m` },
                { key: 'scene', label: 'Scene', value: r => r.medianOnSceneMinutes, right: true, render: r => r.medianOnSceneMinutes === null ? '—' : `${r.medianOnSceneMinutes}m` },
              ]} />
            </div>
          </Panel>
          <Panel title="Dispatchers" note={`${data.dispatchers.length} worked the desk`} flush>
            <div style={{ padding: '4px 8px' }}>
              <League rows={data.dispatchers} keyOf={d => d.userId} initial="acknowledged" limit={8} columns={[
                { key: 'name', label: 'Dispatcher', value: d => d.name, render: d => <>{d.name}{access.national && d.institutionName ? <span style={{ color: T.subtle, fontWeight: 400 }}> · {d.institutionName}</span> : null}</> },
                { key: 'acknowledged', label: 'Ack’d', value: d => d.acknowledged, right: true },
                { key: 'ten', label: '≤10', value: d => d.acknowledgedWithinTenPct, right: true, render: d => d.acknowledgedWithinTenPct === null ? '—' : `${d.acknowledgedWithinTenPct}%` },
                { key: 'median', label: 'Median', value: d => d.medianAckMinutes, right: true, render: d => d.medianAckMinutes === null ? '—' : `${d.medianAckMinutes}m` },
                { key: 'sent', label: 'Sent', value: d => d.sent, right: true },
                { key: 'resolved', label: 'Resolved', value: d => d.resolved, right: true },
              ]} />
            </div>
          </Panel>
        </div>

        <div className="cc-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          <Panel title="By severity"><HBars rows={data.bySeverity.filter(s => s.count > 0).map(s => ({ label: `P${s.key} ${SEVERITY_WORDS[Number(s.key)] ?? s.label}`, value: s.count, colour: T.severity[Math.min(Math.max(Number(s.key), 1), 5) - 1], note: `to acknowledge ${minutesWord(s.toAcknowledge.medianMinutes)}` }))} /></Panel>
          <Panel title="Outcomes"><HBars rows={data.outcomes.map(o => ({ label: OUTCOME[o.outcome] ?? o.label, value: o.count, colour: OUTCOME_COLOURS[o.outcome] ?? T.muted }))} /></Panel>
          <Panel title="How they reached us"><HBars rows={data.sources.map((s, i) => ({ label: <>{s.label}{filters.compare ? <span className="cc-num" style={{ color: T.subtle, marginLeft: 6 }}>was {s.before}</span> : null}</>, value: s.count, colour: T.series[i % T.series.length] }))} /></Panel>
          <Panel title="Rules that fired" note={`${h.escalations} in all`}>{data.rulesFired.length === 0 ? <Empty>No escalation rule fired.</Empty> : <HBars rows={data.rulesFired.map(r => ({ label: <>{r.name}{r.institutionName && access.national ? <span style={{ color: T.subtle }}> · {r.institutionName}</span> : null}</>, value: r.fired }))} colour={T.warn} />}</Panel>
        </div>
        <div style={{ fontSize: 11, color: T.subtle }}>Computed {new Date(data.asOf).toISOString().slice(11, 16)} UTC from every non-training incident in the window{data.window.national ? '' : ' routed to or sent to this institution'}. Medians are nearest-rank; a figure is shown only where it happened. District placement follows the pin or, without one, the reporter's district.</div>
      </>)}
    </div>
  );
}

export function Change({ now, before, on, invert, points }: { now: number | null; before: number | null; on: boolean; invert?: boolean; points?: boolean }) {
  if (!on) return <span style={{ color: T.subtle }}>—</span>;
  if (now === null || before === null) return <span style={{ color: T.subtle }}>no previous figure</span>;
  if (points) { const d = now - before; return <span className="cc-num" style={{ color: d === 0 ? T.subtle : (d > 0) !== !!invert ? T.good : T.warn }}>{d > 0 ? '+' : ''}{d} pts vs before</span>; }
  const d = delta(now, before);
  if (d === null) return <span style={{ color: T.subtle }}>{before === 0 ? 'none before' : '—'}</span>;
  const good = invert ? d <= 0 : d >= 0;
  return <span className="cc-num" style={{ color: d === 0 ? T.subtle : good ? T.muted : T.warn }}>{d > 0 ? '+' : ''}{d}% vs before ({before})</span>;
}

function HeatmapWithMetric({ cells }: { cells: AnalyticsReport['heatmap'] }) {
  const [metric, setMetric] = useState<'reported' | 'critical' | 'ack'>('reported');
  return (
    <div>
      <div style={{ marginBottom: 8 }}><Segmented size="xs" value={metric} onChange={setMetric} options={[['reported', 'Reported'], ['critical', 'Critical'], ['ack', 'Time to acknowledge']]} /></div>
      <Heatmap cells={cells} metric={metric} />
      <WeekdayBars cells={cells} />
    </div>
  );
}

function WeekdayBars({ cells }: { cells: AnalyticsReport['heatmap'] }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const totals = days.map((d, wd) => ({ label: d, value: cells.filter(c => c.weekday === wd).reduce((a, c) => a + c.reported, 0) }));
  const max = Math.max(1, ...totals.map(t => t.value));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginTop: 10 }}>
      {totals.map(t => <div key={t.label} style={{ textAlign: 'center' }}><div style={{ height: 36, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}><div style={{ width: '70%', height: `${Math.max(4, (t.value / max) * 100)}%`, background: t.value === max ? T.warn : T.series[0], borderRadius: '2px 2px 0 0', opacity: 0.9 }} /></div><div style={{ fontSize: 10, color: T.subtle, fontFamily: T.mono }}>{t.label}</div><div className="cc-num" style={{ fontSize: 11, color: T.muted }}>{t.value}</div></div>)}
    </div>
  );
}

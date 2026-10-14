/**
 * Emergency analytics, in the console.
 *
 * The same report the command centre draws, for Vacancy's own administrators: the country,
 * or one institution, over any window, compared with the window before — the paragraph of
 * findings, the numbers, the trend, the ladder, the week, the districts, who answered, and
 * what became of it all. Reached from the Emergency menu or from an institution's workspace.
 * "Print" uses the browser's print for a PDF; the CSV is every incident in the window.
 */
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Card, Cell, ErrorNote, Input, Loading, PageHeader, Row, Table, Toasts, useToasts } from '../components/ui';
import type { AdminIdentity } from '../api/admin';
import { CATEGORY, OUTCOME, RESPONDER_ROLE, SEVERITY_WORDS, analyticsApi, emergencyApi, type AnalyticsReport, type AnalyticsRequest, type DirectoryOverview, type InstitutionRow } from '../api/emergency';

const err = (caught: unknown, fallback: string) => (caught instanceof Error ? caught.message : fallback);

export function EmergencyAnalytics({ identity }: { identity: AdminIdentity }) {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [params, setParams] = useSearchParams();
  const [overview, setOverview] = useState<DirectoryOverview | null>(null);
  const [institutions, setInstitutions] = useState<InstitutionRow[]>([]);
  const [data, setData] = useState<AnalyticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  void identity;

  const f = {
    days: Number(params.get('days') ?? 30) || 30, from: params.get('from') ?? '', to: params.get('to') ?? '', granularity: params.get('g') ?? '',
    institution: params.get('institution') ?? '', sector: params.get('sector') ?? '', category: params.get('cat') ?? '', severity: params.get('sev') ?? '', district: params.get('d') ?? '', compare: params.get('cmp') !== '0',
  };
  const set = (patch: Partial<typeof f>) => {
    const n = { ...f, ...patch };
    const p = new URLSearchParams();
    if (n.from && n.to) { p.set('from', n.from); p.set('to', n.to); } else if (n.days !== 30) p.set('days', String(n.days));
    for (const [k, v] of [['g', n.granularity], ['institution', n.institution], ['sector', n.sector], ['cat', n.category], ['sev', n.severity], ['d', n.district]] as const) if (v) p.set(k, v);
    if (!n.compare) p.set('cmp', '0');
    setParams(p, { replace: true });
  };
  const request: AnalyticsRequest = useMemo(() => ({ days: f.days, from: f.from && f.to ? f.from : null, to: f.from && f.to ? f.to : null, granularity: (f.granularity || null) as AnalyticsRequest['granularity'], institutionId: f.institution || null, sectorCode: f.sector || null, category: f.category ? Number(f.category) : null, severity: f.severity ? Number(f.severity) : null, districtSlug: f.district || null, compare: f.compare }), [f.days, f.from, f.to, f.granularity, f.institution, f.sector, f.category, f.severity, f.district, f.compare]);

  useEffect(() => {
    emergencyApi.overview().then(setOverview).catch(() => setOverview(null));
    emergencyApi.searchInstitutions({ pageSize: 200 }).then(p => setInstitutions(p.items ?? [])).catch(() => setInstitutions([]));
  }, []);
  const load = useCallback(() => { setData(null); analyticsApi.report(request).then(d => { setData(d); setError(null); }).catch(caught => setError(err(caught, 'Could not load the report.'))); }, [request]);
  useEffect(load, [load]);

  const exportCsv = () => {
    setExporting(true);
    analyticsApi.export(request).then(x => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([x.csv], { type: 'text/csv;charset=utf-8' })); a.download = x.fileName; a.click(); URL.revokeObjectURL(a.href); push(`${x.rows} incidents exported.`); }).catch(caught => push(err(caught, 'Could not export.'), 'error')).finally(() => setExporting(false));
  };

  const selectStyle = { padding: '8px 10px', borderRadius: 10, border: `1px solid ${t.borderStrong}`, background: t.surfaceMuted, color: t.text, fontFamily: 'inherit', fontSize: 13 } as const;
  const h = data?.headline;
  const sevTone = (s: number) => (s === 1 ? t.danger : s === 2 ? t.warning : s === 3 ? t.brand : s === 4 ? t.textMuted : t.textSubtle);
  const toneColour = (tone: string) => (tone === 'bad' ? t.danger : tone === 'warn' ? t.warning : tone === 'good' ? t.success : t.brand);
  const m = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n} min`);
  const institutionName = institutions.find(i => i.id === f.institution)?.name;

  return (
    <>
      <style>{`@media print { nav, aside, header, .ea-chrome { display: none !important; } main { padding: 0 !important; } .ea-print { break-inside: avoid; } }`}</style>
      <PageHeader title="Emergency analytics" subtitle={data ? `${data.window.from.slice(0, 10)} → ${data.window.to.slice(0, 10)} · ${data.window.days} days by ${data.window.granularity} · ${institutionName ?? data.window.scope}${data.window.filters ? ` · ${data.window.filters}` : ''}` : 'One window, every breakdown, and the sentences the numbers support.'}
        action={<div className="ea-chrome" style={{ display: 'flex', gap: 6 }}><Button tone="subtle" disabled={!data || exporting} onClick={exportCsv}>{exporting ? 'Preparing…' : 'Incidents CSV'}</Button><Button tone="primary" disabled={!data} onClick={() => window.print()}>Print / PDF</Button></div>} />

      <div className="ea-chrome"><Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4 }}>{[7, 30, 90, 365].map(d => <button key={d} type="button" onClick={() => set({ days: d, from: '', to: '' })} style={{ padding: '7px 11px', borderRadius: 9, border: `1px solid ${!f.from && f.days === d ? t.brand : t.border}`, background: !f.from && f.days === d ? t.brandSoft : 'transparent', color: !f.from && f.days === d ? t.brand : t.textMuted, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>{d === 365 ? 'Year' : `${d} days`}</button>)}</div>
          <Input value={f.from} onChange={v => set({ from: v })} type="date" style={{ width: 140 }} /><span style={{ color: t.textSubtle }}>→</span><Input value={f.to} onChange={v => set({ to: v })} type="date" style={{ width: 140 }} />
          <select value={f.granularity} onChange={e => set({ granularity: e.target.value })} style={selectStyle}><option value="">Auto</option><option value="day">By day</option><option value="week">By week</option><option value="month">By month</option></select>
          <select value={f.institution} onChange={e => set({ institution: e.target.value })} style={{ ...selectStyle, maxWidth: 240 }}><option value="">Every institution</option>{institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
          <select value={f.sector} onChange={e => set({ sector: e.target.value })} style={selectStyle}><option value="">Every sector</option>{(overview?.sectors ?? []).map(s => <option key={s.code} value={s.code}>{s.name}</option>)}</select>
          <select value={f.category} onChange={e => set({ category: e.target.value })} style={selectStyle}><option value="">Every category</option>{Object.entries(CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select value={f.severity} onChange={e => set({ severity: e.target.value })} style={selectStyle}><option value="">Every severity</option>{Object.entries(SEVERITY_WORDS).map(([v, l]) => <option key={v} value={v}>P{v} {l}</option>)}</select>
          <select value={f.district} onChange={e => set({ district: e.target.value })} style={selectStyle}><option value="">Every district</option>{(overview?.districts ?? []).map(d => <option key={d.slug} value={d.slug}>{d.name}</option>)}</select>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: t.textMuted }}><input type="checkbox" checked={f.compare} onChange={e => set({ compare: e.target.checked })} /> compare with the period before</label>
        </div>
      </Card></div>

      {error ? <ErrorNote message={error} /> : null}
      {!data || !h ? <Loading label="Working the numbers…" /> : (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
            {data.findings.map((x, i) => (
              <div key={i} className="ea-print" style={{ border: `1px solid ${t.border}`, borderLeft: `4px solid ${toneColour(x.tone)}`, borderRadius: 12, padding: '10px 14px', background: t.surface, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {x.figure ? <span style={{ fontSize: 20, fontWeight: 800, color: toneColour(x.tone), whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{x.figure}</span> : null}
                <span style={{ fontSize: 13, lineHeight: 1.5, color: t.text }}>{x.text}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            <Kpi label="Reported" value={h.reported} note={<Delta now={h.reported} before={h.reportedBefore} on={f.compare} />} />
            <Kpi label="Resolved" value={h.reported ? `${Math.round((h.resolved / h.reported) * 100)}%` : '—'} note={`${h.resolved} of ${h.reported} · ${h.stillOpen} still open`} />
            <Kpi label="Critical" value={h.critical} tone={h.critical ? t.danger : undefined} note={<Delta now={h.critical} before={h.criticalBefore} on={f.compare} invert />} />
            <Kpi label="Acknowledged ≤ 10 min" value={h.acknowledgedWithinTenPct === null ? '—' : `${h.acknowledgedWithinTenPct}%`} tone={h.acknowledgedWithinTenPct !== null && h.acknowledgedWithinTenPct >= 80 ? t.success : h.acknowledgedWithinTenPct !== null && h.acknowledgedWithinTenPct < 50 ? t.warning : undefined} note={h.acknowledgedWithinTenPctBefore !== null && f.compare ? `${h.acknowledgedWithinTenPctBefore}% before` : ''} />
            <Kpi label="On scene ≤ 30 min" value={h.onSceneWithinThirtyPct === null ? '—' : `${h.onSceneWithinThirtyPct}%`} note={`${h.ladder.toScene.count} measured`} />
            <Kpi label="Median to acknowledge" value={h.ladder.toAcknowledge.medianMinutes ?? '—'} note={`min · 90th ${m(h.ladder.toAcknowledge.p90Minutes)}`} />
            <Kpi label="Median to scene" value={h.ladder.toScene.medianMinutes ?? '—'} note={`min · before ${m(h.ladderBefore.toScene.medianMinutes)}`} />
            <Kpi label="Found no station" value={h.unrouted} tone={h.unrouted ? t.warning : undefined} note={<Delta now={h.unrouted} before={h.unroutedBefore} on={f.compare} invert />} />
            <Kpi label="Sent" value={h.assignmentsMade} note={`${h.assignmentsDeclined} declined · ${h.assignmentsStoodDown} stood down`} />
            <Kpi label="Escalations" value={h.escalations} tone={h.escalations ? t.warning : undefined} note={<Delta now={h.escalations} before={h.escalationsBefore} on={f.compare} invert />} />
            <Kpi label="People affected" value={h.peopleAffected} note={`${h.childrenInvolved} with children · ${h.anonymous} anonymous`} />
            <Kpi label="Report quality" value={h.duplicates + h.mistakenOrMalicious} note={`${h.duplicates} duplicates · ${h.mistakenOrMalicious} mistaken/malicious`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(300px, 1fr)', gap: 14 }}>
            <Card><Head>Volume by {data.window.granularity}</Head><TrendChart labels={data.series.map(p => data.window.granularity === 'month' ? p.bucket : p.bucket.slice(5))} series={[['Reported', t.series[0], data.series.map(p => p.reported)], ['Resolved', t.series[2], data.series.map(p => p.resolved)], ['Critical', t.danger, data.series.map(p => p.critical)], ['Sent', t.series[3], data.series.map(p => p.assignments)]]} ghost={f.compare && data.seriesBefore.length === data.series.length ? data.seriesBefore.map(p => p.reported) : undefined} /></Card>
            <Card><Head>Response ladder</Head>
              <Table head={['Step', 'Median', '90th', 'n', 'Before']}>
                {([['Acknowledged', h.ladder.toAcknowledge, h.ladderBefore.toAcknowledge], ['Somebody sent', h.ladder.toAssign, h.ladderBefore.toAssign], ['On the way', h.ladder.toEnRoute, h.ladderBefore.toEnRoute], ['On scene', h.ladder.toScene, h.ladderBefore.toScene], ['Resolved', h.ladder.toResolve, h.ladderBefore.toResolve]] as const).map(([label, now, before]) => (
                  <Row key={label}><Cell>{label}</Cell><Cell mono><strong style={{ color: now.medianMinutes !== null && before.medianMinutes !== null ? (now.medianMinutes <= before.medianMinutes ? t.success : t.danger) : t.text }}>{m(now.medianMinutes)}</strong></Cell><Cell mono>{m(now.p90Minutes)}</Cell><Cell mono>{now.count}</Cell><Cell mono style={{ color: t.textSubtle }}>{m(before.medianMinutes)}</Cell></Row>
                ))}
              </Table>
              <div style={{ marginTop: 12 }}><Head>Speed by {data.window.granularity}</Head><TrendChart labels={data.series.map(p => data.window.granularity === 'month' ? p.bucket : p.bucket.slice(5))} series={[['To acknowledge', t.series[0], data.series.map(p => p.medianAckMinutes ?? 0)], ['To scene', t.series[1], data.series.map(p => p.medianSceneMinutes ?? 0)]]} height={120} unit="min" /></div>
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14 }}>
            <Card><Head>When — weekday × hour</Head><HeatGrid cells={data.heatmap} /></Card>
            <Card><Head>What — by category and outcome</Head>
              <Table head={['Category', 'Reported', f.compare ? 'Before' : '', 'P1', 'Unrouted', 'To ack', 'To scene', 'Outcomes'].filter(Boolean)}>
                {data.categories.map(c => <Row key={c.category}><Cell><strong>{CATEGORY[c.category] ?? c.label}</strong></Cell><Cell mono>{c.reported}</Cell>{f.compare ? <Cell mono style={{ color: t.textSubtle }}>{c.reportedBefore}</Cell> : null}<Cell mono style={{ color: c.critical ? t.danger : t.textSubtle }}>{c.critical}</Cell><Cell mono style={{ color: c.unrouted ? t.warning : t.textSubtle }}>{c.unrouted}</Cell><Cell mono>{m(c.medianAckMinutes)}</Cell><Cell mono>{m(c.medianSceneMinutes)}</Cell><Cell><span style={{ display: 'inline-flex', height: 8, width: 110, borderRadius: 4, overflow: 'hidden', gap: 1 }}>{c.outcomes.map(o => <span key={o.outcome} title={`${OUTCOME[o.outcome]}: ${o.count}`} style={{ width: `${(o.count / Math.max(1, c.reported)) * 100}%`, background: o.outcome === 1 ? t.success : o.outcome === 5 ? t.danger : o.outcome === 2 ? t.warning : t.textSubtle }} />)}</span></Cell></Row>)}
              </Table>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 }}>
                <div><Head>By severity</Head>{data.bySeverity.filter(s => s.count > 0).map(s => <Bar key={s.key} label={`P${s.key} ${SEVERITY_WORDS[Number(s.key)] ?? ''}`} value={s.count} max={Math.max(1, ...data.bySeverity.map(x => x.count))} colour={sevTone(Number(s.key))} note={m(s.toAcknowledge.medianMinutes)} />)}</div>
                <div><Head>Sources</Head>{data.sources.map((s, i) => <Bar key={s.source} label={s.label} value={s.count} max={Math.max(1, ...data.sources.map(x => x.count))} colour={t.series[i % t.series.length]} note={f.compare ? `was ${s.before}` : ''} />)}</div>
              </div>
            </Card>
          </div>

          <Card pad={0}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}` }}><Head>Where — by district</Head></div>
            <Table head={['District', 'Reported', f.compare ? 'Before' : '', 'P1', 'Unrouted', 'Resolved', 'To acknowledge', 'To scene', 'Severity mix', 'Most reported'].filter(Boolean)}>
              {data.districts.map(x => <Row key={x.slug}><Cell><strong>{x.name}</strong></Cell><Cell mono>{x.reported}</Cell>{f.compare ? <Cell mono style={{ color: t.textSubtle }}>{x.reportedBefore}</Cell> : null}<Cell mono style={{ color: x.critical ? t.danger : t.textSubtle }}>{x.critical}</Cell><Cell mono style={{ color: x.unrouted ? t.warning : t.textSubtle }}>{x.unrouted}</Cell><Cell mono>{x.resolved}</Cell><Cell mono>{m(x.medianAckMinutes)}</Cell><Cell mono>{m(x.medianSceneMinutes)}</Cell><Cell><span style={{ display: 'inline-flex', height: 8, width: 90, borderRadius: 4, overflow: 'hidden', gap: 1 }}>{x.bySeverity.map((n, i) => n > 0 ? <span key={i} title={`P${i + 1}: ${n}`} style={{ width: `${(n / x.reported) * 100}%`, background: sevTone(i + 1) }} /> : null)}</span></Cell><Cell style={{ color: t.textMuted }}>{x.topSituation ?? ''}</Cell></Row>)}
            </Table>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
            <Card pad={0}><div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}` }}><Head>Stations · {data.stations.length}</Head></div>
              <Table head={['Station', 'Rep.', '≤10', 'Ack', 'Scene', 'Sent', 'Esc.']}>{data.stations.slice(0, 15).map(s => <Row key={s.facilityId}><Cell><strong>{s.name}</strong><div style={{ fontSize: 11, color: t.textSubtle }}>{s.institutionName}</div></Cell><Cell mono>{s.reported}</Cell><Cell mono style={{ color: s.acknowledgedWithinTenPct !== null && s.acknowledgedWithinTenPct < 50 ? t.warning : t.text }}>{s.acknowledgedWithinTenPct === null ? '—' : `${s.acknowledgedWithinTenPct}%`}</Cell><Cell mono>{s.medianAckMinutes ?? '—'}</Cell><Cell mono>{s.medianSceneMinutes ?? '—'}</Cell><Cell mono>{s.assignments}</Cell><Cell mono style={{ color: s.escalations ? t.warning : t.textSubtle }}>{s.escalations}</Cell></Row>)}</Table></Card>
            <Card pad={0}><div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}` }}><Head>Responders · {data.responders.length}</Head></div>
              <Table head={['Responder', 'Sent', 'Done', 'Decl.', 'Accept', 'Scene']}>{data.responders.slice(0, 15).map(r => <Row key={r.responderId}><Cell><strong>{r.name}</strong><div style={{ fontSize: 11, color: t.textSubtle }}>{RESPONDER_ROLE[r.role]} · {r.facilityName ?? r.institutionName}</div></Cell><Cell mono>{r.assigned}</Cell><Cell mono>{r.completed}</Cell><Cell mono style={{ color: r.declined ? t.warning : t.textSubtle }}>{r.declined}</Cell><Cell mono>{r.medianAcceptMinutes ?? '—'}</Cell><Cell mono>{r.medianOnSceneMinutes ?? '—'}</Cell></Row>)}{data.responders.length === 0 ? <Row><Cell>Nobody was sent through the platform in the window.</Cell></Row> : null}</Table></Card>
            <Card pad={0}><div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}` }}><Head>Dispatchers · {data.dispatchers.length}</Head></div>
              <Table head={['Dispatcher', 'Ack’d', '≤10', 'Median', 'Sent', 'Resolved']}>{data.dispatchers.slice(0, 15).map(x => <Row key={x.userId}><Cell><strong>{x.name}</strong>{x.institutionName ? <div style={{ fontSize: 11, color: t.textSubtle }}>{x.institutionName}</div> : null}</Cell><Cell mono>{x.acknowledged}</Cell><Cell mono>{x.acknowledgedWithinTenPct === null ? '—' : `${x.acknowledgedWithinTenPct}%`}</Cell><Cell mono>{x.medianAckMinutes ?? '—'}</Cell><Cell mono>{x.sent}</Cell><Cell mono>{x.resolved}</Cell></Row>)}{data.dispatchers.length === 0 ? <Row><Cell>No acknowledgement was recorded in the window.</Cell></Row> : null}</Table></Card>
            <Card><Head>Most reported situations</Head>{data.situations.slice(0, 10).map(s => <Bar key={s.code} label={s.words} value={s.count} max={Math.max(1, ...data.situations.map(x => x.count))} colour={t.series[(s.category - 1) % t.series.length]} note={`${s.critical} P1 · ack ${m(s.medianAckMinutes)}`} />)}{data.rulesFired.length > 0 ? <><div style={{ height: 12 }} /><Head>Rules that fired</Head>{data.rulesFired.map(r => <Bar key={r.ruleId} label={`${r.name}${r.institutionName ? ` · ${r.institutionName}` : ''}`} value={r.fired} max={Math.max(1, ...data.rulesFired.map(x => x.fired))} colour={t.warning} />)}</> : null}</Card>
          </div>
          <div style={{ fontSize: 11.5, color: t.textSubtle }}>Computed {new Date(data.asOf).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC from every non-training incident in the window. Medians are nearest-rank; a figure is shown only where it happened. Private incidents are counted but never placed.</div>
        </div>
      )}
      <Toasts toasts={toasts} />
    </>
  );
}

function Head({ children }: { children: ReactNode }) {
  const { t } = useTheme();
  return <div style={{ fontSize: 11, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{children}</div>;
}
function Kpi({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: string }) {
  const { t } = useTheme();
  return <div className="ea-print" style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: '10px 14px', background: t.surface, minWidth: 0 }}><div style={{ fontSize: 11, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div><div style={{ fontSize: 22, fontWeight: 800, color: tone ?? t.text, fontVariantNumeric: 'tabular-nums', marginTop: 2, lineHeight: 1.1 }}>{value}</div>{note ? <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 3 }}>{note}</div> : null}</div>;
}
function Delta({ now, before, on, invert }: { now: number; before: number; on: boolean; invert?: boolean }) {
  const { t } = useTheme();
  if (!on) return <span style={{ color: t.textSubtle }}>—</span>;
  if (before === 0) return <span style={{ color: t.textSubtle }}>none before</span>;
  const d = Math.round(((now - before) / before) * 100);
  const good = invert ? d <= 0 : d >= 0;
  return <span style={{ color: d === 0 ? t.textSubtle : good ? t.textMuted : t.warning, fontVariantNumeric: 'tabular-nums' }}>{d > 0 ? '+' : ''}{d}% vs before ({before})</span>;
}
function Bar({ label, value, max, colour, note }: { label: string; value: number; max: number; colour: string; note?: string }) {
  const { t } = useTheme();
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 34%) 1fr 130px', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 5 }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{label}</span><span style={{ height: 8, background: t.surfaceMuted, borderRadius: 4, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(value / max) * 100}%`, background: colour, borderRadius: 4 }} /></span><span style={{ textAlign: 'right', color: t.textMuted, fontVariantNumeric: 'tabular-nums' }}><strong style={{ color: t.text }}>{value}</strong>{note ? ` · ${note}` : ''}</span></div>;
}
function HeatGrid({ cells }: { cells: AnalyticsReport['heatmap'] }) {
  const { t } = useTheme();
  const [hover, setHover] = useState<{ wd: number; h: number } | null>(null);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const max = Math.max(1, ...cells.map(c => c.reported));
  const at = (wd: number, h: number) => cells.find(c => c.weekday === wd && c.hour === h);
  const hovered = hover ? at(hover.wd, hover.h) : null;
  const totals = days.map((_, wd) => cells.filter(c => c.weekday === wd).reduce((a, c) => a + c.reported, 0));
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '34px repeat(24, 1fr) 40px', gap: 2 }}>
        <span />{Array.from({ length: 24 }, (_, h) => <span key={h} style={{ fontSize: 8.5, color: t.textSubtle, textAlign: 'center' }}>{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>)}<span />
        {days.map((d, wd) => <Fragment key={d}><span style={{ fontSize: 10, color: t.textSubtle, lineHeight: '16px' }}>{d}</span>{Array.from({ length: 24 }, (_, h) => { const c = at(wd, h); const v = c?.reported ?? 0; return <div key={h} onMouseEnter={() => setHover({ wd, h })} onMouseLeave={() => setHover(null)} style={{ height: 16, borderRadius: 3, background: v === 0 ? t.surfaceMuted : `rgba(42,120,214,${0.15 + 0.85 * (v / max)})`, outline: hover?.wd === wd && hover?.h === h ? `1px solid ${t.text}` : 'none' }} />; })}<span style={{ fontSize: 10.5, color: t.textMuted, fontVariantNumeric: 'tabular-nums', textAlign: 'right', lineHeight: '16px' }}>{totals[wd]}</span></Fragment>)}
      </div>
      <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 6, minHeight: 16 }}>{hovered && hover ? <><strong>{days[hover.wd]} {String(hover.h).padStart(2, '0')}:00</strong> · {hovered.reported} reported · {hovered.critical} critical{hovered.medianAckMinutes !== null ? ` · acknowledged in ${hovered.medianAckMinutes} min` : ''}</> : "Darker is busier. Hover a cell; the column on the right is the day's total."}</div>
    </div>
  );
}
function TrendChart({ labels, series, ghost, height = 190, unit }: { labels: string[]; series: [string, string, number[]][]; ghost?: number[]; height?: number; unit?: string }) {
  const { t } = useTheme();
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, L = 34, R = 10, Tp = 12, B = 22;
  const n = labels.length;
  const raw = Math.max(1, ...series.flatMap(s => s[2]), ...(ghost ?? []));
  const p10 = 10 ** Math.floor(Math.log10(raw)); const fr = raw / p10; const max = (fr <= 1 ? 1 : fr <= 2 ? 2 : fr <= 5 ? 5 : 10) * p10;
  const x = (i: number) => L + (n <= 1 ? (W - L - R) / 2 : (i / (n - 1)) * (W - L - R));
  const y = (v: number) => Tp + (height - Tp - B) * (1 - v / max);
  const path = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const every = Math.max(1, Math.ceil(n / 10));
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }} onMouseLeave={() => setHover(null)} onMouseMove={e => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.min(n - 1, Math.max(0, Math.round(((px - L) / (W - L - R)) * (n - 1))))); }}>
        {[0, max / 2, max].map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={t.border} /><text x={L - 5} y={y(v) + 3} fontSize="9.5" fill={t.textSubtle} textAnchor="end">{v}</text></g>)}
        {labels.map((l, i) => (i === n - 1 || (i % every === 0 && n - 1 - i >= every / 2)) ? <text key={i} x={x(i)} y={height - 6} fontSize="9.5" fill={t.textSubtle} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{l}</text> : null)}
        {ghost ? <path d={path(ghost)} fill="none" stroke={t.textSubtle} strokeWidth="1.5" strokeDasharray="3 3" /> : null}
        {series.map(([label, colour, vals]) => <path key={label} d={path(vals)} fill="none" stroke={colour} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
        {hover !== null ? <g><line x1={x(hover)} x2={x(hover)} y1={Tp} y2={height - B} stroke={t.borderStrong} strokeDasharray="2 2" />{series.map(([label, colour, vals]) => <circle key={label} cx={x(hover)} cy={y(vals[hover] ?? 0)} r="3.5" fill={colour} stroke={t.surface} strokeWidth="1.5" />)}</g> : null}
        {unit ? <text x={L} y={Tp - 2} fontSize="9" fill={t.textSubtle}>{unit}</text> : null}
      </svg>
      {hover !== null ? <div style={{ position: 'absolute', top: 4, left: `${(x(hover) / W) * 100}%`, transform: hover > n / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)', background: t.surface, border: `1px solid ${t.borderStrong}`, borderRadius: 8, padding: '6px 9px', fontSize: 11.5, pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: t.shadow }}><div style={{ color: t.textMuted, marginBottom: 2 }}>{labels[hover]}</div>{series.map(([label, colour, vals]) => <div key={label} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: colour }} />{label} <strong>{vals[hover] ?? 0}</strong></div>)}{ghost ? <div style={{ color: t.textSubtle }}>before: {ghost[hover] ?? 0}</div> : null}</div> : null}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4, fontSize: 11.5, color: t.textMuted }}>{series.map(([label, colour]) => <span key={label} style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><span style={{ width: 9, height: 9, borderRadius: 2, background: colour }} />{label}</span>)}{ghost ? <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><span style={{ width: 12, borderTop: `1.5px dashed ${t.textSubtle}` }} />reported, period before</span> : null}</div>
    </div>
  );
}

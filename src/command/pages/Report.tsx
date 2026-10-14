/**
 * The situation report, on paper.
 *
 * The same figures as the analytics screen, laid out white for a PDF or a printer: a cover
 * block, the paragraph of findings, the headline table, the trend, the ladder, the week,
 * the districts and the people — the document a director takes into a Monday meeting. The
 * browser's own print does the PDF; nothing leaves the sealed channel.
 */
import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CATEGORY, OUTCOME, RESPONDER_ROLE, SEVERITY_WORDS } from '../api';
import { useCommand } from '../useCommand';
import { filtersFromParams, useReport } from './Analytics';

const INK = '#111827', MUTED = '#6B7280', LINE = '#E5E7EB', ACCENT = '#0F766E', WARN = '#B45309', BAD = '#B91C1C', GOOD = '#15803D';
const SEV = ['#B91C1C', '#D97706', '#2563EB', '#6B7280', '#9CA3AF'];

export function Report() {
  const { institutionName, access } = useCommand();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const { data, error } = useReport(filters);
  useEffect(() => { document.title = data ? `Emergency report · ${institutionName ?? data.window.scope} · ${data.window.from.slice(0, 10)}` : 'Emergency report'; return () => { document.title = 'Vacancy Command'; }; }, [data, institutionName]);

  if (error) return <div style={{ padding: 24, color: '#fff' }}>{error}</div>;
  if (!data) return <div style={{ padding: 24, color: '#9CA3AF' }}>Working the numbers…</div>;
  const h = data.headline;
  const d = (n: number | null | undefined) => (n === null || n === undefined ? '—' : String(n));
  const change = (now: number, before: number) => (before === 0 ? '—' : `${now - before >= 0 ? '+' : ''}${Math.round(((now - before) / before) * 100)}%`);
  const m = (n: number | null) => (n === null ? '—' : `${n} min`);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const heatMax = Math.max(1, ...data.heatmap.map(c => c.reported));
  const labels = data.series.map(p => data.window.granularity === 'month' ? p.bucket : p.bucket.slice(5));

  return (
    <div style={{ background: '#E5E7EB', minHeight: '100vh', padding: '18px 0 60px' }}>
      <style>{`
        @page { size: A4; margin: 14mm 12mm; }
        @media print { body { background: #fff !important; } .rep-chrome { display: none !important; } .rep-page { box-shadow: none !important; margin: 0 !important; width: auto !important; padding: 0 !important; } .rep-break { break-before: page; } .cc-rail, header { display: none !important; } main { padding: 0 !important; } }
        .rep-page { background: #fff; color: ${INK}; width: 794px; max-width: 100%; margin: 0 auto; padding: 40px 44px; box-shadow: 0 10px 40px rgba(0,0,0,.35); font-family: 'IBM Plex Sans', -apple-system, Segoe UI, Roboto, sans-serif; font-size: 11.5px; line-height: 1.45; }
        .rep-page h1 { font-size: 24px; margin: 0; letter-spacing: -.01em; }
        .rep-page h2 { font-size: 13px; margin: 22px 0 8px; letter-spacing: .08em; text-transform: uppercase; color: ${ACCENT}; border-bottom: 1px solid ${LINE}; padding-bottom: 4px; }
        .rep-page table { width: 100%; border-collapse: collapse; }
        .rep-page th { text-align: left; font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; color: ${MUTED}; padding: 4px 6px; border-bottom: 1px solid ${INK}; }
        .rep-page td { padding: 4px 6px; border-bottom: 1px solid ${LINE}; vertical-align: top; }
        .rep-page td.n, .rep-page th.n { text-align: right; font-variant-numeric: tabular-nums; font-family: 'IBM Plex Mono', Menlo, monospace; }
        .rep-kpi { border: 1px solid ${LINE}; border-radius: 6px; padding: 8px 10px; }
        .rep-kpi .l { font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: ${MUTED}; }
        .rep-kpi .v { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.1; margin-top: 2px; }
        .rep-kpi .s { font-size: 10px; color: ${MUTED}; margin-top: 2px; }
      `}</style>
      <div className="rep-chrome" style={{ width: 794, maxWidth: '100%', margin: '0 auto 10px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" onClick={() => navigate(-1)} style={{ border: 'none', background: 'transparent', color: INK, cursor: 'pointer', fontWeight: 600 }}>‹ Back to analytics</button>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => window.print()} style={{ border: 'none', background: ACCENT, color: '#fff', fontWeight: 600, padding: '8px 14px', borderRadius: 6, cursor: 'pointer' }}>Print / save as PDF</button>
      </div>

      <article className="rep-page">
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', borderBottom: `3px solid ${INK}`, paddingBottom: 14 }}>
          <svg width={40} height={40} viewBox="0 0 100 100" aria-hidden="true"><path d="M17 47 L39 71" stroke={INK} strokeWidth="15" strokeLinecap="round" fill="none" /><path d="M39 71 L85 17" stroke="#FF6B2C" strokeWidth="15" strokeLinecap="round" fill="none" /></svg>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: MUTED }}>Emergency response · situation report</div>
            <h1>{institutionName ?? data.window.scope}</h1>
            <div style={{ color: MUTED, marginTop: 4 }}>{data.window.from.slice(0, 10)} to {data.window.to.slice(0, 10)} · {data.window.days} days{data.window.filters ? ` · ${data.window.filters}` : ''}{data.window.compareFrom ? ` · compared with ${data.window.compareFrom.slice(0, 10)} – ${data.window.compareTo!.slice(0, 10)}` : ''}</div>
          </div>
          <div style={{ textAlign: 'right', color: MUTED, fontSize: 10 }}>Prepared {new Date(data.asOf).toISOString().slice(0, 16).replace('T', ' ')} UTC<br />by {access.name || 'the command centre'}<br />Vacancy · XPERT PAY LIMITED</div>
        </div>

        <h2>In brief</h2>
        <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 5 }}>
          {data.findings.map((f, i) => <li key={i} style={{ color: f.tone === 'bad' ? BAD : f.tone === 'warn' ? WARN : f.tone === 'good' ? GOOD : INK }}><span style={{ color: INK }}>{f.text}</span></li>)}
        </ol>

        <h2>The numbers</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            ['Reported', h.reported, filters.compare ? `${change(h.reported, h.reportedBefore)} vs ${h.reportedBefore} before` : ''],
            ['Resolved', `${h.reported ? Math.round((h.resolved / h.reported) * 100) : 0}%`, `${h.resolved} of ${h.reported} · ${h.stillOpen} still open`],
            ['Critical (P1)', h.critical, filters.compare ? `${change(h.critical, h.criticalBefore)} vs before` : ''],
            ['Found no station', h.unrouted, `${h.reported ? Math.round((h.unrouted / h.reported) * 100) : 0}% of reports`],
            ['Acknowledged in ≤ 10 min', h.acknowledgedWithinTenPct === null ? '—' : `${h.acknowledgedWithinTenPct}%`, h.acknowledgedWithinTenPctBefore !== null && filters.compare ? `${h.acknowledgedWithinTenPctBefore}% before` : ''],
            ['On scene in ≤ 30 min', h.onSceneWithinThirtyPct === null ? '—' : `${h.onSceneWithinThirtyPct}%`, `${h.ladder.toScene.count} measured`],
            ['Median to acknowledge', m(h.ladder.toAcknowledge.medianMinutes), `90th percentile ${m(h.ladder.toAcknowledge.p90Minutes)}`],
            ['Median to scene', m(h.ladder.toScene.medianMinutes), `90th percentile ${m(h.ladder.toScene.p90Minutes)}`],
            ['Responders sent', h.assignmentsMade, `${h.assignmentsDeclined} declined · ${h.assignmentsStoodDown} stood down`],
            ['Escalations fired', h.escalations, filters.compare ? `${h.escalationsBefore} before` : ''],
            ['People affected', h.peopleAffected, `${h.childrenInvolved} reports with children`],
            ['Report quality', `${h.duplicates + h.mistakenOrMalicious}`, `${h.duplicates} duplicates · ${h.mistakenOrMalicious} mistaken or malicious`],
          ].map(([l, v, s]) => <div key={String(l)} className="rep-kpi"><div className="l">{l}</div><div className="v">{v}</div><div className="s">{s}</div></div>)}
        </div>

        <h2>Volume by {data.window.granularity}</h2>
        <PrintTrend labels={labels} series={[['Reported', '#2563EB', data.series.map(p => p.reported)], ['Resolved', '#15803D', data.series.map(p => p.resolved)], ['Critical', BAD, data.series.map(p => p.critical)]]} ghost={filters.compare && data.seriesBefore.length === data.series.length ? data.seriesBefore.map(p => p.reported) : undefined} />

        <h2>The response ladder</h2>
        <table>
          <thead><tr><th>Step</th><th className="n">Median</th><th className="n">90th percentile</th><th className="n">Measured</th><th className="n">Period before</th><th className="n">Change</th></tr></thead>
          <tbody>
            {([['Acknowledged', h.ladder.toAcknowledge, h.ladderBefore.toAcknowledge], ['Somebody sent', h.ladder.toAssign, h.ladderBefore.toAssign], ['On the way', h.ladder.toEnRoute, h.ladderBefore.toEnRoute], ['On scene', h.ladder.toScene, h.ladderBefore.toScene], ['Resolved', h.ladder.toResolve, h.ladderBefore.toResolve]] as const).map(([label, now, before]) => (
              <tr key={label}><td>{label}</td><td className="n">{m(now.medianMinutes)}</td><td className="n">{m(now.p90Minutes)}</td><td className="n">{now.count}</td><td className="n">{m(before.medianMinutes)}</td><td className="n" style={{ color: now.medianMinutes !== null && before.medianMinutes !== null ? (now.medianMinutes <= before.medianMinutes ? GOOD : BAD) : MUTED }}>{now.medianMinutes !== null && before.medianMinutes ? change(now.medianMinutes, before.medianMinutes) : '—'}</td></tr>
            ))}
          </tbody>
        </table>

        <h2 className="rep-break">When — weekday × hour</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '34px repeat(24, 1fr)', gap: 2 }}>
          <span />{Array.from({ length: 24 }, (_, hh) => <span key={hh} style={{ fontSize: 8, color: MUTED, textAlign: 'center' }}>{hh % 3 === 0 ? String(hh).padStart(2, '0') : ''}</span>)}
          {days.map((dn, wd) => [<span key={dn} style={{ fontSize: 9, color: MUTED }}>{dn}</span>, ...Array.from({ length: 24 }, (_, hh) => { const c = data.heatmap.find(x => x.weekday === wd && x.hour === hh); const v = c?.reported ?? 0; return <div key={`${wd}-${hh}`} title={`${dn} ${hh}:00 — ${v}`} style={{ height: 14, borderRadius: 2, background: v === 0 ? '#F3F4F6' : `rgba(37,99,235,${0.15 + 0.85 * (v / heatMax)})` }} />; })])}
        </div>
        <div style={{ color: MUTED, fontSize: 10, marginTop: 4 }}>Darker is busier. Peak cell: {heatMax} reports.</div>

        <h2>Where — by district</h2>
        <table>
          <thead><tr><th>District</th><th className="n">Reported</th>{filters.compare ? <th className="n">Before</th> : null}<th className="n">P1</th><th className="n">Unrouted</th><th className="n">To acknowledge</th><th className="n">To scene</th><th>Severity mix</th><th>Most reported</th></tr></thead>
          <tbody>{data.districts.map(x => <tr key={x.slug}><td>{x.name}</td><td className="n">{x.reported}</td>{filters.compare ? <td className="n" style={{ color: MUTED }}>{x.reportedBefore}</td> : null}<td className="n" style={{ color: x.critical ? BAD : MUTED }}>{x.critical}</td><td className="n" style={{ color: x.unrouted ? WARN : MUTED }}>{x.unrouted}</td><td className="n">{m(x.medianAckMinutes)}</td><td className="n">{m(x.medianSceneMinutes)}</td><td><span style={{ display: 'inline-flex', height: 7, width: 80, gap: 1 }}>{x.bySeverity.map((n, i) => n > 0 ? <span key={i} style={{ width: `${(n / x.reported) * 100}%`, background: SEV[i] }} /> : null)}</span></td><td style={{ color: MUTED }}>{x.topSituation ?? ''}</td></tr>)}</tbody>
        </table>

        <h2>What — by category</h2>
        <table>
          <thead><tr><th>Category</th><th className="n">Reported</th>{filters.compare ? <th className="n">Before</th> : null}<th className="n">P1</th><th className="n">Resolved</th><th className="n">Unrouted</th><th className="n">To acknowledge</th><th className="n">To scene</th><th>Outcomes</th></tr></thead>
          <tbody>{data.categories.map(c => <tr key={c.category}><td>{CATEGORY[c.category] ?? c.label}</td><td className="n">{c.reported}</td>{filters.compare ? <td className="n" style={{ color: MUTED }}>{c.reportedBefore}</td> : null}<td className="n">{c.critical}</td><td className="n">{c.resolved}</td><td className="n">{c.unrouted}</td><td className="n">{m(c.medianAckMinutes)}</td><td className="n">{m(c.medianSceneMinutes)}</td><td style={{ color: MUTED }}>{c.outcomes.map(o => `${OUTCOME[o.outcome] ?? o.label} ${o.count}`).join(' · ')}</td></tr>)}</tbody>
        </table>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 10 }}>
          <div><div style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>By severity</div><table><tbody>{data.bySeverity.filter(s => s.count > 0).map(s => <tr key={s.key}><td>P{s.key} {SEVERITY_WORDS[Number(s.key)]}</td><td className="n">{s.count}</td><td className="n" style={{ color: MUTED }}>{m(s.toAcknowledge.medianMinutes)}</td></tr>)}</tbody></table></div>
          <div><div style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>Most reported situations</div><table><tbody>{data.situations.slice(0, 8).map(s => <tr key={s.code}><td>{s.words}</td><td className="n">{s.count}</td><td className="n" style={{ color: MUTED }}>{s.critical} P1</td></tr>)}</tbody></table></div>
        </div>

        <h2 className="rep-break">Who answered — stations</h2>
        <table>
          <thead><tr><th>Station</th>{access.national ? <th>Institution</th> : null}<th className="n">Reported</th><th className="n">P1</th><th className="n">Ack ≤ 10 min</th><th className="n">To acknowledge</th><th className="n">To scene</th><th className="n">Sent</th><th className="n">Declined</th><th className="n">Escalations</th></tr></thead>
          <tbody>{data.stations.slice(0, 25).map(s => <tr key={s.facilityId}><td>{s.name}</td>{access.national ? <td style={{ color: MUTED }}>{s.institutionName}</td> : null}<td className="n">{s.reported}</td><td className="n">{s.critical}</td><td className="n">{s.acknowledgedWithinTenPct === null ? '—' : `${s.acknowledgedWithinTenPct}%`}</td><td className="n">{m(s.medianAckMinutes)}</td><td className="n">{m(s.medianSceneMinutes)}</td><td className="n">{s.assignments}</td><td className="n">{s.declined}</td><td className="n">{s.escalations}</td></tr>)}</tbody>
        </table>
        <h2>Who answered — responders</h2>
        <table>
          <thead><tr><th>Responder</th><th>Role</th><th>Station</th><th className="n">Sent</th><th className="n">Accepted</th><th className="n">Declined</th><th className="n">Completed</th><th className="n">To accept</th><th className="n">To scene</th></tr></thead>
          <tbody>{data.responders.slice(0, 25).map(r => <tr key={r.responderId}><td>{r.name}</td><td style={{ color: MUTED }}>{RESPONDER_ROLE[r.role]}</td><td style={{ color: MUTED }}>{r.facilityName ?? r.institutionName}</td><td className="n">{r.assigned}</td><td className="n">{r.accepted}</td><td className="n">{r.declined}</td><td className="n">{r.completed}</td><td className="n">{m(r.medianAcceptMinutes)}</td><td className="n">{m(r.medianOnSceneMinutes)}</td></tr>)}{data.responders.length === 0 ? <tr><td colSpan={9} style={{ color: MUTED }}>Nobody was sent through the platform in the window.</td></tr> : null}</tbody>
        </table>
        <h2>Who answered — dispatchers</h2>
        <table>
          <thead><tr><th>Dispatcher</th>{access.national ? <th>Institution</th> : null}<th className="n">Acknowledged</th><th className="n">Ack ≤ 10 min</th><th className="n">Median</th><th className="n">Sent</th><th className="n">Resolved</th><th className="n">Escalated</th></tr></thead>
          <tbody>{data.dispatchers.slice(0, 25).map(x => <tr key={x.userId}><td>{x.name}</td>{access.national ? <td style={{ color: MUTED }}>{x.institutionName ?? ''}</td> : null}<td className="n">{x.acknowledged}</td><td className="n">{x.acknowledgedWithinTenPct === null ? '—' : `${x.acknowledgedWithinTenPct}%`}</td><td className="n">{m(x.medianAckMinutes)}</td><td className="n">{x.sent}</td><td className="n">{x.resolved}</td><td className="n">{x.escalated}</td></tr>)}{data.dispatchers.length === 0 ? <tr><td colSpan={8} style={{ color: MUTED }}>No acknowledgement was recorded in the window.</td></tr> : null}</tbody>
        </table>

        {data.rulesFired.length > 0 ? (<><h2>Escalation rules that fired</h2><table><tbody>{data.rulesFired.map(r => <tr key={r.ruleId}><td>{r.name}</td><td style={{ color: MUTED }}>{r.institutionName ?? 'everybody'}</td><td className="n">{r.fired}</td></tr>)}</tbody></table></>) : null}

        <div style={{ marginTop: 26, paddingTop: 8, borderTop: `1px solid ${LINE}`, color: MUTED, fontSize: 9.5, display: 'flex', gap: 12 }}>
          <span>Every non-training incident in the window{data.window.national ? '' : ' routed to or sent to this institution'}. Medians are nearest-rank; a figure appears only where the moment happened. Private incidents are counted but never placed.</span>
          <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{d(data.headline.reported)} incidents · Vacancy Command</span>
        </div>
      </article>
    </div>
  );
}

function PrintTrend({ labels, series, ghost }: { labels: string[]; series: [string, string, number[]][]; ghost?: number[] }) {
  const W = 700, H = 170, L = 32, R = 10, Tp = 10, B = 22;
  const n = labels.length;
  const max = Math.max(1, ...series.flatMap(s => s[2]), ...(ghost ?? []));
  const x = (i: number) => L + (n <= 1 ? (W - L - R) / 2 : (i / (n - 1)) * (W - L - R));
  const y = (v: number) => Tp + (H - Tp - B) * (1 - v / max);
  const path = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const every = Math.max(1, Math.ceil(n / 12));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {[0, max / 2, max].map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={LINE} /><text x={L - 4} y={y(v) + 3} fontSize="9" fill={MUTED} textAnchor="end">{Math.round(v)}</text></g>)}
        {labels.map((l, i) => (i === n - 1 || (i % every === 0 && n - 1 - i >= every / 2)) ? <text key={i} x={x(i)} y={H - 6} fontSize="8.5" fill={MUTED} textAnchor="middle">{l}</text> : null)}
        {ghost ? <path d={path(ghost)} fill="none" stroke="#9CA3AF" strokeWidth="1.2" strokeDasharray="3 3" /> : null}
        {series.map(([label, colour, vals]) => <path key={label} d={path(vals)} fill="none" stroke={colour} strokeWidth="2" strokeLinejoin="round" />)}
      </svg>
      <div style={{ display: 'flex', gap: 12, fontSize: 9.5, color: MUTED }}>{series.map(([label, colour]) => <span key={label} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><span style={{ width: 10, height: 3, background: colour }} />{label}</span>)}{ghost ? <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><span style={{ width: 10, borderTop: '1.5px dashed #9CA3AF' }} />reported, period before</span> : null}</div>
    </div>
  );
}

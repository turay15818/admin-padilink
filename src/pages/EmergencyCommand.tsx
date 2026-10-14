/**
 * Command: the numbers and the live picture.
 *
 * <p>A dashboard is scanned, not read, so the summary comes first: six tiles, each a figure
 * with the number of incidents it was taken over, because a median of three is a story. Then
 * the response ladder — reported → acknowledged → sent → on the way → on scene → resolved —
 * as one scale of minutes with the 90th percentile as a tick beside each median. Then the
 * month by day, the day by hour, and the country as its sixteen districts, each a bubble
 * sized by what was reported and stroked in the worst severity open there now, with the live
 * picture — open incidents, responders' fresh dots — drawn over it.</p>
 *
 * <p>Every chart is drawn by hand in SVG on one scale, thin marks, text in text tokens; the
 * two-series line carries a legend and endpoint labels. Severity colour is semantic (danger,
 * warning, brand) and the categorical palette is the theme's validated one. A sensitive
 * incident is placed at its district's centroid with a ring, never at its pin — the API
 * already withholds the pin; the drawing just says so.</p>
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { Card, Cell, ErrorNote, Loading, PageHeader, Pill, Row, Table, fmtDateTime } from '../components/ui';
import { commandApi, INCIDENT_STATUS, RESPONDER_ROLE, SEVERITY, type CoveragePoint, type DayPoint, type DistrictPoint, type DistrictShape, type HourPoint, type InsightsOverview, type InstitutionPoint, type LivePicture, type Timing } from '../api/emergency';
import { connectEmergencyLive } from '../api/emergencyLive';
import type { AdminIdentity } from '../api/admin';

const err = (caught: unknown, fallback: string) => (caught instanceof Error ? caught.message : fallback);

/** A CSV the pilot report can paste: quoted cells, CRLF rows, UTF-8 with a BOM so Excel reads the accents. */
export function csvOf(head: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const text = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return '\ufeff' + [head, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
function downloadCsv(fileName: string, head: string[], rows: (string | number | null | undefined)[][]) {
  const blob = new Blob([csvOf(head, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** The institution table as rows for a CSV — one line per institution, medians with their sample sizes beside them. */
export function institutionRows(points: InstitutionPoint[]) {
  return [...points].sort((a, b) => b.reported - a.reported).map(i => [
    i.name, i.sectorCode, i.reported, i.openNow, i.unownedNow,
    i.toAcknowledge.medianMinutes, i.toAcknowledge.p90Minutes, i.toAcknowledge.count,
    i.toScene.medianMinutes, i.toScene.p90Minutes, i.toScene.count,
    i.assignmentsMade, i.declined, i.escalationsFired, i.respondersOnDuty,
  ]);
}
export const INSTITUTION_HEAD = ['Institution', 'Sector', 'Reported', 'Open now', 'Nobody on it', 'To acknowledge (median min)', 'To acknowledge (p90 min)', 'To acknowledge (n)', 'To on scene (median min)', 'To on scene (p90 min)', 'To on scene (n)', 'Assignments made', 'Declined', 'Escalations fired', 'Responders on duty'];
export function districtRows(points: DistrictPoint[]) {
  return points.map(d => [
    d.name, d.reported, d.reported - d.unrouted, d.unrouted, d.reported > 0 ? Math.round((100 * (d.reported - d.unrouted)) / d.reported) : null, d.openNow,
    d.toAcknowledge.medianMinutes, d.toAcknowledge.count, d.toScene.medianMinutes, d.toScene.count,
  ]);
}
export const DISTRICT_HEAD = ['District', 'Reported', 'Found a station', 'Without a station', 'Coverage %', 'Open now', 'To acknowledge (median min)', 'To acknowledge (n)', 'To on scene (median min)', 'To on scene (n)'];

const minutes = (m: number | null | undefined) => (m === null || m === undefined ? '—' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);
const delta = (now: number | null | undefined, before: number | null | undefined) => (now === null || now === undefined || before === null || before === undefined ? null : now - before);

export function EmergencyCommand({ identity }: { identity: AdminIdentity }) {
  const { t } = useTheme();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [institutionId, setInstitutionId] = useState('');
  const [sector, setSector] = useState('');
  const [overview, setOverview] = useState<InsightsOverview | null>(null);
  const [live, setLive] = useState<LivePicture | null>(null);
  const [shapes, setShapes] = useState<DistrictShape[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState(false);
  const liveTimer = useRef<number | null>(null);
  void identity;

  const load = useCallback(() => {
    commandApi.overview({ days, institutionId: institutionId || null, sectorCode: sector || null })
      .then(o => { setOverview(o); setError(null); })
      .catch((caught: unknown) => setError(err(caught, 'Could not load the numbers.')));
  }, [days, institutionId, sector]);
  const loadLive = useCallback(() => {
    commandApi.live().then(setLive).catch(() => { /* the overview stands on its own */ });
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    // The outlines never change within a session; without them the picture falls back to bubbles.
    commandApi.shapes().then(r => setShapes(r.districts)).catch(() => setShapes(null));
  }, []);
  useEffect(() => {
    loadLive();
    liveTimer.current = window.setInterval(loadLive, 30_000);
    const handle = connectEmergencyLive({
      'emergency.queue.changed': () => loadLive(),
      'emergency.responder.location': () => loadLive(),
      'emergency.reporter.location': () => loadLive(),
    }, setSocket);
    return () => { if (liveTimer.current) window.clearInterval(liveTimer.current); handle.close(); };
  }, [loadLive]);

  if (error) return <ErrorNote message={error} />;
  if (!overview) return <Loading label="Counting…" />;
  const o = overview;

  const seg = (active: boolean) => ({
    padding: '6px 11px', borderRadius: 8, border: `1px solid ${active ? t.brand : t.border}`, background: active ? t.brandSoft : 'transparent',
    color: active ? t.brand : t.textMuted, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
  } as const);
  const selectStyle = { padding: '6px 10px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontFamily: 'inherit', fontSize: 12.5 } as const;

  const reportedDelta = o.reported - o.reportedBefore;
  const ackDelta = delta(o.ladder.toAcknowledge.medianMinutes, o.ladderBefore.toAcknowledge.medianMinutes);
  const sceneDelta = delta(o.ladder.toScene.medianMinutes, o.ladderBefore.toScene.medianMinutes);

  return (
    <>
      <PageHeader
        title={o.national ? 'Command — national' : `Command — ${o.scope}`}
        subtitle={`${o.days} days to ${fmtDateTime(o.to)} · training reports never counted · every median comes with the number it was taken over`}
        action={(
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {[7, 30, 90].map(d => <button key={d} type="button" style={seg(days === d)} onClick={() => setDays(d as 7 | 30 | 90)}>{d} days</button>)}
            {o.national ? (
              <select value={institutionId} onChange={e => setInstitutionId(e.target.value)} style={selectStyle}>
                <option value="">Every institution</option>
                {o.byInstitution.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            ) : null}
            <select value={sector} onChange={e => setSector(e.target.value)} style={selectStyle}>
              <option value="">Every sector</option>
              {o.bySector.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <span style={{ fontSize: 11, fontWeight: 700, color: socket ? t.success : t.textSubtle }}>{socket ? 'Live' : 'Polling'}</span>
          </div>
        )}
      />

      {/* ------------------------------------------------ headline */}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 14 }}>
        <Tile label="Reported" value={o.reported} note={`${reportedDelta >= 0 ? '+' : ''}${reportedDelta} vs the ${o.days} days before`} />
        <Tile label="Open now" value={o.openNow} note={`${o.respondingNow} with somebody on the way or there`} />
        <Tile label="Nobody on it" value={o.unownedNow} tone={o.unownedNow > 0 ? t.warning : undefined} note={o.unownedNow > 0 ? 'open and unacknowledged — the desk' : 'every open incident is owned'} />
        <Tile label="Critical" value={o.critical} tone={o.critical > 0 ? t.danger : undefined} note={`${o.unrouted} waiting for a station`} />
        <Tile label="To acknowledge" value={minutes(o.ladder.toAcknowledge.medianMinutes)} note={sample(o.ladder.toAcknowledge, ackDelta, 'faster', 'slower')} tone={ackDelta !== null && ackDelta > 0 ? t.warning : undefined} />
        <Tile label="To on scene" value={minutes(o.ladder.toScene.medianMinutes)} note={sample(o.ladder.toScene, sceneDelta, 'faster', 'slower')} tone={sceneDelta !== null && sceneDelta > 0 ? t.warning : undefined} />
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', alignItems: 'start', marginBottom: 12 }}>
        <Panel title="The response ladder" note="Median minutes from the report, over the incidents that reached each step. The tick is the 90th percentile.">
          <Ladder o={o} />
        </Panel>
        <Panel title="By day" note="Reported and resolved, each day of the window.">
          <DayLine points={o.byDay} />
        </Panel>
        <Panel title="By hour of the day" note="When people report. Local time is UTC in Sierra Leone.">
          <HourBars points={o.byHour} />
        </Panel>
        <Panel title="Found a station" note="Of what was reported each week, the share the directory could route to a station. A gap here is a directory gap, not a reporter's.">
          <CoverageBars points={o.coverage} />
        </Panel>
        <Panel title="By severity" note="What was reported, and how fast each was acknowledged.">
          <Buckets rows={o.bySeverity.filter(b => b.count > 0).map(b => ({ label: b.label, count: b.count, timing: b.toAcknowledge, tone: severityTone(Number(b.key), t) }))} />
        </Panel>
        <Panel title="By category" note="">
          <Buckets rows={o.byCategory.filter(b => b.count > 0).map((b, i) => ({ label: b.label, count: b.count, timing: b.toAcknowledge, tone: t.series[i % t.series.length] }))} />
        </Panel>
        <Panel title="The response" note="">
          <Fact label="Assignments made" value={o.assignmentsMade} />
          <Fact label="Declined" value={`${o.assignmentsDeclined}${o.assignmentsMade ? ` (${Math.round((100 * o.assignmentsDeclined) / o.assignmentsMade)}%)` : ''}`} />
          <Fact label="Stood down" value={o.assignmentsStoodDown} />
          <Fact label="Accepted in" value={`${minutes(o.toAccept.medianMinutes)} · n ${o.toAccept.count}`} />
          <Fact label="Escalations fired" value={o.escalationsFired} />
          {o.rulesFired.map(r => <Fact key={r.ruleId} label={`· ${r.name}`} value={`${r.fired}${r.institutionName ? ` · ${r.institutionName}` : ' · national'}`} />)}
          <Fact label="On duty now" value={`${o.respondersOnDuty} responders · ${o.respondersFree} free · ${o.vehiclesFree} vehicles free`} />
          {o.outcomes.length > 0 ? <Fact label="Closed as" value={o.outcomes.map(x => `${x.label.toLowerCase()} ${x.count}`).join(' · ')} /> : null}
        </Panel>
      </div>

      {/* ------------------------------------------------ the country */}
      <Panel title="The country" note={live ? `Live: ${live.incidents.length} open · ${live.responders.length} responders sharing a position · refreshed ${fmtDateTime(live.asOf)}` : `${shapes ? 'Shade' : 'Bubbles'}: reported in ${o.days} days. Stroke: the worst severity open there now.`}>
        <CountryPicture districts={o.byDistrict} shapes={shapes} live={live} />
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" data-export="districts" style={csvButton(t)} onClick={() => downloadCsv(`districts-${o.days}d-${o.to.slice(0, 10)}.csv`, DISTRICT_HEAD, districtRows(o.byDistrict))}>Export districts (CSV)</button>
        </div>
      </Panel>

      {o.national && o.byInstitution.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <Card pad={0}>
            <div style={{ padding: '12px 18px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, fontSize: 12, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.5 }}>By institution</div>
              <button type="button" data-export="institutions" style={csvButton(t)} onClick={() => downloadCsv(`institutions-${o.days}d-${o.to.slice(0, 10)}.csv`, INSTITUTION_HEAD, institutionRows(o.byInstitution))}>Export (CSV)</button>
            </div>
            <Table head={['Institution', 'Reported', 'Open · nobody on it', 'To acknowledge', 'To on scene', 'Sent · declined', 'Escalated', 'On duty']}>
              {[...o.byInstitution].sort((a, b) => b.reported - a.reported).map(i => (
                <Row key={i.id}>
                  <Cell><strong>{i.name}</strong><div style={{ fontSize: 11.5, color: t.textSubtle }}>{i.sectorCode}</div></Cell>
                  <Cell mono>{i.reported}</Cell>
                  <Cell>{i.openNow}{i.unownedNow > 0 ? <span style={{ color: t.warning, fontWeight: 700 }}> · {i.unownedNow}</span> : ' · 0'}</Cell>
                  <Cell>{minutes(i.toAcknowledge.medianMinutes)} <span style={{ color: t.textSubtle }}>n {i.toAcknowledge.count}</span></Cell>
                  <Cell>{minutes(i.toScene.medianMinutes)} <span style={{ color: t.textSubtle }}>n {i.toScene.count}</span></Cell>
                  <Cell>{i.assignmentsMade} · {i.declined}</Cell>
                  <Cell>{i.escalationsFired > 0 ? <Pill tone="warning">{i.escalationsFired}</Pill> : '0'}</Cell>
                  <Cell>{i.respondersOnDuty}</Cell>
                </Row>
              ))}
            </Table>
          </Card>
        </div>
      ) : null}

      {live && live.incidents.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <Card pad={0}>
            <div style={{ padding: '12px 18px 0', fontSize: 12, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.5 }}>Open right now</div>
            <Table head={['Number', 'Severity', 'What', 'Where', 'Status', 'Age', 'Who answers', 'Responding']}>
              {live.incidents.map(i => (
                <Row key={i.id}>
                  <Cell mono>{i.number}</Cell>
                  <Cell><span style={{ color: severityTone(i.severity, t), fontWeight: 800 }}>{SEVERITY[i.severity]?.split(' ')[0]}</span></Cell>
                  <Cell>{i.isSensitive ? <Pill tone="neutral">Private</Pill> : i.situationWords}</Cell>
                  <Cell>{i.districtSlug ?? '—'}</Cell>
                  <Cell>{INCIDENT_STATUS[i.status]}{i.escalationLevel > 0 ? <span style={{ color: t.warning, fontWeight: 700 }}> · L{i.escalationLevel}</span> : null}</Cell>
                  <Cell mono>{minutes(i.ageMinutes)}</Cell>
                  <Cell>{i.facilityName ?? <span style={{ color: t.warning, fontWeight: 700 }}>nobody</span>}{i.unowned ? <span style={{ color: t.warning, fontWeight: 700 }}> · nobody on it</span> : null}</Cell>
                  <Cell mono>{i.responding}</Cell>
                </Row>
              ))}
            </Table>
          </Card>
        </div>
      ) : null}
    </>
  );
}

const csvButton = (t: { border: string; text: string; surface: string }) => ({
  padding: '5px 10px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
} as const);

/** Weekly bars: reported as the faint bar, found as the solid one on top of it, the share written on each. */
function CoverageBars({ points }: { points: CoveragePoint[] }) {
  const { t } = useTheme();
  const W = 620, H = 150, padL = 8, padB = 30, padT = 16;
  const max = Math.max(1, ...points.map(p => p.reported));
  const slot = (W - 2 * padL) / Math.max(1, points.length);
  const bw = Math.min(46, slot * 0.6);
  const y = (n: number) => padT + (H - padT - padB) * (1 - n / max);
  const totalReported = points.reduce((a, p) => a + p.reported, 0);
  const totalFound = points.reduce((a, p) => a + p.found, 0);
  const share = totalReported > 0 ? Math.round((100 * totalFound) / totalReported) : null;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span data-coverage-share style={{ fontSize: 26, fontWeight: 800, color: share === null ? t.textSubtle : share >= 90 ? t.success : share >= 70 ? t.warning : t.danger, fontVariantNumeric: 'tabular-nums' }}>{share === null ? '—' : `${share}%`}</span>
        <span style={{ fontSize: 12.5, color: t.textMuted }}>{totalReported > 0 ? `${totalFound} of ${totalReported} found a station` : 'nothing reported in the window'}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxWidth: 620 }} role="img" aria-label="Found a station, by week">
        <line x1={padL} x2={W - padL} y1={y(0)} y2={y(0)} stroke={t.border} />
        {points.map((p, i) => {
          const x = padL + slot * i + (slot - bw) / 2;
          const pct = p.reported > 0 ? Math.round((100 * p.found) / p.reported) : null;
          return (
            <g key={p.week}>
              <rect x={x} y={y(p.reported)} width={bw} height={Math.max(0, y(0) - y(p.reported))} fill={t.series[0]} fillOpacity={0.18} rx={3} />
              <rect x={x} y={y(p.found)} width={bw} height={Math.max(0, y(0) - y(p.found))} fill={t.series[0]} rx={3} />
              {pct !== null ? <text x={x + bw / 2} y={y(p.reported) - 4} fontSize={9.5} fontWeight={700} fill={t.textMuted} textAnchor="middle">{pct}%</text> : null}
              <text x={x + bw / 2} y={H - 12} fontSize={9} fill={t.textSubtle} textAnchor="middle">{p.week.slice(5)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function sample(timing: Timing, d: number | null, better: string, worse: string) {
  const n = `n ${timing.count}`;
  if (d === null || d === 0) return `${n} · ${d === 0 ? 'unchanged' : 'no earlier period'}`;
  return `${n} · ${Math.abs(d)} min ${d < 0 ? better : worse} than before`;
}

function severityTone(severity: number, t: { danger: string; warning: string; brand: string; textMuted: string; border: string }) {
  return severity === 1 ? t.danger : severity === 2 ? t.warning : severity === 3 ? t.brand : severity === 4 ? t.textMuted : t.border;
}

/* ------------------------------------------------------------------ pieces */

function Tile({ label, value, note, tone }: { label: string; value: string | number; note: string; tone?: string }) {
  const { t } = useTheme();
  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: '10px 14px', background: t.surface }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: tone ?? t.text, fontVariantNumeric: 'tabular-nums', marginTop: 2, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 4 }}>{note}</div>
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  const { t } = useTheme();
  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: '12px 14px', background: t.surface, minWidth: 0 }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</div>
      {note ? <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 2, marginBottom: 8 }}>{note}</div> : <div style={{ height: 8 }} />}
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  const { t } = useTheme();
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 12.5, padding: '3px 0' }}>
      <span style={{ width: 130, flexShrink: 0, color: t.textSubtle }}>{label}</span>
      <span style={{ color: t.text, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

/** Five medians on one scale of minutes, the 90th percentile a tick beside each. */
export function Ladder({ o }: { o: InsightsOverview }) {
  const { t } = useTheme();
  const steps: [string, Timing, Timing][] = [
    ['Acknowledged', o.ladder.toAcknowledge, o.ladderBefore.toAcknowledge],
    ['Somebody sent', o.ladder.toAssign, o.ladderBefore.toAssign],
    ['On the way', o.ladder.toEnRoute, o.ladderBefore.toEnRoute],
    ['On scene', o.ladder.toScene, o.ladderBefore.toScene],
    ['Resolved', o.ladder.toResolve, o.ladderBefore.toResolve],
  ];
  const max = Math.max(10, ...steps.map(([, s]) => s.p90Minutes ?? s.medianMinutes ?? 0));
  const W = 320, L = 108, R = 48, rowH = 26;
  const x = (m: number) => L + ((W - L - R) * Math.min(m, max)) / max;
  return (
    <svg viewBox={`0 0 ${W} ${steps.length * rowH + 22}`} width="100%" style={{ display: 'block', maxWidth: 560 }} role="img" aria-label="Response ladder">
      {steps.map(([label, s, before], i) => {
        const y = i * rowH + 8;
        const median = s.medianMinutes;
        return (
          <g key={label}>
            <text x={L - 8} y={y + 12} textAnchor="end" fontSize={11} fill={t.text} fontWeight={700}>{label}</text>
            <line x1={L} x2={W - R} y1={y + 8} y2={y + 8} stroke={t.border} strokeWidth={1} />
            {median !== null ? <rect x={L} y={y + 3} width={Math.max(2, x(median) - L)} height={10} rx={2} fill={t.brand} /> : null}
            {s.p90Minutes !== null ? <line x1={x(s.p90Minutes)} x2={x(s.p90Minutes)} y1={y} y2={y + 16} stroke={t.textMuted} strokeWidth={2} /> : null}
            {before.medianMinutes !== null ? <line x1={x(before.medianMinutes)} x2={x(before.medianMinutes)} y1={y + 1} y2={y + 15} stroke={t.textSubtle} strokeWidth={1} strokeDasharray="2 2" /> : null}
            <text x={W - R + 6} y={y + 12} fontSize={11} fill={t.textMuted} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {median === null ? 'none yet' : `${median} min`}{s.count > 0 ? ` · ${s.count}` : ''}
            </text>
          </g>
        );
      })}
      <text x={L} y={steps.length * rowH + 16} fontSize={10} fill={t.textSubtle}>0</text>
      <text x={W - R} y={steps.length * rowH + 16} fontSize={10} fill={t.textSubtle} textAnchor="end">{max} min</text>
      <text x={(L + W - R) / 2} y={steps.length * rowH + 16} fontSize={10} fill={t.textSubtle} textAnchor="middle">bar median · tick 90th · dashed the period before</text>
    </svg>
  );
}

/** Two series, one scale, a legend and the last value labelled. */
export function DayLine({ points }: { points: DayPoint[] }) {
  const { t } = useTheme();
  const W = 360, H = 150, L = 28, R = 40, T = 14, B = 22;
  const max = Math.max(4, ...points.flatMap(p => [p.reported, p.resolved]));
  const x = (i: number) => L + ((W - L - R) * i) / Math.max(1, points.length - 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const path = (pick: (p: DayPoint) => number) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(pick(p)).toFixed(1)}`).join(' ');
  const [c1, c2] = [t.series[0], t.series[1]];
  const last = points[points.length - 1];
  const ticks = [0, Math.round(max / 2), max];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxWidth: 620 }} role="img" aria-label="Reported and resolved by day">
      {ticks.map(v => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={t.border} strokeWidth={1} />
          <text x={L - 4} y={y(v) + 3} textAnchor="end" fontSize={9} fill={t.textSubtle}>{v}</text>
        </g>
      ))}
      <path d={path(p => p.reported)} fill="none" stroke={c1} strokeWidth={2} strokeLinejoin="round" />
      <path d={path(p => p.resolved)} fill="none" stroke={c2} strokeWidth={2} strokeLinejoin="round" />
      {last ? (
        <>
          <circle cx={x(points.length - 1)} cy={y(last.reported)} r={3.5} fill={c1} stroke={t.surface} strokeWidth={2} />
          <circle cx={x(points.length - 1)} cy={y(last.resolved)} r={3.5} fill={c2} stroke={t.surface} strokeWidth={2} />
          <text x={W - R + 6} y={y(last.reported) + 3} fontSize={10} fill={t.text} fontWeight={700}>{last.reported}</text>
          <text x={W - R + 6} y={y(last.resolved) + (Math.abs(y(last.resolved) - y(last.reported)) < 10 ? 12 : 3)} fontSize={10} fill={t.text} fontWeight={700}>{last.resolved}</text>
        </>
      ) : null}
      <text x={L} y={H - 6} fontSize={9} fill={t.textSubtle}>{points[0]?.day.slice(5)}</text>
      <text x={W - R} y={H - 6} fontSize={9} fill={t.textSubtle} textAnchor="end">{last?.day.slice(5)}</text>
      <g transform={`translate(${L + 4}, ${T - 6})`}>
        <rect width={10} height={3} y={-2} fill={c1} /><text x={14} y={2} fontSize={9.5} fill={t.textMuted}>reported</text>
        <rect x={66} width={10} height={3} y={-2} fill={c2} /><text x={80} y={2} fontSize={9.5} fill={t.textMuted}>resolved</text>
      </g>
    </svg>
  );
}

export function HourBars({ points }: { points: HourPoint[] }) {
  const { t } = useTheme();
  const W = 360, H = 120, L = 22, R = 6, T = 12, B = 18;
  const max = Math.max(3, ...points.map(p => p.reported));
  const slot = (W - L - R) / 24;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const busiest = points.reduce((a, b) => (b.reported > a.reported ? b : a), points[0]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxWidth: 620 }} role="img" aria-label="Reports by hour">
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke={t.border} />
      <text x={L - 4} y={y(max) + 3} textAnchor="end" fontSize={9} fill={t.textSubtle}>{max}</text>
      {points.map(p => (
        <g key={p.hour}>
          <rect x={L + p.hour * slot + 1.5} y={y(p.reported)} width={slot - 3} height={Math.max(0, y(0) - y(p.reported))} rx={2} fill={p.reported === busiest?.reported && p.reported > 0 ? t.brand : t.series[0]} opacity={p.reported === busiest?.reported ? 1 : 0.75} />
          {p.hour % 6 === 0 ? <text x={L + p.hour * slot + slot / 2} y={H - 5} fontSize={9} fill={t.textSubtle} textAnchor="middle">{`${p.hour}:00`}</text> : null}
        </g>
      ))}
      {busiest && busiest.reported > 0 ? <text x={L + busiest.hour * slot + slot / 2} y={y(busiest.reported) - 3} fontSize={9.5} fill={t.text} fontWeight={700} textAnchor="middle">{busiest.reported}</text> : null}
    </svg>
  );
}

export function Buckets({ rows }: { rows: { label: string; count: number; timing: Timing; tone: string }[] }) {
  const { t } = useTheme();
  const max = Math.max(1, ...rows.map(r => r.count));
  if (rows.length === 0) return <div style={{ fontSize: 12.5, color: t.textSubtle }}>Nothing in this window.</div>;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 130px', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <span style={{ color: t.text, fontWeight: 700 }}>{r.label}</span>
          <div style={{ height: 8, background: t.surfaceMuted, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${(100 * r.count) / max}%`, height: '100%', background: r.tone, borderRadius: 4 }} />
          </div>
          <span style={{ color: t.textMuted, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
            <strong style={{ color: t.text }}>{r.count}</strong>{r.timing.medianMinutes !== null ? ` · ack ${r.timing.medianMinutes} min` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Sierra Leone as sixteen centroids. An equirectangular projection of the country's bounding
 * box is honest at this size: bubbles at the district's anchor, not boundaries the platform
 * does not have. Live incidents are dots at their pin — or, when private, a ring at the
 * district's centroid — and responders are small diamonds.
 */
function CountryPicture({ districts, shapes, live }: { districts: DistrictPoint[]; shapes: DistrictShape[] | null; live: LivePicture | null }) {
  const { t } = useTheme();
  const W = 560, H = 440, pad = 34;
  const LAT = [6.85, 10.05], LNG = [-13.45, -10.2];
  const px = (lng: number) => pad + ((W - 2 * pad) * (lng - LNG[0])) / (LNG[1] - LNG[0]);
  const py = (lat: number) => pad + ((H - 2 * pad) * (LAT[1] - lat)) / (LAT[1] - LAT[0]);
  const maxReported = Math.max(1, ...districts.map(d => d.reported));
  const r = (n: number) => 6 + 26 * Math.sqrt(n / maxReported);
  const [hover, setHover] = useState<string | null>(null);
  const hovered = useMemo(() => districts.find(d => d.slug === hover) ?? null, [districts, hover]);
  // One path per district, every ring of it, in picture coordinates.
  const paths = useMemo(() => (shapes ?? []).map(s => ({
    slug: s.slug,
    d: s.rings.map(ring => ring.map(([lat, lng], i) => `${i === 0 ? 'M' : 'L'}${px(lng).toFixed(1)} ${py(lat).toFixed(1)}`).join(' ') + 'Z').join(' '),
  })), [shapes]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(280px, 3fr) minmax(180px, 1fr)', alignItems: 'start' }}>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxWidth: 720, background: t.surfaceMuted, borderRadius: 12 }} role="img" aria-label="Districts and what is open">
          {/* A faint graticule so the eye has a scale. Half-degree lines. */}
          {[7, 7.5, 8, 8.5, 9, 9.5, 10].map(lat => <line key={`lat${lat}`} x1={pad} x2={W - pad} y1={py(lat)} y2={py(lat)} stroke={t.border} strokeWidth={0.6} />)}
          {[-13, -12.5, -12, -11.5, -11, -10.5].map(lng => <line key={`lng${lng}`} x1={px(lng)} x2={px(lng)} y1={pad} y2={H - pad} stroke={t.border} strokeWidth={0.6} />)}
          {paths.length > 0 ? paths.map(p => {
            const d = districts.find(x => x.slug === p.slug);
            const reported = d?.reported ?? 0;
            return (
              <path key={p.slug} data-district={p.slug} d={p.d}
                fill={t.series[0]} fillOpacity={reported > 0 ? 0.12 + 0.5 * Math.sqrt(reported / maxReported) : 0.04}
                stroke={d?.worstOpenSeverity ? severityTone(d.worstOpenSeverity, t) : hover === p.slug ? t.text : t.borderStrong}
                strokeWidth={d?.worstOpenSeverity ? 2 : hover === p.slug ? 1.5 : 0.8} strokeLinejoin="round"
                onMouseEnter={() => setHover(p.slug)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }} />
            );
          }) : null}
          {districts.map(d => (
            <g key={d.slug} onMouseEnter={() => setHover(d.slug)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default', pointerEvents: paths.length > 0 ? 'none' : 'auto' }}>
              {paths.length === 0 ? (
                <circle cx={px(d.longitude)} cy={py(d.latitude)} r={r(d.reported)}
                  fill={d.reported > 0 ? t.series[0] : 'transparent'} fillOpacity={0.22}
                  stroke={d.worstOpenSeverity ? severityTone(d.worstOpenSeverity, t) : t.borderStrong} strokeWidth={d.worstOpenSeverity ? 2.5 : 1} />
              ) : null}
              <text x={px(d.longitude)} y={py(d.latitude) - (paths.length > 0 ? 6 : r(d.reported) + 3)} fontSize={9.5} fill={t.textMuted} textAnchor="middle">{d.name.replace('Western Area ', 'W.a. ')}</text>
              {d.reported > 0 ? <text x={px(d.longitude)} y={py(d.latitude) + (paths.length > 0 ? 6 : 3.5)} fontSize={10} fontWeight={800} fill={t.text} textAnchor="middle">{d.reported}</text> : null}
            </g>
          ))}
          {live?.incidents.map(i => {
            const d = districts.find(x => x.slug === i.districtSlug);
            const cx = i.latitude !== null && i.longitude !== null ? px(i.longitude) : d ? px(d.longitude) : null;
            const cy = i.latitude !== null && i.longitude !== null ? py(i.latitude) : d ? py(d.latitude) : null;
            if (cx === null || cy === null) return null;
            const tone = severityTone(i.severity, t);
            return i.isSensitive
              ? <circle key={i.id} cx={cx} cy={cy} r={5} fill="none" stroke={tone} strokeWidth={2} strokeDasharray="2 2"><title>{`${i.number} · private · ${INCIDENT_STATUS[i.status]}`}</title></circle>
              : <circle key={i.id} cx={cx} cy={cy} r={4} fill={tone} stroke={t.surface} strokeWidth={1.5}><title>{`${i.number} · ${i.situationWords} · ${INCIDENT_STATUS[i.status]} · ${minutes(i.ageMinutes)}`}</title></circle>;
          })}
          {live?.responders.map(p => (
            <g key={p.id} transform={`translate(${px(p.longitude)}, ${py(p.latitude)}) rotate(45)`}>
              <rect x={-4} y={-4} width={8} height={8} fill={t.success} stroke={t.surface} strokeWidth={1.5}>
                <title>{`${p.name} · ${RESPONDER_ROLE[p.role]} · ${p.onIncidentNumber ? `on ${p.onIncidentNumber}` : 'free'} · seen ${p.ageMinutes} min ago`}</title>
              </rect>
            </g>
          ))}
          <g transform={`translate(${pad}, ${H - 12})`} fontSize={9.5} fill={t.textMuted}>
            <circle cx={4} cy={-3} r={4} fill={t.series[0]} fillOpacity={0.22} stroke={t.borderStrong} /><text x={12} y={0}>reported</text>
            <circle cx={70} cy={-3} r={3.5} fill={t.danger} /><text x={78} y={0}>open now</text>
            <circle cx={136} cy={-3} r={4} fill="none" stroke={t.warning} strokeDasharray="2 2" strokeWidth={1.5} /><text x={144} y={0}>private, at its district</text>
            <rect x={258} y={-7} width={7} height={7} fill={t.success} transform="rotate(45 261.5 -3.5)" /><text x={270} y={0}>responder sharing a position</text>
          </g>
        </svg>
      </div>
      <div style={{ fontSize: 12.5, color: t.text, display: 'grid', gap: 4, alignContent: 'start' }}>
        {hovered ? (
          <>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{hovered.name}</div>
            <Fact label="Reported" value={hovered.reported} />
            <Fact label="Open now" value={hovered.openNow} />
            <Fact label="Without a station" value={hovered.unrouted} />
            <Fact label="Found a station" value={hovered.reported > 0 ? `${Math.round((100 * (hovered.reported - hovered.unrouted)) / hovered.reported)}%` : '—'} />
            <Fact label="To acknowledge" value={`${minutes(hovered.toAcknowledge.medianMinutes)} · n ${hovered.toAcknowledge.count}`} />
            <Fact label="To on scene" value={`${minutes(hovered.toScene.medianMinutes)} · n ${hovered.toScene.count}`} />
          </>
        ) : (
          <>
            <div style={{ color: t.textMuted }}>Hover a district for its numbers.</div>
            {[...districts].filter(d => d.reported > 0).sort((a, b) => b.reported - a.reported).slice(0, 6).map(d => (
              <div key={d.slug} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ flex: 1 }}>{d.name}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{d.reported}</span>
                <span style={{ color: t.textSubtle, fontVariantNumeric: 'tabular-nums', width: 62, textAlign: 'right' }}>{d.toAcknowledge.medianMinutes !== null ? `${d.toAcknowledge.medianMinutes} min` : '—'}</span>
              </div>
            ))}
            {live && live.fleet.length > 0 ? (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${t.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>On duty now</div>
                {live.fleet.map(f => (
                  <div key={f.institutionName} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    <span style={{ flex: 1 }}>{f.institutionName}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: t.textMuted }}>{f.respondersFree}/{f.respondersOnDuty} free · {f.vehiclesFree} veh</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

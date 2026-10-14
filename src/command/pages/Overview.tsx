/**
 * The wall at a glance.
 *
 * Twelve numbers across the top — what is open, who is on it, how fast the desk is
 * moving — then the map beside what needs a hand now, then the last thirty days as
 * lines, hours, the ladder and the places. Everything on this screen follows the room:
 * a nudge from the hub refetches the live picture and the queue; the thirty-day numbers
 * refresh once a minute, which is as fast as they can change.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CATEGORY, INCIDENT_STATUS, RESPONDER_ROLE, RESPONDER_STATUS, commandApi, errorWords, isOpen, type DispatchQueue, type FleetSummary, type InsightsOverview, type LivePicture, type RosterResponse } from '../api';
import { HBars, HourStrip, Ladder, Lines, Ring, Spark } from '../charts';
import { LiveMap } from '../LiveMap';
import { T } from '../theme';
import { Btn, Empty, ErrorLine, Eyebrow, Panel, Pill, SeverityMark, Tile, age, fmtTime, minutesWord } from '../ui';
import { useCommand } from '../useCommand';

export function Overview() {
  const { tick, shapes, access, districtName, institutionId, institutionName } = useCommand();
  const navigate = useNavigate();
  const [live, setLive] = useState<LivePicture | null>(null);
  const [queue, setQueue] = useState<DispatchQueue | null>(null);
  const [fleet, setFleet] = useState<FleetSummary | null>(null);
  const [insights, setInsights] = useState<InsightsOverview | null>(null);
  const [roster, setRoster] = useState<RosterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([commandApi.live(), commandApi.queue({ take: 300 }), commandApi.fleet()])
      .then(([l, q, f]) => { setLive(l); setQueue(q); setFleet(f); setError(null); })
      .catch(caught => setError(errorWords(caught, 'Could not load the picture.')));
  }, [tick]);
  useEffect(() => {
    const load = () => {
      commandApi.insights(30, institutionId).then(setInsights).catch(() => { /* the lower half waits */ });
      const from = new Date(); from.setUTCHours(0, 0, 0, 0);
      const to = new Date(from); to.setUTCDate(to.getUTCDate() + 1);
      commandApi.roster({ institutionId, from: from.toISOString(), to: to.toISOString() }).then(setRoster).catch(() => setRoster(null));
    };
    load();
    const h = window.setInterval(load, 60_000);
    return () => window.clearInterval(h);
  }, [institutionId]);

  const openCards = useMemo(() => (queue?.cards ?? []).filter(c => isOpen(c.status)), [queue]);
  const attention = useMemo(() => [...openCards].filter(c => c.unowned || c.severity === 1 || c.escalationLevel > 0).sort((a, b) => (Number(b.unowned) - Number(a.unowned)) || (a.severity - b.severity) || (b.ageMinutes - a.ageMinutes)).slice(0, 8), [openCards]);
  const responding = openCards.filter(c => [9, 10, 11].includes(c.status)).length;
  const last7 = insights?.byDay.slice(-7).map(d => d.reported) ?? [];
  const today = insights?.byDay[insights.byDay.length - 1];
  const dayLabels = insights?.byDay.map(d => d.day.slice(5)) ?? [];
  const now = roster?.shifts.filter(s => s.when === 'now') ?? [];
  const next = roster?.shifts.filter(s => s.when === 'next' || s.when === 'later').slice(0, 4) ?? [];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: 8 }}>
        <Tile label="Open now" value={openCards.length} tone={openCards.length > 0 ? T.text : T.subtle} onClick={() => navigate('/queue')} note={<>{queue?.unowned ?? 0} unowned</>} />
        <Tile label="Unowned" value={queue?.unowned ?? 0} tone={(queue?.unowned ?? 0) > 0 ? T.warn : T.subtle} onClick={() => navigate('/queue?filter=unowned')} note="nobody has acknowledged" />
        <Tile label="P1 open" value={queue?.p1Open ?? 0} tone={(queue?.p1Open ?? 0) > 0 ? T.bad : T.subtle} onClick={() => navigate('/queue?filter=p1')} note="critical, still open" />
        <Tile label="Responding" value={responding} tone={responding > 0 ? T.good : T.subtle} onClick={() => navigate('/queue?filter=responding')} note="somebody sent or on scene" />
        <Tile label="Today" value={today?.reported ?? '—'} spark={<Spark values={last7} />} note={<>{today?.resolved ?? 0} resolved · {today?.critical ?? 0} critical</>} />
        <Tile label="30 days" value={insights?.reported ?? '—'} note={insights ? <Delta now={insights.reported} before={insights.reportedBefore} /> : undefined} onClick={() => navigate('/analytics')} />
        <Tile label="To acknowledge" value={insights?.ladder.toAcknowledge.medianMinutes ?? '—'} note={insights ? <>median min · 90th {minutesWord(insights.ladder.toAcknowledge.p90Minutes)}</> : undefined} />
        <Tile label="To scene" value={insights?.ladder.toScene.medianMinutes ?? '—'} note={insights ? <>median min · {insights.ladder.toScene.count} measured</> : undefined} />
        <Tile label="On duty" value={fleet?.onDuty ?? '—'} tone={fleet && fleet.onDuty > 0 ? T.good : undefined} note={fleet ? <>{fleet.free} free of {fleet.responders}</> : undefined} onClick={() => navigate('/fleet')} />
        <Tile label="Vehicles free" value={fleet?.vehiclesFree ?? '—'} note={fleet ? <>of {fleet.vehicles} · {fleet.openAssignments} out</> : undefined} onClick={() => navigate('/fleet')} />
        <Tile label="Rostered now" value={fleet?.rosteredNow ?? '—'} tone={fleet && fleet.rosteredNotOn > 0 ? T.warn : undefined} note={fleet ? (fleet.rosteredNotOn > 0 ? <span style={{ color: T.warn }}>{fleet.rosteredNotOn} rostered but not on</span> : 'everybody rostered is on') : undefined} onClick={() => navigate('/roster')} />
        <Tile label="Found a station" value={<Ring part={(insights?.reported ?? 0) - (insights?.unrouted ?? 0)} whole={insights?.reported ?? 0} size={44} />} note="of reports, routed" />
      </div>

      <div className="cc-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(320px, 1fr)', gap: 12 }}>
        <Panel title={<>Live · {institutionName ?? live?.scope ?? access.institutionName ?? ''}</>} note={live ? `${live.incidents.length} open · ${live.responders.length} responders sharing position` : undefined} action={<Btn size="xs" tone="ghost" onClick={() => navigate('/map')}>Open the wall ›</Btn>} flush>
          <div style={{ height: 380 }}><LiveMap live={live} shapes={shapes} onOpen={id => navigate(`/queue?open=${id}`)} fit /></div>
        </Panel>
        <Panel title="Needs a hand" note={attention.length === 0 ? undefined : `${attention.length} of ${openCards.length} open`} flush style={{ minHeight: 380 }}>
          {attention.length === 0 ? <Empty>{openCards.length === 0 ? 'Nothing open. The room is quiet.' : 'Everything open is owned and below P1.'}</Empty> : (
            <div>
              {attention.map(c => (
                <Link key={c.id} to={`/queue?open=${c.id}`} className="cc-row" style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 12px', borderBottom: `1px solid ${T.line}`, textDecoration: 'none', color: T.text }}>
                  <SeverityMark severity={c.severity} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><b className="cc-num">{c.number}</b><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.situationWords}</span></span>
                    <span style={{ fontSize: 11, color: T.subtle }}>{districtName(c.districtSlug)} · {c.facilityName ?? 'unrouted'} · {INCIDENT_STATUS[c.status]}{c.escalationLevel > 0 ? ` · L${c.escalationLevel}` : ''}</span>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <div className="cc-num" style={{ fontSize: 12, color: c.unowned && c.ageMinutes > 10 ? T.bad : T.muted }}>{age(c.ageMinutes)}</div>
                    {c.unowned ? <Pill tone="warn">unowned</Pill> : null}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="cc-grid-3" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
        <Panel title="Thirty days" note={insights ? `${insights.from.slice(0, 10)} → ${insights.to.slice(0, 10)}` : undefined}>
          {insights ? <Lines labels={dayLabels} series={[{ key: 'r', label: 'Reported', colour: T.series[0], values: insights.byDay.map(d => d.reported), area: true }, { key: 's', label: 'Resolved', colour: T.series[2], values: insights.byDay.map(d => d.resolved) }, { key: 'c', label: 'Critical', colour: T.bad, values: insights.byDay.map(d => d.critical) }]} /> : <Empty>Loading…</Empty>}
        </Panel>
        <Panel title="By hour of day" note="last 30 days">
          {insights ? <HourStrip hours={insights.byHour} /> : <Empty>Loading…</Empty>}
          <div style={{ marginTop: 14 }}><Eyebrow style={{ marginBottom: 6 }}>By category</Eyebrow>{insights ? <HBars rows={insights.byCategory.map((c, i) => ({ label: CATEGORY[Number(c.key)] ?? c.label, value: c.count, colour: T.series[i % T.series.length] }))} /> : null}</div>
        </Panel>
        <Panel title="Response ladder" note="median vs previous 30 days">
          {insights ? <Ladder steps={[
            { label: 'Acknowledged', median: insights.ladder.toAcknowledge.medianMinutes, before: insights.ladderBefore.toAcknowledge.medianMinutes, p90: insights.ladder.toAcknowledge.p90Minutes, count: insights.ladder.toAcknowledge.count },
            { label: 'Somebody sent', median: insights.ladder.toAssign.medianMinutes, before: insights.ladderBefore.toAssign.medianMinutes, p90: insights.ladder.toAssign.p90Minutes, count: insights.ladder.toAssign.count },
            { label: 'On the way', median: insights.ladder.toEnRoute.medianMinutes, before: insights.ladderBefore.toEnRoute.medianMinutes, p90: insights.ladder.toEnRoute.p90Minutes, count: insights.ladder.toEnRoute.count },
            { label: 'On scene', median: insights.ladder.toScene.medianMinutes, before: insights.ladderBefore.toScene.medianMinutes, p90: insights.ladder.toScene.p90Minutes, count: insights.ladder.toScene.count },
            { label: 'Resolved', median: insights.ladder.toResolve.medianMinutes, before: insights.ladderBefore.toResolve.medianMinutes, p90: insights.ladder.toResolve.p90Minutes, count: insights.ladder.toResolve.count },
          ]} /> : <Empty>Loading…</Empty>}
        </Panel>
      </div>

      <div className="cc-grid-3" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
        <Panel title="Districts" note="open now · 30-day total">
          {insights ? <HBars rows={[...insights.byDistrict].sort((a, b) => b.reported - a.reported).slice(0, 10).map(d => ({ label: <>{d.name}{d.openNow > 0 ? <span className="cc-num" style={{ color: d.worstOpenSeverity === 1 ? T.bad : T.warn, marginLeft: 6 }}>{d.openNow} open</span> : null}</>, value: d.reported, note: `to acknowledge ${minutesWord(d.toAcknowledge.medianMinutes)} · to scene ${minutesWord(d.toScene.medianMinutes)}` }))} /> : <Empty>Loading…</Empty>}
        </Panel>
        <Panel title="On the roster today" note={roster ? `${now.length} on now` : undefined} flush>
          {!roster ? <Empty>Loading…</Empty> : roster.shifts.length === 0 ? <Empty>Nobody rostered today. <Link to="/roster">Open the roster</Link>.</Empty> : (
            <div>
              {[...now, ...next].map(s => (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 10, alignItems: 'center', padding: '7px 12px', borderBottom: `1px solid ${T.line}`, fontSize: 12 }}>
                  <span className="cc-num" style={{ color: s.when === 'now' ? T.accent : T.subtle }}>{fmtTime(s.startsAt)}–{fmtTime(s.endsAt)}</span>
                  <span style={{ minWidth: 0 }}><b>{s.responderName}</b> <span style={{ color: T.muted }}>· {RESPONDER_ROLE[s.responderRole]?.toLowerCase()}{s.facilityName ? ` · ${s.facilityName}` : ''}{s.label ? ` · ${s.label}` : ''}</span></span>
                  <Pill tone={s.when === 'now' ? (s.responderStatus === 1 || s.responderStatus === 8 ? 'warn' : 'good') : s.confirmed ? 'neutral' : 'warn'}>{s.when === 'now' ? RESPONDER_STATUS[s.responderStatus] : s.confirmed ? 'confirmed' : 'unconfirmed'}</Pill>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Fleet now" note={live ? `${live.fleet.length} ${live.fleet.length === 1 ? 'institution' : 'institutions'}` : undefined} flush>
          {!live ? <Empty>Loading…</Empty> : live.fleet.length === 0 ? <Empty>No fleet on the roll yet. <Link to="/fleet">Add responders</Link>.</Empty> : (
            <div>
              {live.fleet.map(f => (
                <div key={f.institutionName} style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4, 56px)', gap: 6, alignItems: 'center', padding: '7px 12px', borderBottom: `1px solid ${T.line}`, fontSize: 12 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.institutionName}</span>
                  <Stat n={f.respondersOnDuty} label="on duty" tone={T.good} /><Stat n={f.respondersFree} label="free" /><Stat n={f.vehiclesFree} label="veh free" /><Stat n={f.vehiclesOut} label="veh out" tone={T.warn} />
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return <span style={{ textAlign: 'right' }}><span className="cc-num" style={{ fontWeight: 600, color: n > 0 ? (tone ?? T.text) : T.subtle }}>{n}</span><div style={{ fontSize: 9.5, color: T.subtle, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div></span>;
}

export function Delta({ now, before, invert }: { now: number; before: number; invert?: boolean }) {
  if (before === 0) return <span style={{ color: T.subtle }}>no previous period</span>;
  const change = Math.round(((now - before) / before) * 100);
  const good = invert ? change <= 0 : change >= 0;
  return <span className="cc-num" style={{ color: change === 0 ? T.subtle : good ? T.muted : T.warn }}>{change > 0 ? '+' : ''}{change}% vs previous 30 days</span>;
}

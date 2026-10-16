/**
 * One incident, worked.
 *
 * The same panel serves the queue's drawer and the full page. Every desk action lives
 * here — acknowledge, send somebody, change severity, note, route elsewhere, escalate,
 * duplicate, close, correct the location — and each one asks its question in a small
 * dialog and writes a timeline row with a name on it. What this desk may do is decided by
 * the service and read from `canAct`; the panel draws the buttons it is allowed.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ASSIGNMENT_STATUS, CATEGORY, EVIDENCE_KIND, INCIDENT_STATUS, LIVE_ASSIGNMENT, OUTCOME, RESPONDER_ROLE, RESPONDER_STATUS, RESPONDING_STATUSES, SEVERITY, SOURCE, VEHICLE_KIND, VEHICLE_STATUS, VERIFICATION,
  commandApi, errorWords, isOpen, type AssignmentRow, type DeskIncident, type DeskResources, type EvidenceRow, type RouteOption, type RoutePlan,
} from '../api';
import { T, severityTone } from '../theme';
import { Actions, Btn, Check, Eyebrow, Field, Input, Modal, Pill, Select, SeverityMark, Textarea, Toasts, age, fmtDateTime, useToasts } from '../ui';
import { useCommand } from '../useCommand';
import { IncidentMap } from '../IncidentMap';
import { AgenciesPanel, AgencyButtons, RoleBanner, useAgencyActions } from './Agencies';

type Dialog = 'severity' | 'note' | 'progress' | 'resolve' | 'escalate' | 'reroute' | 'duplicate' | 'close' | 'location' | 'assign' | null;

/** Loads, follows the room, and hands the panel its incident. */
export function useIncident(id: string | null) {
  const { tick, join, leave } = useCommand();
  const [inc, setInc] = useState<DeskIncident | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!id) { setInc(null); return; }
    commandApi.incident(id).then(next => { setInc(next); setError(null); }).catch(caught => setError(errorWords(caught, 'Could not open it.')));
  }, [id]);
  useEffect(() => { load(); }, [load, tick]);
  useEffect(() => { if (!id) return; join(id); return () => leave(id); }, [id, join, leave]);
  return { inc, setInc, error };
}

export function IncidentPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { inc, setInc, error } = useIncident(id);
  const { toasts, push } = useToasts();
  return (
    <div style={{ maxWidth: 1240, width: '100%', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Btn size="sm" tone="ghost" onClick={() => navigate(-1)}>‹ Back</Btn>
        <Link to="/queue" style={{ fontSize: 12, color: T.muted, textDecoration: 'none' }}>Queue</Link>
      </div>
      {error ? <div style={{ color: T.bad }}>{error}</div> : !inc ? <div style={{ color: T.subtle }}>Opening…</div> : <IncidentPanel inc={inc} onChanged={setInc} push={push} wide />}
      <Toasts toasts={toasts} />
    </div>
  );
}

export function IncidentPanel({ inc, onChanged, push, wide }: { inc: DeskIncident; onChanged: (next: DeskIncident) => void; push: (m: string, tone?: 'ok' | 'error') => void; wide?: boolean }) {
  const { districtName } = useCommand();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [standDown, setStandDown] = useState<AssignmentRow | null>(null);
  const [busy, setBusy] = useState(false);
  const id = inc.card.id;
  const { card } = inc;
  const open = isOpen(card.status);
  const responding = RESPONDING_STATUSES.includes(card.status);
  const assignments = inc.assignments ?? [];
  const going = assignments.filter(a => LIVE_ASSIGNMENT.includes(a.status));
  const navigate = useNavigate();
  const agency = useAgencyActions(inc, onChanged, push, () => navigate('/queue'));
  // Only the lead agency moves the case; an agency brought in writes on it and sends its own people.
  const lead = !!inc.canHandOver || inc.myRole === 'national';

  const run = (work: Promise<DeskIncident>, message: string) => {
    setBusy(true);
    work.then(next => { onChanged(next); push(message); setDialog(null); setStandDown(null); })
      .catch(caught => push(errorWords(caught, 'That did not work.'), 'error'))
      .finally(() => setBusy(false));
  };
  const statusTone = card.status === 1 ? 'warn' : card.status === 4 ? 'bad' : responding ? 'good' : !open ? 'neutral' : 'info';

  return (
    <div className="cc-in">
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', paddingLeft: 12, borderLeft: `4px solid ${severityTone(card.severity)}`, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="cc-num" style={{ fontSize: wide ? 20 : 16, fontWeight: 600 }}>{card.number}</span>
            <span style={{ fontSize: wide ? 18 : 15, fontWeight: 600 }}>{card.situationWords}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 5 }}>
            <Pill tone={card.severity === 1 ? 'bad' : card.severity === 2 ? 'warn' : card.severity === 3 ? 'info' : 'neutral'} dot>{SEVERITY[card.severity]}</Pill>
            <Pill tone={statusTone}>{INCIDENT_STATUS[card.status]}</Pill>
            {card.escalationLevel > 0 ? <Pill tone="bad">Escalated L{card.escalationLevel}</Pill> : null}
            {card.isSensitive ? <Pill>Private</Pill> : null}
            {card.isTraining ? <Pill>Training</Pill> : null}
            <span style={{ fontSize: 11.5, color: T.muted }}>{CATEGORY[card.category]} · {fmtDateTime(card.reportedAt)} · <b className="cc-num">{age(card.ageMinutes)}</b> ago · via {SOURCE[inc.source]}</span>
          </div>
        </div>
      </div>

      <RoleBanner inc={inc} busy={agency.busy} onAccept={() => agency.answer(true)} onDecline={() => agency.answer(false)} />

      {inc.canAct && open ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {lead && (card.unowned || card.status === 1 || card.status === 4) ? <Btn size="sm" tone="primary" disabled={busy} onClick={() => run(commandApi.acknowledge(id), 'Acknowledged.')}>Acknowledge</Btn> : null}
          {card.status !== 5 ? <Btn size="sm" tone="accent" disabled={busy} onClick={() => setDialog('assign')}>Send somebody</Btn> : null}
          {lead && card.status !== 3 && card.status !== 5 && !responding ? <Btn size="sm" disabled={busy} onClick={() => setDialog('progress')}>Being handled</Btn> : null}
          {lead && card.status !== 5 ? <Btn size="sm" disabled={busy} onClick={() => setDialog('resolve')}>Resolved</Btn> : null}
          <Btn size="sm" disabled={busy} onClick={() => setDialog('severity')}>Severity</Btn>
          <Btn size="sm" disabled={busy} onClick={() => setDialog('note')}>Note</Btn>
          <Btn size="sm" disabled={busy} onClick={() => setDialog('location')}>Location</Btn>
          {lead ? <Btn size="sm" disabled={busy} onClick={() => setDialog('reroute')}>Route elsewhere</Btn> : null}
          <Btn size="sm" disabled={busy} onClick={() => setDialog('escalate')}>Escalate</Btn>
          <AgencyButtons inc={inc} busy={agency.busy} onOpen={which => (which === 'bring' ? agency.openBring() : agency.openHand())} />
          {lead && inc.possibleDuplicates.length > 0 ? <Btn size="sm" disabled={busy} onClick={() => setDialog('duplicate')}>Duplicate</Btn> : null}
          {lead ? <Btn size="sm" tone="danger" disabled={busy} onClick={() => setDialog('close')}>Close</Btn> : null}
        </div>
      ) : !inc.canAct && open && !inc.pendingReferralId ? <div style={{ fontSize: 12, color: T.muted, marginBottom: 12, padding: '6px 10px', background: T.surface2, borderRadius: 7 }}>{inc.myRole === 'following' ? 'You handed this on — you can read it; the desk that took it acts on it.' : 'On another desk — you can read it; they act on it.'}</div> : null}

      {inc.latitude !== null && inc.longitude !== null ? <WhereMap inc={inc} wide={!!wide} push={push} /> : null}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: wide ? 'minmax(300px, 1fr) minmax(320px, 1.1fr)' : '1fr' }} className={wide ? 'cc-grid-2' : undefined}>
        <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <Facts title="Where">
            {inc.following ? <Fact label="Live" value={<span style={{ color: T.good, fontWeight: 600 }}>The reporter's phone is sending its position — moved {inc.followLastAt ? sinceWords(inc.followLastAt) : 'just now'}{inc.followMoves ? ` · ${inc.followMoves} points` : ''}</span>} /> : inc.followSince ? <Fact label="Live" value={<span style={{ color: T.muted }}>Stopped sharing — last position {inc.followLastAt ? sinceWords(inc.followLastAt) : ''}</span>} /> : null}
            <Fact label="District" value={districtName(card.districtSlug)} />
            {card.isSensitive && inc.latitude === null ? <Fact label="Location" value="Shown only to the responsible desk" /> : null}
            <Fact label="Community" value={inc.latitude === null && card.isSensitive ? '—' : (card.community ?? '—')} />
            <Fact label="Landmark" value={inc.latitude === null && card.isSensitive ? '—' : (card.landmark ?? '—')} />
            {inc.latitude !== null && inc.longitude !== null ? (
              <Fact label="Pin" value={<><span className="cc-num">{inc.latitude.toFixed(5)}, {inc.longitude.toFixed(5)}</span>{inc.accuracyMetres ? <span style={{ color: T.muted }}> ±{Math.round(inc.accuracyMetres)} m</span> : null} <a href={`https://www.google.com/maps?q=${inc.latitude},${inc.longitude}`} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>Open map</a></>} />
            ) : card.hasPin ? null : <Fact label="Pin" value={<span style={{ color: T.warn }}>None — ask the reporter for a landmark</span>} />}
            {inc.distanceFromFacilityKm != null && card.facilityName ? <Fact label="From station" value={<span className="cc-num">{inc.distanceFromFacilityKm} km</span>} /> : null}
            {inc.locationNote ? <Fact label="Note" value={inc.locationNote} /> : null}
          </Facts>
          <Facts title="Who reported">
            {inc.anonymous ? <Fact label="Name" value={<b>Anonymous — the reporter gave no name or number</b>} /> : (<>
              <Fact label="Name" value={inc.reporterName ?? (inc.reporterHasAccount ? 'Account holder' : 'Not given')} />
              <Fact label="Ring back" value={inc.callbackPhone ? <a href={`tel:${inc.callbackPhone.replace(/\s+/g, '')}`} className="cc-num" style={{ fontWeight: 600 }}>{inc.callbackPhone}</a> : 'Not given'} />
            </>)}
            <Fact label="People" value={card.peopleAffected ? `${card.peopleAffected}${inc.childrenInvolved ? ', children involved' : ''}` : (inc.childrenInvolved ? 'Children involved' : '—')} />
            {inc.description ? <Fact label="Said" value={inc.description} /> : null}
          </Facts>
          <Facts title="Who answers">
            <Fact label="Station" value={card.facilityName ?? <span style={{ color: T.warn, fontWeight: 600 }}>Nobody in the directory answers for this area — route it</span>} />
            {card.institutionName ? <Fact label="Institution" value={card.institutionName} /> : null}
            {inc.unitName ? <Fact label="Unit" value={inc.unitName} /> : null}
            {inc.routedBecause ? <Fact label="Why" value={inc.routedBecause} /> : null}
            {inc.requestedFacility ? <Fact label="Asked for" value={inc.requestedFacility} /> : null}
            <Fact label="Owner" value={card.unowned ? <span style={{ color: T.warn, fontWeight: 600 }}>Nobody yet</span> : card.dispatcherName} />
            {inc.alsoSectorCode ? <Fact label="Usually also" value={inc.alsoSectorCode} /> : null}
            {inc.outcome ? <Fact label="Outcome" value={`${OUTCOME[inc.outcome]}${inc.outcomeNote ? ` — ${inc.outcomeNote}` : ''}`} /> : null}
            {inc.masterIncidentNumber ? <Fact label="Folded into" value={inc.masterIncidentNumber} /> : null}
          </Facts>
          <AgenciesPanel rows={inc.agencies ?? []} busy={agency.busy} onWithdraw={agency.withdraw} onAccept={row => agency.answer(true, row)} onDecline={row => agency.answer(false, row)} />
          {inc.evidence && inc.evidence.length > 0 ? <Facts title={`Attached · ${inc.evidence.length}`}>{inc.evidence.map(row => <EvidenceLine key={row.id} incidentId={id} row={row} />)}</Facts> : null}
          {assignments.length > 0 ? (
            <Facts title={going.length > 0 ? `Who is going · ${going.length}` : 'Who was sent'}>
              {assignments.map(a => <AssignmentLine key={a.id} a={a} canAct={inc.canAct && open} busy={busy} onRecord={status => run(commandApi.assignmentStatus(id, a.id, status), 'Recorded.')} onStandDown={() => setStandDown(a)} />)}
            </Facts>
          ) : null}
          {inc.escalationLadder.length > 0 ? (
            <Facts title="Who to ring, in order">
              {inc.escalationLadder.map(c => (
                <div key={`${c.level}-${c.phone}`} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, padding: '4px 0' }}>
                  <span className="cc-num" style={{ width: 22, color: T.subtle }}>L{c.level}</span>
                  <span style={{ flex: 1, minWidth: 0 }}><b>{c.name}</b>{c.position ? <span style={{ color: T.muted }}> · {c.position}</span> : null}</span>
                  <a href={`tel:${c.phone.replace(/\s+/g, '')}`} className="cc-num" style={{ fontWeight: 600 }}>{c.phone}</a>
                  <Pill tone={c.verification === 1 ? 'good' : c.verification === 0 ? 'neutral' : 'warn'}>{VERIFICATION[c.verification]}</Pill>
                </div>
              ))}
            </Facts>
          ) : null}
          {inc.possibleDuplicates.length > 0 ? (
            <Facts title="Possibly the same thing">
              {inc.possibleDuplicates.map(d => <div key={d.id} style={{ fontSize: 12, padding: '3px 0' }}><Link to={`/incidents/${d.id}`} className="cc-num" style={{ fontWeight: 600 }}>{d.number}</Link> · {d.situationWords} · {age(d.ageMinutes)} ago · {INCIDENT_STATUS[d.status]}</div>)}
            </Facts>
          ) : null}
        </div>
        <div>
          <Eyebrow style={{ marginBottom: 6 }}>Timeline · {inc.timeline.length}</Eyebrow>
          <div>
            {inc.timeline.map((row, index) => (
              <div key={index} style={{ display: 'flex', gap: 10, padding: '6px 0', borderTop: index === 0 ? 'none' : `1px solid ${T.line}` }}>
                <span className="cc-num" style={{ width: 92, flexShrink: 0, fontSize: 11, color: T.subtle }}>{fmtDateTime(row.at)}</span>
                <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>{row.message}{row.actorName ? <span style={{ color: T.subtle }}> — {row.actorName}</span> : null}{row.internal ? <span style={{ color: T.subtle, fontSize: 10.5 }}> · desk only</span> : null}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {agency.dialogs}
      {dialog === 'severity' ? <ChoiceDialog title="Change severity" options={Object.entries(SEVERITY).map(([v, l]) => [Number(v), l] as [number, string])} current={card.severity} reasonLabel="Why" verb="Change" onClose={() => setDialog(null)} onSave={(v, reason) => run(commandApi.severity(id, v, reason), 'Severity changed.')} /> : null}
      {dialog === 'note' ? <NoteDialog id={id} onClose={() => setDialog(null)} run={run} /> : null}
      {dialog === 'progress' ? <ReasonDialog title="Being handled" hint="What is happening — a unit told, a vehicle sent, a call made. The reporter reads this." verb="Mark being handled" required={false} onClose={() => setDialog(null)} onSave={note => run(commandApi.status(id, 3, note), 'Being handled.')} /> : null}
      {dialog === 'resolve' ? <ReasonDialog title="Resolved" hint="The danger is over. The reporter reads this." verb="Mark resolved" required={false} onClose={() => setDialog(null)} onSave={note => run(commandApi.status(id, 5, note), 'Resolved.')} /> : null}
      {dialog === 'escalate' ? <ReasonDialog title={`Escalate to level ${card.escalationLevel + 1}`} hint="The supervisors of the responsible institution are told. Ring the ladder as well — a push is a nudge, not a phone call." verb="Escalate" required onClose={() => setDialog(null)} onSave={reason => run(commandApi.escalate(id, reason), 'Escalated.')} /> : null}
      {dialog === 'reroute' ? <RerouteDialog options={inc.routeOptions} onClose={() => setDialog(null)} onSave={(f, reason) => run(commandApi.reroute(id, f, reason), 'Routed.')} /> : null}
      {dialog === 'duplicate' ? <ChoiceDialog title="Mark as a duplicate of" options={inc.possibleDuplicates.map(d => [d.id, `${d.number} · ${d.situationWords}`] as [string, string])} current={inc.possibleDuplicates[0]?.id ?? ''} reasonLabel="Note" verb="Fold in" required={false} onClose={() => setDialog(null)} onSave={(master, note) => run(commandApi.duplicate(id, master, note), 'Folded in.')} /> : null}
      {dialog === 'close' ? <ChoiceDialog title="Close" options={Object.entries(OUTCOME).filter(([v]) => v !== '8').map(([v, l]) => [Number(v), l] as [number, string])} current={1} reasonLabel="Note" verb="Close" required={false} danger hint="Mistaken, unable to verify and malicious need a note — nobody is marked a false reporter without a reason on the record." onClose={() => setDialog(null)} onSave={(v, note) => run(commandApi.close(id, v, note), 'Closed.')} /> : null}
      {dialog === 'location' ? <LocationDialog id={id} onClose={() => setDialog(null)} run={run} /> : null}
      {dialog === 'assign' ? <AssignDialog id={id} onClose={() => setDialog(null)} run={run} /> : null}
      {standDown ? <ReasonDialog title={`Stand down ${standDown.responderName ?? standDown.vehicleCallSign ?? standDown.facilityName ?? 'them'}`} hint="They are told, with this reason. The row stays on the record." verb="Stand down" required onClose={() => setStandDown(null)} onSave={reason => run(commandApi.standDown(id, standDown.id, reason), 'Stood down.')} /> : null}
    </div>
  );
}

function Facts({ title, children }: { title: string; children: ReactNode }) {
  return <div style={{ border: `1px solid ${T.line}`, borderRadius: 9, padding: '8px 12px', background: T.surface2 }}><Eyebrow style={{ marginBottom: 5 }}>{title}</Eyebrow>{children}</div>;
}
function Fact({ label, value }: { label: string; value: ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, fontSize: 12.5, padding: '2.5px 0' }}><span style={{ width: 80, flexShrink: 0, color: T.subtle }}>{label}</span><span style={{ minWidth: 0, wordBreak: 'break-word' }}>{value}</span></div>;
}

/** "12 s ago", "3 min ago", "2 h ago" — from an ISO moment to now. */
function sinceWords(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 360) / 10} h ago`;
}

type Origin = { key: string; label: string; ask: () => Promise<{ fromFacilityId?: string | null; fromAssignmentId?: string | null; fromLatitude?: number | null; fromLongitude?: number | null }> };

/**
 * The map and the way there. The desk picks where to start — the responsible station, a
 * responder who is going, or where the desk itself is — and the route is drawn with its
 * distance and time. While the reporter shares live, the pin moves and the route is asked
 * again once they have gone fifty metres from where it pointed.
 */
function WhereMap({ inc, wide, push }: { inc: DeskIncident; wide: boolean; push: (m: string, tone?: 'ok' | 'error') => void }) {
  const [route, setRoute] = useState<RoutePlan | null>(null);
  const [asking, setAsking] = useState(false);
  const [follow, setFollow] = useState(true);
  const [tick, setTick] = useState(0);
  const lastAsk = useRef<Origin | null>(null);
  useEffect(() => { const h = window.setInterval(() => setTick(x => x + 1), 5000); return () => window.clearInterval(h); }, []);
  void tick;

  const going = (inc.assignments ?? []).filter(a => a.latitude !== null && a.longitude !== null && LIVE_ASSIGNMENT.includes(a.status));
  const origins: Origin[] = [
    ...(inc.facilityLatitude != null ? [{ key: 'station', label: `From ${inc.card.facilityName ?? 'the station'}`, ask: async () => ({ fromFacilityId: inc.facilityId }) }] : []),
    ...going.map(a => ({ key: `a:${a.id}`, label: `From ${a.responderName ?? a.vehicleCallSign ?? 'the responder'} (${a.distanceKm !== null ? `${a.distanceKm} km away` : 'position known'})`, ask: async () => ({ fromAssignmentId: a.id }) })),
    { key: 'me', label: 'From where I am', ask: () => new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) { reject(new Error('This computer cannot say where it is. Start from the station instead.')); return; }
      navigator.geolocation.getCurrentPosition(p => resolve({ fromLatitude: p.coords.latitude, fromLongitude: p.coords.longitude }), () => reject(new Error('Your position was not given. Allow location for this site, or start from the station.')), { timeout: 10000, maximumAge: 60000 });
    }) },
  ];
  const [originKey, setOriginKey] = useState(origins[0]?.key ?? 'me');
  const origin = origins.find(o => o.key === originKey) ?? origins[0];

  const ask = useCallback(async (o: Origin, quiet = false) => {
    setAsking(true);
    try {
      const from = await o.ask();
      const plan = await commandApi.route({ id: inc.card.id, ...from });
      setRoute(plan); lastAsk.current = o;
      if (!quiet) push(plan.straight ? `${plan.distanceKm} km as the crow flies — no road data reached.` : `${plan.distanceKm} km by road, about ${plan.durationMinutes} min.`);
    } catch (caught) {
      if (!quiet) push(errorWords(caught, 'The way could not be worked out.'), 'error');
    } finally { setAsking(false); }
  }, [inc.card.id, push]);

  // The destination moved: ask again, quietly, once it is clearly somewhere else.
  useEffect(() => {
    if (!route || !lastAsk.current || inc.latitude === null || inc.longitude === null) return;
    const movedKm = Math.hypot((inc.latitude - route.toLatitude) * 111, (inc.longitude - route.toLongitude) * 111 * Math.cos(inc.latitude * Math.PI / 180));
    if (movedKm > 0.05 && !asking) void ask(lastAsk.current, true);
  }, [inc.latitude, inc.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = !!inc.following;
  return (
    <div style={{ marginBottom: 12, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {live ? <Pill tone="good" dot>Live — moved {inc.followLastAt ? sinceWords(inc.followLastAt) : 'just now'}</Pill> : inc.followSince ? <Pill>Reporter stopped sharing</Pill> : <Pill>Pin from the report</Pill>}
        {inc.speedMps != null && live && inc.speedMps > 0.5 ? <span style={{ fontSize: 11.5, color: T.muted }}>{Math.round(inc.speedMps * 3.6)} km/h{inc.headingDegrees != null ? ` · heading ${compass(inc.headingDegrees)}` : ''}</span> : null}
        <span style={{ flex: 1 }} />
        <span style={{ maxWidth: 300, minWidth: 180 }}><Select value={originKey} onChange={setOriginKey}>{origins.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</Select></span>
        <Btn size="sm" tone="accent" disabled={asking || !origin} onClick={() => origin && void ask(origin)}>{asking ? 'Working it out…' : route ? 'Ask again' : 'See directions'}</Btn>
        {route ? <Btn size="sm" tone="ghost" onClick={() => { setRoute(null); lastAsk.current = null; }}>Clear</Btn> : null}
        {live ? <Btn size="sm" tone={follow ? 'primary' : 'ghost'} onClick={() => setFollow(f => !f)}>{follow ? 'Following the pin' : 'Follow the pin'}</Btn> : null}
      </div>
      {route ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5, padding: '7px 10px', borderRadius: 8, background: T.surface2, border: `1px solid ${T.line}` }}>
          <b className="cc-num" style={{ fontSize: 15 }}>{route.distanceKm} km</b>
          <span className="cc-num">about {route.durationMinutes} min</span>
          <span style={{ color: T.muted }}>{route.fromLabel} → {inc.card.number}{route.straight ? ' · as the crow flies — the routing host did not answer, so the time is a guess' : ' · by road'}{route.following ? ' · the reporter is moving, this refreshes as they go' : ''}</span>
          <span style={{ flex: 1 }} />
          <a href={route.navigationUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Open in Google Maps ›</a>
        </div>
      ) : null}
      <IncidentMap inc={inc} route={route} height={wide ? 380 : 240} follow={follow && live} onUserMoved={() => setFollow(false)} />
    </div>
  );
}

function compass(deg: number): string {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return names[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

function AssignmentLine({ a, canAct, busy, onRecord, onStandDown }: { a: AssignmentRow; canAct: boolean; busy: boolean; onRecord: (status: number) => void; onStandDown: () => void }) {
  const live = LIVE_ASSIGNMENT.includes(a.status);
  const who = [a.responderName ? `${a.responderName}${a.responderRole ? ` (${RESPONDER_ROLE[a.responderRole]?.toLowerCase()})` : ''}` : null, a.vehicleCallSign ? `${VEHICLE_KIND[a.vehicleKind ?? 8]} ${a.vehicleCallSign}` : null].filter(Boolean).join(' with ') || a.unitName || a.facilityName || a.institutionName;
  const last = a.transportingAt ?? a.onSceneAt ?? a.enRouteAt ?? a.acceptedAt ?? a.assignedAt;
  const tone = a.status === 4 || a.status === 5 ? 'good' : a.status === 3 ? 'info' : a.status === 7 ? 'bad' : live ? 'warn' : 'neutral';
  return (
    <div style={{ padding: '6px 0', borderTop: `1px solid ${T.line}`, fontSize: 12 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <b>{who}</b>{a.isLead && live ? <Pill tone="accent">Lead</Pill> : null}<Pill tone={tone}>{ASSIGNMENT_STATUS[a.status]}</Pill>
        <span className="cc-num" style={{ color: T.subtle }}>{fmtDateTime(last)}</span>
      </div>
      <div style={{ color: T.muted, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {a.responderPhone ? <a href={`tel:${a.responderPhone.replace(/\s+/g, '')}`} className="cc-num" style={{ fontWeight: 600 }}>{a.responderPhone}</a> : null}
        {a.latitude !== null && a.longitude !== null ? <span>{a.distanceKm !== null ? `${a.distanceKm} km away` : 'Position known'} · seen {a.locationAgeMinutes === 0 ? 'just now' : `${a.locationAgeMinutes} min ago`}</span> : live && a.responderId ? <span style={{ color: T.subtle }}>No position shared</span> : null}
        {a.instructions ? <span>· “{a.instructions}”</span> : null}{a.endNote ? <span>· {a.endNote}</span> : null}
      </div>
      {canAct && live ? (
        <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
          {a.status < 3 ? <Btn size="xs" disabled={busy} onClick={() => onRecord(3)}>On the way</Btn> : null}
          {a.status < 4 ? <Btn size="xs" disabled={busy} onClick={() => onRecord(4)}>On scene</Btn> : null}
          {a.status === 4 ? <Btn size="xs" disabled={busy} onClick={() => onRecord(5)}>Transporting</Btn> : null}
          <Btn size="xs" disabled={busy} onClick={() => onRecord(6)}>Finished</Btn>
          <Btn size="xs" tone="danger" disabled={busy} onClick={onStandDown}>Stand down</Btn>
        </div>
      ) : null}
    </div>
  );
}

function AssignDialog({ id, onClose, run }: { id: string; onClose: () => void; run: (work: Promise<DeskIncident>, message: string) => void }) {
  const [resources, setResources] = useState<DeskResources | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responderId, setResponderId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [instructions, setInstructions] = useState('');
  useEffect(() => { commandApi.resources(id).then(r => { setResources(r); setError(null); }).catch(caught => setError(errorWords(caught, 'Could not load who is available.'))); }, [id]);
  const pick = (selected: boolean) => ({ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${selected ? T.accent : T.line2}`, background: selected ? T.accentSoft : T.surface2 } as const);
  const nothing = !responderId && !vehicleId && !facilityId;
  return (
    <Modal title="Send somebody" onClose={onClose} width={640}>
      {error ? <p style={{ color: T.bad, fontSize: 12.5 }}>{error}</p> : null}
      {!resources && !error ? <p style={{ color: T.subtle, fontSize: 12.5 }}>Who is available…</p> : null}
      {resources ? (<>
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>Your own people, on duty now, free first{resources.requiredCapability ? <> — <b>can handle it</b> means they claim the skill this situation asks for</> : null}. A position is only shown while the responder shares it.</div>
        <Eyebrow style={{ margin: '10px 0 6px' }}>Responder</Eyebrow>
        {resources.responders.length === 0 ? <div style={{ fontSize: 12, color: T.subtle }}>Nobody on duty. Ring the station — the ladder is on the incident.</div> : null}
        <div style={{ display: 'grid', gap: 5 }}>
          {resources.responders.map(r => (
            <label key={r.id} style={pick(responderId === r.id)}>
              <input type="radio" checked={responderId === r.id} onChange={() => setResponderId(r.id)} onClick={() => { if (responderId === r.id) setResponderId(''); }} style={{ marginTop: 3, accentColor: T.accent }} />
              <span style={{ flex: 1 }}><b>{r.name}</b> <span style={{ color: T.muted }}>· {RESPONDER_ROLE[r.role]?.toLowerCase()}{r.facilityName ? ` · ${r.facilityName}` : ''}</span>
                <div style={{ fontSize: 11.5, color: T.muted, display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}><Pill tone={r.free ? 'good' : 'warn'}>{RESPONDER_STATUS[r.status]}</Pill>{r.hasCapability ? <Pill tone="info">Can handle it</Pill> : null}<span>{r.because}</span>{r.locationAgeMinutes !== null ? <span>· seen {r.locationAgeMinutes === 0 ? 'just now' : `${r.locationAgeMinutes} min ago`}</span> : null}{!r.withinRadius ? <span style={{ color: T.warn }}>· beyond their usual radius</span> : null}</div>
              </span>
            </label>
          ))}
        </div>
        <Eyebrow style={{ margin: '10px 0 6px' }}>Vehicle</Eyebrow>
        {resources.vehicles.length === 0 ? <div style={{ fontSize: 12, color: T.subtle }}>No vehicle on the fleet is in service.</div> : null}
        <div style={{ display: 'grid', gap: 5 }}>
          {resources.vehicles.map(v => (
            <label key={v.id} style={pick(vehicleId === v.id)}>
              <input type="radio" checked={vehicleId === v.id} onChange={() => setVehicleId(v.id)} onClick={() => { if (vehicleId === v.id) setVehicleId(''); }} style={{ marginTop: 3, accentColor: T.accent }} />
              <span style={{ flex: 1 }}><b>{VEHICLE_KIND[v.kind]} {v.callSign}</b> <span style={{ color: T.muted }}>{v.facilityName ? `· ${v.facilityName}` : ''}{v.capacity ? ` · carries ${v.capacity}` : ''}</span>
                <div style={{ fontSize: 11.5, color: T.muted, display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}><Pill tone={v.free ? 'good' : 'warn'}>{VEHICLE_STATUS[v.status]}</Pill>{v.inspectionDue ? <span style={{ color: T.warn, fontWeight: 600 }}>· inspection due</span> : null}</div>
              </span>
            </label>
          ))}
        </div>
        {resources.assistance.length > 0 ? (<>
          <Eyebrow style={{ margin: '10px 0 6px' }}>Or ask another service</Eyebrow>
          <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 6 }}>Their desk gains this incident and sends its own people. Pick this on its own.</div>
          <div style={{ display: 'grid', gap: 5 }}>
            {resources.assistance.map(o => (
              <label key={o.facilityId} style={pick(facilityId === o.facilityId)}>
                <input type="radio" checked={facilityId === o.facilityId} onChange={() => { setFacilityId(o.facilityId); setResponderId(''); setVehicleId(''); }} onClick={() => { if (facilityId === o.facilityId) setFacilityId(''); }} style={{ marginTop: 3, accentColor: T.accent }} />
                <span><b>{o.facilityName}</b> <span style={{ color: T.muted }}>· {o.institutionName}</span><div style={{ fontSize: 11.5, color: T.muted }}>{o.because}</div></span>
              </label>
            ))}
          </div>
        </>) : null}
        <div style={{ marginTop: 10 }}><Field label="Instructions" hint="What they need to know. The responder reads this; the reporter never does."><Textarea value={instructions} onChange={setInstructions} rows={2} /></Field></div>
      </>) : null}
      <Actions>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn tone="primary" disabled={nothing || !resources} onClick={() => run(commandApi.assign({ id, responderId: responderId || null, vehicleId: vehicleId || null, facilityId: facilityId || null, instructions: instructions.trim() || null }), 'Sent.')}>Send</Btn>
      </Actions>
    </Modal>
  );
}

function EvidenceLine({ incidentId, row }: { incidentId: string; row: EvidenceRow }) {
  const [file, setFile] = useState<{ url: string; contentType: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const open = async () => {
    setBusy(true); setFailed(null);
    try { const got = await commandApi.evidence(incidentId, row.id); setFile({ url: `data:${got.contentType};base64,${got.base64}`, contentType: got.contentType }); }
    catch (caught) { setFailed(errorWords(caught, 'It could not be opened.')); }
    finally { setBusy(false); }
  };
  const size = row.bytes >= 1_000_000 ? `${(row.bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(row.bytes / 1000))} KB`;
  return (
    <div style={{ display: 'grid', gap: 6, padding: '5px 0', borderTop: `1px solid ${T.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
        <b>{EVIDENCE_KIND[row.kind] ?? 'File'}{row.caption ? ` — ${row.caption}` : ''}</b>
        <span style={{ color: T.subtle }}>{size} · {fmtDateTime(row.addedAt)} · {row.openCount === 0 ? 'not opened yet' : `opened ${row.openCount}×`}</span>
        <span style={{ flex: 1 }} />
        {file ? <a href={file.url} download={row.fileName} style={{ fontWeight: 600, fontSize: 12 }}>Save</a> : <Btn size="xs" disabled={busy} onClick={() => void open()}>{busy ? 'Opening…' : 'Open'}</Btn>}
      </div>
      {failed ? <span style={{ color: T.bad, fontSize: 12 }}>{failed}</span> : null}
      {file ? (file.contentType.startsWith('image/') ? <img src={file.url} alt={row.caption ?? row.fileName} style={{ maxWidth: '100%', maxHeight: 480, borderRadius: 8, border: `1px solid ${T.line2}` }} />
        : file.contentType.startsWith('audio/') ? <audio controls src={file.url} style={{ width: '100%' }} />
        : file.contentType.startsWith('video/') ? <video controls src={file.url} style={{ maxWidth: '100%', maxHeight: 480, borderRadius: 8 }} />
        : <iframe title={row.fileName} src={file.url} style={{ width: '100%', height: 480, border: `1px solid ${T.line2}`, borderRadius: 8 }} />) : null}
    </div>
  );
}

function ReasonDialog({ title, hint, verb, required, onClose, onSave }: { title: string; hint: string; verb: string; required: boolean; onClose: () => void; onSave: (text: string) => void }) {
  const [text, setText] = useState('');
  return <Modal title={title} onClose={onClose}><Field label={required ? 'Why' : 'Note'} hint={hint}><Textarea value={text} onChange={setText} rows={3} /></Field><Actions><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={required && !text.trim()} onClick={() => onSave(text.trim())}>{verb}</Btn></Actions></Modal>;
}

function ChoiceDialog<V extends string | number>({ title, options, current, reasonLabel, verb, required = true, danger, hint, onClose, onSave }: { title: string; options: [V, string][]; current: V; reasonLabel: string; verb: string; required?: boolean; danger?: boolean; hint?: string; onClose: () => void; onSave: (value: V, reason: string) => void }) {
  const [value, setValue] = useState<V>(current);
  const [reason, setReason] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ display: 'grid', gap: 5, marginBottom: 12 }}>
        {options.map(([v, label]) => <label key={String(v)} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, padding: '6px 10px', borderRadius: 8, border: `1px solid ${value === v ? T.accent : T.line2}`, background: value === v ? T.accentSoft : T.surface2, cursor: 'pointer' }}><input type="radio" checked={value === v} onChange={() => setValue(v)} style={{ accentColor: T.accent }} />{typeof v === 'number' && title.includes('severity') ? <SeverityMark severity={v} size={8} /> : null} {label}</label>)}
      </div>
      <Field label={reasonLabel} hint={hint}><Textarea value={reason} onChange={setReason} rows={2} /></Field>
      <Actions><Btn onClick={onClose}>Cancel</Btn><Btn tone={danger ? 'danger' : 'primary'} disabled={required && !reason.trim()} onClick={() => onSave(value, reason.trim())}>{verb}</Btn></Actions>
    </Modal>
  );
}

function NoteDialog({ id, onClose, run }: { id: string; onClose: () => void; run: (work: Promise<DeskIncident>, message: string) => void }) {
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(true);
  return (
    <Modal title="Add a note" onClose={onClose}>
      <Field label="Note"><Textarea value={text} onChange={setText} rows={3} /></Field>
      <Check checked={internal} onChange={setInternal}>Desk only — the reporter does not see this</Check>
      {!internal ? <div style={{ fontSize: 12, color: T.warn, fontWeight: 600, marginBottom: 10 }}>The reporter reads this on their status card. Write it for them.</div> : null}
      <Actions><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={!text.trim()} onClick={() => run(commandApi.note(id, text.trim(), internal), 'Noted.')}>Add</Btn></Actions>
    </Modal>
  );
}

function RerouteDialog({ options, onClose, onSave }: { options: RouteOption[]; onClose: () => void; onSave: (facilityId: string, reason: string) => void }) {
  const [facility, setFacility] = useState(options[0]?.facilityId ?? '');
  const [reason, setReason] = useState('');
  return (
    <Modal title="Route elsewhere" onClose={onClose} width={560}>
      {options.length === 0 ? <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 12 }}>Nothing else in the directory answers for this area in this sector.</div> : null}
      <div style={{ display: 'grid', gap: 5, marginBottom: 12 }}>
        {options.map(o => <label key={o.facilityId} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, padding: '7px 10px', borderRadius: 8, border: `1px solid ${facility === o.facilityId ? T.accent : T.line2}`, background: facility === o.facilityId ? T.accentSoft : T.surface2, cursor: 'pointer' }}><input type="radio" checked={facility === o.facilityId} onChange={() => setFacility(o.facilityId)} style={{ marginTop: 3, accentColor: T.accent }} /><span><b>{o.facilityName}</b> <span style={{ color: T.muted }}>· {o.institutionName}</span><div style={{ fontSize: 11.5, color: T.muted }}>{o.because}{o.distanceKm !== null && !o.because.includes('km') ? ` · ${o.distanceKm} km` : ''}</div></span></label>)}
      </div>
      <Field label="Why"><Textarea value={reason} onChange={setReason} rows={2} /></Field>
      <Actions><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={!facility || !reason.trim()} onClick={() => onSave(facility, reason.trim())}>Route</Btn></Actions>
    </Modal>
  );
}

function LocationDialog({ id, onClose, run }: { id: string; onClose: () => void; run: (work: Promise<DeskIncident>, message: string) => void }) {
  const { shapes } = useCommand();
  const [f, setF] = useState({ lat: '', lng: '', districtSlug: '', community: '', landmark: '', note: '' });
  const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }));
  return (
    <Modal title="Correct the location" onClose={onClose} width={520}>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>After speaking to the reporter. Leave anything you do not know empty.</div>
      <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr' }}>
        <Field label="Latitude"><Input value={f.lat} onChange={v => set('lat', v)} mono /></Field>
        <Field label="Longitude"><Input value={f.lng} onChange={v => set('lng', v)} mono /></Field>
      </div>
      <Field label="District"><Select value={f.districtSlug} onChange={v => set('districtSlug', v)}><option value="">—</option>{shapes.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}</Select></Field>
      <Field label="Community"><Input value={f.community} onChange={v => set('community', v)} /></Field>
      <Field label="Landmark"><Input value={f.landmark} onChange={v => set('landmark', v)} /></Field>
      <Field label="Note"><Input value={f.note} onChange={v => set('note', v)} /></Field>
      <Actions><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" onClick={() => run(commandApi.location({ id, latitude: f.lat ? Number(f.lat) : null, longitude: f.lng ? Number(f.lng) : null, districtSlug: f.districtSlug || null, community: f.community || null, landmark: f.landmark || null, note: f.note || null }), 'Location corrected.')}>Save</Btn></Actions>
    </Modal>
  );
}

/**
 * The desk.
 *
 * <p>Five columns — New, Acknowledged, Being handled, Responding, Escalated — each a stack of
 * cards with a severity stripe down the left. Sorted by severity then age. An incident nobody owns says
 * "Nobody yet" in warning, because a queue with no owner is the failure this screen exists to
 * catch. The board listens on the emergency hub and refreshes the moment anything moves; it
 * also polls every fifteen seconds, because the socket is the speed-up and the poll is the
 * guarantee.</p>
 *
 * <p>Phase 3: "Send somebody" opens the desk's own responders and vehicles, ranked free
 * first, then "can handle it", then nearest by a fresh dot — and the other sector's stations
 * to ask for help. Everybody sent is listed under "Who is going" with what they said last
 * and when; a dot older than a few minutes says so, and is never drawn as current.</p>
 *
 * <p>The detail is two columns — the facts, and the timeline — and a row of verbs. Every verb
 * writes one timeline row and moves at most one status. Close asks for an outcome, and the
 * two outcomes that judge a person need a reason on the record.</p>
 *
 * <p>Red is spent on one thing here: the P1 stripe. Everything else is neutral, so that red
 * still means something at two in the morning.</p>
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  Actions, Button, Card, ErrorNote, Field, Input, Loading, Modal, PageHeader, Pill, Textarea, Toasts, fmtDateTime, useToasts,
} from '../components/ui';
import {
  ASSIGNMENT_STATUS, CATEGORY, EVIDENCE_KIND, INCIDENT_STATUS, OUTCOME, RESPONDER_ROLE, RESPONDER_STATUS, SEVERITY, SOURCE, VEHICLE_KIND, VEHICLE_STATUS, VERIFICATION, deskApi, dispatchApi,
  type AssignmentRow, type DeskAccess, type DeskIncident, type DeskResources, type DispatchQueue, type EvidenceRow, type QueueCard, type RouteOption,
} from '../api/emergency';
import { connectEmergencyLive, type LiveHandle } from '../api/emergencyLive';
import type { AdminIdentity } from '../api/admin';

const POLL_MS = 15_000;
const RESPONDING = [9, 10, 11];
const OVER = [5, 6, 7, 8];
const isOpen = (status: number) => !OVER.includes(status);
const LIVE = [1, 2, 3, 4, 5];

const err = (caught: unknown, fallback: string) => (caught instanceof Error ? caught.message : fallback);

function stripe(severity: number, t: { danger: string; warning: string; brand: string; textMuted: string; border: string }) {
  return severity === 1 ? t.danger : severity === 2 ? t.warning : severity === 3 ? t.brand : severity === 4 ? t.textMuted : t.border;
}

function age(minutes: number) {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ${minutes % 60} min` : `${Math.floor(hours / 24)} d`;
}

const DISTRICT_NAMES: Record<string, string> = {
  'western-area-urban': 'Western Area Urban', 'western-area-rural': 'Western Area Rural', bo: 'Bo', bombali: 'Bombali', bonthe: 'Bonthe',
  falaba: 'Falaba', kailahun: 'Kailahun', kambia: 'Kambia', karene: 'Karene', kenema: 'Kenema', koinadugu: 'Koinadugu', kono: 'Kono',
  moyamba: 'Moyamba', 'port-loko': 'Port Loko', pujehun: 'Pujehun', tonkolili: 'Tonkolili',
};
const district = (slug: string | null) => (slug ? DISTRICT_NAMES[slug] ?? slug : null);

export function EmergencyDesk({ identity }: { identity: AdminIdentity }) {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [access, setAccess] = useState<DeskAccess | null>(null);
  const [queue, setQueue] = useState<DispatchQueue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [includeTraining, setIncludeTraining] = useState(false);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [ticking, setTicking] = useState(false);
  const [live, setLive] = useState(false);
  const timer = useRef<number | null>(null);
  const hub = useRef<LiveHandle | null>(null);
  void identity;

  const load = useCallback(() => {
    setTicking(true);
    deskApi.queue({ includeTraining, includeClosed, take: 300 })
      .then(result => { setQueue(result); setError(null); })
      .catch((caught: unknown) => setError(err(caught, 'Could not load the desk.')))
      .finally(() => window.setTimeout(() => setTicking(false), 400));
  }, [includeTraining, includeClosed]);

  useEffect(() => {
    deskApi.access().then(setAccess).catch((caught: unknown) => setError(err(caught, 'Could not open the desk.')));
  }, []);

  useEffect(() => {
    load();
    timer.current = window.setInterval(load, POLL_MS);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [load]);

  // The hub: a nudge means "fetch again". Nothing on it is the data.
  useEffect(() => {
    if (!access?.isDispatcher) return;
    const handle = connectEmergencyLive({
      'emergency.queue.changed': () => load(),
      'emergency.incident.changed': () => load(),
    }, setLive);
    hub.current = handle;
    return () => { handle.close(); hub.current = null; };
  }, [access?.isDispatcher, load]);

  if (error) return <ErrorNote message={error} />;
  if (!access || !queue) return <Loading />;
  if (!access.isDispatcher) {
    return (
      <Card>
        <div style={{ fontSize: 14, fontWeight: 800, color: t.text }}>This account does not work a desk</div>
        <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 6, lineHeight: 1.6 }}>
          A dispatcher is bound to an institution under Emergency → Dispatchers. Somebody with the emergency permission sees every desk.
        </div>
      </Card>
    );
  }

  const columns: { status: number; title: string; cards: QueueCard[] }[] = [
    { status: 1, title: 'New', cards: queue.cards.filter(c => c.status === 1) },
    { status: 2, title: 'Acknowledged', cards: queue.cards.filter(c => c.status === 2) },
    { status: 3, title: 'Being handled', cards: queue.cards.filter(c => c.status === 3) },
    { status: 9, title: 'Responding', cards: queue.cards.filter(c => RESPONDING.includes(c.status)) },
    { status: 4, title: 'Escalated', cards: queue.cards.filter(c => c.status === 4) },
  ];
  const rest = queue.cards.filter(c => OVER.includes(c.status));

  return (
    <>
      <PageHeader
        title={queue.national ? 'Emergency desk — national' : `Emergency desk — ${queue.desk}`}
        subtitle={queue.cards.length === 0
          ? 'Nothing open.'
          : `${queue.cards.filter(c => isOpen(c.status)).length} open · ${queue.cards.filter(c => RESPONDING.includes(c.status)).length} responding · ${queue.p1Open} critical · ${queue.unowned} with nobody on ${queue.unowned === 1 ? 'it' : 'them'}`}
        action={(
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: t.textMuted, display: 'flex', gap: 5, alignItems: 'center' }}>
              <input type="checkbox" checked={includeClosed} onChange={e => setIncludeClosed(e.target.checked)} /> closed
            </label>
            <label style={{ fontSize: 12, color: t.textMuted, display: 'flex', gap: 5, alignItems: 'center' }}>
              <input type="checkbox" checked={includeTraining} onChange={e => setIncludeTraining(e.target.checked)} /> training
            </label>
            <span title={live ? 'Live — the board moves as things happen' : 'Polling every fifteen seconds'} style={{ fontSize: 11, fontWeight: 700, color: live ? t.success : t.textSubtle }}>{live ? 'Live' : 'Polling'}</span>
            <span title={`Refreshed ${fmtDateTime(queue.asOf)}`} style={{ width: 8, height: 8, borderRadius: 4, background: ticking ? t.brand : t.border, transition: 'background .3s' }} />
          </div>
        )}
      />

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', alignItems: 'start' }}>
        {columns.map(column => (
          <div key={column.status}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.5 }}>{column.title}</span>
              <span style={{ fontSize: 12, color: t.textSubtle, fontVariantNumeric: 'tabular-nums' }}>{column.cards.length}</span>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {column.cards.length === 0 ? <div style={{ fontSize: 12, color: t.textSubtle, padding: '10px 0' }}>—</div> : null}
              {column.cards.map(card => <IncidentCard key={card.id} card={card} onOpen={() => setOpenId(card.id)} />)}
            </div>
          </div>
        ))}
      </div>

      {rest.length > 0 ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Resolved and closed</div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
            {rest.map(card => <IncidentCard key={card.id} card={card} onOpen={() => setOpenId(card.id)} />)}
          </div>
        </div>
      ) : null}

      {openId ? <IncidentDetail id={openId} hub={hub.current} onClose={() => { setOpenId(null); load(); }} push={push} /> : null}
      <Toasts toasts={toasts} />
    </>
  );
}

function IncidentCard({ card, onOpen }: { card: QueueCard; onOpen: () => void }) {
  const { t } = useTheme();
  return (
    <button
      type="button"
      data-incident={card.number}
      onClick={onOpen}
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        background: t.surface, border: `1px solid ${t.border}`, borderLeft: `4px solid ${stripe(card.severity, t)}`,
        borderRadius: 12, padding: '10px 12px',
        outline: card.isTraining ? `2px dashed ${t.border}` : 'none', outlineOffset: -6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: t.text, fontVariantNumeric: 'tabular-nums' }}>{card.number}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted }}>{SEVERITY[card.severity]?.split(' ')[0]}</span>
        {card.isSensitive ? <Pill tone="neutral">Private</Pill> : null}
        {card.isTraining ? <Pill tone="neutral">Training</Pill> : null}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: t.textSubtle, fontVariantNumeric: 'tabular-nums' }}>{age(card.ageMinutes)}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginTop: 4, lineHeight: 1.35 }}>{card.situationWords}</div>
      <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 3 }}>
        {[district(card.districtSlug), card.community, card.landmark].filter(Boolean).join(' · ') || (card.hasPin ? 'Pinned' : 'No location')}
        {card.peopleAffected ? ` · ${card.peopleAffected} people` : ''}
      </div>
      <div style={{ fontSize: 11.5, marginTop: 5, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: t.textMuted }}>{card.facilityName ?? 'No station yet'}</span>
        <span style={{ color: card.unowned ? t.warning : t.textSubtle, fontWeight: card.unowned ? 800 : 600 }}>
          · {card.unowned ? 'Nobody yet' : card.dispatcherName}
        </span>
        {card.escalationLevel > 0 ? <span style={{ color: t.warning, fontWeight: 700 }}>· L{card.escalationLevel}</span> : null}
        {RESPONDING.includes(card.status) ? <span style={{ color: t.success, fontWeight: 700 }}>· {INCIDENT_STATUS[card.status]}</span> : null}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ detail */

function IncidentDetail({ id, hub, onClose, push }: { id: string; hub: LiveHandle | null; onClose: () => void; push: (m: string, tone?: 'ok' | 'error') => void }) {
  const { t } = useTheme();
  const [inc, setInc] = useState<DeskIncident | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'severity' | 'note' | 'reroute' | 'escalate' | 'duplicate' | 'close' | 'location' | 'progress' | 'resolve' | 'assign'>(null);
  const [standDown, setStandDown] = useState<AssignmentRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    deskApi.incident(id).then(inc => { setInc(inc); setError(null); }).catch((caught: unknown) => setError(err(caught, 'Could not open it.')));
  }, [id]);
  useEffect(() => { load(); const h = window.setInterval(load, 20_000); return () => window.clearInterval(h); }, [load]);
  useEffect(() => { hub?.join(id); return () => hub?.leave(id); }, [hub, id]);

  const run = (work: Promise<DeskIncident>, message: string) => {
    setBusy(true);
    work.then(next => { setInc(next); push(message); setDialog(null); })
      .catch((caught: unknown) => push(err(caught, 'That did not work.'), 'error'))
      .finally(() => setBusy(false));
  };

  if (error) return <Modal title="Incident" onClose={onClose}><ErrorNote message={error} /></Modal>;
  if (!inc) return <Modal title="Opening…" onClose={onClose} width={980}><Loading /></Modal>;
  const { card } = inc;
  const open = isOpen(card.status);
  const responding = RESPONDING.includes(card.status);
  const assignments = inc.assignments ?? [];
  const going = assignments.filter(a => LIVE.includes(a.status));

  return (
    <Modal title={`${card.number} — ${card.situationWords}`} onClose={onClose} width={980}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12, paddingLeft: 12, borderLeft: `4px solid ${stripe(card.severity, t)}` }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: t.text }}>{SEVERITY[card.severity]}</span>
        <Pill tone={card.status === 1 ? 'warning' : card.status === 4 ? 'danger' : responding ? 'success' : OVER.includes(card.status) ? 'neutral' : 'info'}>{INCIDENT_STATUS[card.status]}</Pill>
        <span style={{ fontSize: 12.5, color: t.textMuted }}>{CATEGORY[card.category]} · reported {fmtDateTime(card.reportedAt)} · {age(card.ageMinutes)} ago · via {SOURCE[inc.source]}</span>
        {card.isSensitive ? <Pill tone="neutral">Private — location shown to this desk only</Pill> : null}
        {card.isTraining ? <Pill tone="neutral">Training</Pill> : null}
      </div>

      {inc.canAct && open ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {card.unowned || card.status === 1 || card.status === 4 ? <Button size="sm" tone="primary" disabled={busy} onClick={() => run(deskApi.acknowledge(id), 'Acknowledged.')}>Acknowledge</Button> : null}
          {card.status !== 5 ? <Button size="sm" tone="primary" disabled={busy} onClick={() => setDialog('assign')}>Send somebody</Button> : null}
          {card.status !== 3 && card.status !== 5 && !responding ? <Button size="sm" tone="subtle" disabled={busy} onClick={() => setDialog('progress')}>Being handled</Button> : null}
          {card.status !== 5 ? <Button size="sm" tone="subtle" disabled={busy} onClick={() => setDialog('resolve')}>Resolved</Button> : null}
          <Button size="sm" tone="subtle" disabled={busy} onClick={() => setDialog('severity')}>Change severity</Button>
          <Button size="sm" tone="subtle" disabled={busy} onClick={() => setDialog('note')}>Add note</Button>
          <Button size="sm" tone="subtle" disabled={busy} onClick={() => setDialog('location')}>Correct location</Button>
          <Button size="sm" tone="subtle" disabled={busy} onClick={() => setDialog('reroute')}>Route elsewhere</Button>
          <Button size="sm" tone="subtle" disabled={busy} onClick={() => setDialog('escalate')}>Escalate</Button>
          {inc.possibleDuplicates.length > 0 ? <Button size="sm" tone="subtle" disabled={busy} onClick={() => setDialog('duplicate')}>Mark duplicate</Button> : null}
          <Button size="sm" tone="danger" disabled={busy} onClick={() => setDialog('close')}>Close</Button>
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 1.2fr)' }}>
        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <Facts title="Where">
            <Fact label="District" value={district(card.districtSlug) ?? '—'} />
            {card.isSensitive && inc.latitude === null ? <Fact label="Location" value="Shown only to the responsible desk" /> : null}
            <Fact label="Community" value={inc.latitude === null && card.isSensitive ? '—' : (card.community ?? '—')} />
            <Fact label="Landmark" value={inc.latitude === null && card.isSensitive ? '—' : (card.landmark ?? '—')} />
            {inc.latitude !== null && inc.longitude !== null ? (
              <Fact label="Pin" value={(
                <>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{inc.latitude.toFixed(5)}, {inc.longitude.toFixed(5)}</span>
                  {inc.accuracyMetres ? ` ±${Math.round(inc.accuracyMetres)} m` : ''}
                  {inc.locatedAt ? <span style={{ color: t.textSubtle }}> · {fmtDateTime(inc.locatedAt)}</span> : null}
                  {' '}<a href={`https://www.google.com/maps?q=${inc.latitude},${inc.longitude}`} target="_blank" rel="noreferrer" style={{ color: t.brand }}>Map</a>
                </>
              )} />
            ) : card.hasPin ? null : <Fact label="Pin" value="None — ask the reporter for a landmark" />}
            {inc.locationNote ? <Fact label="Note" value={inc.locationNote} /> : null}
          </Facts>

          <Facts title="Who reported">
            {inc.anonymous ? (
              <Fact label="Name" value={<span style={{ fontWeight: 700 }}>Anonymous — the reporter chose to give no name or number</span>} />
            ) : (
              <>
                <Fact label="Name" value={inc.reporterName ?? (inc.reporterHasAccount ? 'Account holder' : 'Not given')} />
                <Fact label="Ring back" value={inc.callbackPhone ? <a href={`tel:${inc.callbackPhone.replace(/\s+/g, '')}`} style={{ color: t.brand, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{inc.callbackPhone}</a> : 'Not given'} />
              </>
            )}
            <Fact label="People" value={card.peopleAffected ? `${card.peopleAffected}${inc.childrenInvolved ? ', children involved' : ''}` : (inc.childrenInvolved ? 'Children involved' : '—')} />
            {inc.description ? <Fact label="Description" value={inc.description} /> : null}
          </Facts>

          <Facts title="Who answers">
            <Fact label="Station" value={card.facilityName ?? <span style={{ color: t.warning, fontWeight: 700 }}>Nobody in the directory answers for this area — route it</span>} />
            {card.institutionName ? <Fact label="Institution" value={card.institutionName} /> : null}
            {inc.unitName ? <Fact label="Unit" value={inc.unitName} /> : null}
            {inc.routedBecause ? <Fact label="Why" value={inc.routedBecause} /> : null}
            {inc.requestedFacility ? <Fact label="Reporter asked for" value={inc.requestedFacility} /> : null}
            <Fact label="Owner" value={card.unowned ? <span style={{ color: t.warning, fontWeight: 700 }}>Nobody yet</span> : card.dispatcherName} />
            {inc.alsoSectorCode ? <Fact label="Usually also" value={inc.alsoSectorCode} /> : null}
            {inc.outcome ? <Fact label="Outcome" value={`${OUTCOME[inc.outcome]}${inc.outcomeNote ? ` — ${inc.outcomeNote}` : ''}`} /> : null}
            {inc.masterIncidentNumber ? <Fact label="Folded into" value={inc.masterIncidentNumber} /> : null}
          </Facts>

          {inc.evidence && inc.evidence.length > 0 ? (
            <Facts title={`What the reporter attached · ${inc.evidence.length}`}>
              {inc.evidence.map(row => <EvidenceLine key={row.id} incidentId={id} row={row} />)}
            </Facts>
          ) : null}

          {assignments.length > 0 ? (
            <Facts title={going.length > 0 ? `Who is going · ${going.length}` : 'Who was sent'}>
              {assignments.map(a => (
                <AssignmentLine key={a.id} a={a} canAct={inc.canAct && open} busy={busy}
                  onRecord={status => run(dispatchApi.assignmentStatus(id, a.id, status), 'Recorded.')}
                  onStandDown={() => setStandDown(a)} />
              ))}
            </Facts>
          ) : null}

          {inc.escalationLadder.length > 0 ? (
            <Facts title="Who to ring, in order">
              {inc.escalationLadder.map(c => (
                <div key={`${c.level}-${c.phone}`} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, padding: '4px 0' }}>
                  <span style={{ width: 22, color: t.textSubtle, fontWeight: 700 }}>L{c.level}</span>
                  <span style={{ flex: 1, color: t.text }}><strong>{c.name}</strong>{c.position ? <span style={{ color: t.textMuted }}> · {c.position}</span> : null}</span>
                  <a href={`tel:${c.phone.replace(/\s+/g, '')}`} style={{ color: t.brand, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.phone}</a>
                  <Pill tone={c.verification === 1 ? 'success' : c.verification === 0 ? 'neutral' : 'warning'}>{VERIFICATION[c.verification]}</Pill>
                </div>
              ))}
            </Facts>
          ) : null}

          {inc.possibleDuplicates.length > 0 ? (
            <Facts title="Possibly the same thing">
              {inc.possibleDuplicates.map(d => (
                <div key={d.id} style={{ fontSize: 12.5, padding: '4px 0', color: t.text }}>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{d.number}</strong> · {d.situationWords} · {age(d.ageMinutes)} ago · {INCIDENT_STATUS[d.status]}
                </div>
              ))}
            </Facts>
          ) : null}
        </div>

        <div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Timeline</div>
          <div style={{ display: 'grid', gap: 0 }}>
            {inc.timeline.map((row, index) => (
              <div key={index} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: index === 0 ? 'none' : `1px solid ${t.border}` }}>
                <span style={{ width: 92, flexShrink: 0, fontSize: 11.5, color: t.textSubtle, fontVariantNumeric: 'tabular-nums' }}>{fmtDateTime(row.at)}</span>
                <span style={{ fontSize: 12.5, color: t.text, lineHeight: 1.5 }}>
                  {row.message}
                  {row.actorName ? <span style={{ color: t.textSubtle }}> — {row.actorName}</span> : null}
                  {row.internal ? <span style={{ color: t.textSubtle, fontSize: 11 }}> · desk only</span> : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {dialog === 'severity' ? (
        <ChoiceDialog title="Change severity" options={Object.entries(SEVERITY).map(([v, l]) => [Number(v), l] as [number, string])} current={card.severity}
          reasonLabel="Why" verb="Change" onClose={() => setDialog(null)} onSave={(v, reason) => run(deskApi.severity(id, v, reason), 'Severity changed.')} />
      ) : null}
      {dialog === 'note' ? <NoteDialog id={id} onClose={() => setDialog(null)} run={run} /> : null}
      {dialog === 'progress' ? (
        <ReasonDialog title="Being handled" hint="What is happening — a unit told, a vehicle sent, a call made. The reporter reads this." verb="Mark being handled" required={false}
          onClose={() => setDialog(null)} onSave={note => run(deskApi.status(id, 3, note), 'Being handled.')} />
      ) : null}
      {dialog === 'resolve' ? (
        <ReasonDialog title="Resolved" hint="The danger is over. The reporter reads this." verb="Mark resolved" required={false}
          onClose={() => setDialog(null)} onSave={note => run(deskApi.status(id, 5, note), 'Resolved.')} />
      ) : null}
      {dialog === 'escalate' ? (
        <ReasonDialog title={`Escalate to level ${card.escalationLevel + 1}`} hint="The supervisors of the responsible institution are told. Ring the ladder on the left as well — a push is a nudge, not a phone call." verb="Escalate" required
          onClose={() => setDialog(null)} onSave={reason => run(deskApi.escalate(id, reason), 'Escalated.')} />
      ) : null}
      {dialog === 'reroute' ? <RerouteDialog options={inc.routeOptions} onClose={() => setDialog(null)} onSave={(f, reason) => run(deskApi.reroute(id, f, reason), 'Routed.')} /> : null}
      {dialog === 'duplicate' ? (
        <ChoiceDialog title="Mark as a duplicate of" options={inc.possibleDuplicates.map(d => [d.id, `${d.number} · ${d.situationWords}`] as [string, string])} current={inc.possibleDuplicates[0]?.id ?? ''}
          reasonLabel="Note" verb="Fold in" required={false} onClose={() => setDialog(null)} onSave={(master, note) => run(deskApi.duplicate(id, master, note), 'Folded in.')} />
      ) : null}
      {dialog === 'close' ? (
        <ChoiceDialog title="Close" options={Object.entries(OUTCOME).filter(([v]) => v !== '8').map(([v, l]) => [Number(v), l] as [number, string])} current={1}
          reasonLabel="Note" verb="Close" required={false} danger
          hint="Mistaken, unable to verify and malicious need a note — nobody is marked a false reporter without a reason on the record."
          onClose={() => setDialog(null)} onSave={(v, note) => run(deskApi.close(id, v, note), 'Closed.')} />
      ) : null}
      {dialog === 'location' ? <LocationDialog id={id} onClose={() => setDialog(null)} run={run} /> : null}
      {dialog === 'assign' ? <AssignDialog id={id} onClose={() => setDialog(null)} run={run} /> : null}
      {standDown ? (
        <ReasonDialog title={`Stand down ${standDown.responderName ?? standDown.vehicleCallSign ?? standDown.facilityName ?? 'them'}`} hint="They are told, with this reason. The row stays on the record." verb="Stand down" required
          onClose={() => setStandDown(null)} onSave={reason => { run(dispatchApi.standDown(id, standDown.id, reason), 'Stood down.'); setStandDown(null); }} />
      ) : null}
    </Modal>
  );
}

/* ------------------------------------------------------------------ phase 3: sending people */

function AssignmentLine({ a, canAct, busy, onRecord, onStandDown }: { a: AssignmentRow; canAct: boolean; busy: boolean; onRecord: (status: number) => void; onStandDown: () => void }) {
  const { t } = useTheme();
  const live = LIVE.includes(a.status);
  const who = [
    a.responderName ? `${a.responderName}${a.responderRole ? ` (${RESPONDER_ROLE[a.responderRole]?.toLowerCase()})` : ''}` : null,
    a.vehicleCallSign ? `${VEHICLE_KIND[a.vehicleKind ?? 8]} ${a.vehicleCallSign}` : null,
  ].filter(Boolean).join(' with ') || a.unitName || a.facilityName || a.institutionName;
  const last = a.transportingAt ?? a.onSceneAt ?? a.enRouteAt ?? a.acceptedAt ?? a.assignedAt;
  const tone = a.status === 4 || a.status === 5 ? 'success' : a.status === 3 ? 'info' : a.status === 7 ? 'danger' : live ? 'warning' : 'neutral';
  return (
    <div data-assignment={a.id} style={{ padding: '6px 0', borderTop: `1px solid ${t.border}`, fontSize: 12.5 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ color: t.text }}>{who}</strong>
        {a.isLead && live ? <Pill tone="neutral">Lead</Pill> : null}
        <Pill tone={tone}>{ASSIGNMENT_STATUS[a.status]}</Pill>
        <span style={{ color: t.textSubtle, fontVariantNumeric: 'tabular-nums' }}>{fmtDateTime(last)}</span>
        {a.institutionName ? <span style={{ color: t.textSubtle }}>· {a.institutionName}</span> : null}
      </div>
      <div style={{ color: t.textMuted, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {a.responderPhone ? <a href={`tel:${a.responderPhone.replace(/\s+/g, '')}`} style={{ color: t.brand, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{a.responderPhone}</a> : null}
        {a.latitude !== null && a.longitude !== null ? (
          <span>
            {a.distanceKm !== null ? `${a.distanceKm} km away` : 'Position known'} · seen {a.locationAgeMinutes === 0 ? 'just now' : `${a.locationAgeMinutes} min ago`}
            {' '}<a href={`https://www.google.com/maps?q=${a.latitude},${a.longitude}`} target="_blank" rel="noreferrer" style={{ color: t.brand }}>Map</a>
          </span>
        ) : live && a.responderId ? <span style={{ color: t.textSubtle }}>No position shared</span> : null}
        {a.instructions ? <span>· "{a.instructions}"</span> : null}
        {a.endNote ? <span>· {a.endNote}</span> : null}
      </div>
      {canAct && live ? (
        <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
          {a.status < 3 ? <Button size="sm" tone="subtle" disabled={busy} onClick={() => onRecord(3)}>On the way</Button> : null}
          {a.status < 4 ? <Button size="sm" tone="subtle" disabled={busy} onClick={() => onRecord(4)}>On scene</Button> : null}
          {a.status === 4 ? <Button size="sm" tone="subtle" disabled={busy} onClick={() => onRecord(5)}>Transporting</Button> : null}
          <Button size="sm" tone="subtle" disabled={busy} onClick={() => onRecord(6)}>Finished</Button>
          <Button size="sm" tone="danger" disabled={busy} onClick={onStandDown}>Stand down</Button>
        </div>
      ) : null}
    </div>
  );
}

function AssignDialog({ id, onClose, run }: { id: string; onClose: () => void; run: (work: Promise<DeskIncident>, message: string) => void }) {
  const { t } = useTheme();
  const [resources, setResources] = useState<DeskResources | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responderId, setResponderId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [instructions, setInstructions] = useState('');

  useEffect(() => {
    dispatchApi.resources(id).then(r => { setResources(r); setError(null); }).catch((caught: unknown) => setError(err(caught, 'Could not load who is available.')));
  }, [id]);

  const pick = (selected: boolean) => ({
    display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: t.text, padding: '8px 10px', borderRadius: 9, cursor: 'pointer',
    border: `1px solid ${selected ? t.brand : t.border}`, background: selected ? t.brandSoft : 'transparent',
  } as const);
  const heading = { fontSize: 11.5, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.4, margin: '10px 0 6px' } as const;

  const nothing = !responderId && !vehicleId && !facilityId;
  const send = () => run(dispatchApi.assign({
    id, responderId: responderId || null, vehicleId: vehicleId || null, facilityId: facilityId || null, instructions: instructions.trim() || null,
  }), 'Sent.');

  return (
    <Modal title="Send somebody" onClose={onClose} width={640}>
      {error ? <ErrorNote message={error} /> : null}
      {!resources && !error ? <Loading label="Who is available…" /> : null}
      {resources ? (
        <>
          <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.5 }}>
            Your own people, on duty now, free first{resources.requiredCapability ? <> — <strong>can handle it</strong> means they claim the skill this situation asks for</> : null}.
            A position is only shown while the responder shares it, with how old it is.
          </div>

          <div style={heading}>Responder</div>
          {resources.responders.length === 0 ? <div style={{ fontSize: 12.5, color: t.textSubtle }}>Nobody on duty. Ring the station — the ladder is on the incident.</div> : null}
          <div style={{ display: 'grid', gap: 6 }}>
            {resources.responders.map(r => (
              <label key={r.id} style={pick(responderId === r.id)}>
                <input type="radio" checked={responderId === r.id} onChange={() => setResponderId(responderId === r.id ? '' : r.id)} onClick={() => { if (responderId === r.id) setResponderId(''); }} style={{ marginTop: 3 }} />
                <span style={{ flex: 1 }}>
                  <strong>{r.name}</strong> <span style={{ color: t.textMuted }}>· {RESPONDER_ROLE[r.role]?.toLowerCase()}{r.facilityName ? ` · ${r.facilityName}` : ''}</span>
                  <div style={{ fontSize: 12, color: t.textMuted, display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                    <Pill tone={r.free ? 'success' : 'warning'}>{RESPONDER_STATUS[r.status]}</Pill>
                    {r.hasCapability ? <Pill tone="info">Can handle it</Pill> : null}
                    <span>{r.because}</span>
                    {r.locationAgeMinutes !== null ? <span>· seen {r.locationAgeMinutes === 0 ? 'just now' : `${r.locationAgeMinutes} min ago`}</span> : null}
                    {!r.withinRadius ? <span style={{ color: t.warning }}>· beyond their usual radius</span> : null}
                  </div>
                </span>
              </label>
            ))}
          </div>

          <div style={heading}>Vehicle</div>
          {resources.vehicles.length === 0 ? <div style={{ fontSize: 12.5, color: t.textSubtle }}>No vehicle on the fleet is in service.</div> : null}
          <div style={{ display: 'grid', gap: 6 }}>
            {resources.vehicles.map(v => (
              <label key={v.id} style={pick(vehicleId === v.id)}>
                <input type="radio" checked={vehicleId === v.id} onChange={() => setVehicleId(v.id)} onClick={() => { if (vehicleId === v.id) setVehicleId(''); }} style={{ marginTop: 3 }} />
                <span style={{ flex: 1 }}>
                  <strong>{VEHICLE_KIND[v.kind]} {v.callSign}</strong> <span style={{ color: t.textMuted }}>{v.facilityName ? `· ${v.facilityName}` : ''}{v.capacity ? ` · carries ${v.capacity}` : ''}</span>
                  <div style={{ fontSize: 12, color: t.textMuted, display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                    <Pill tone={v.free ? 'success' : 'warning'}>{VEHICLE_STATUS[v.status]}</Pill>
                    {v.ambulanceLevel > 0 ? <span>{['', 'Basic life support', 'Advanced life support', 'Critical care'][v.ambulanceLevel]}</span> : null}
                    {v.inspectionDue ? <span style={{ color: t.warning, fontWeight: 700 }}>· inspection due</span> : null}
                  </div>
                </span>
              </label>
            ))}
          </div>

          {resources.assistance.length > 0 ? (
            <>
              <div style={heading}>Or ask another service</div>
              <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 6 }}>Their desk gains this incident and sends its own people. Pick this on its own, without a responder or a vehicle.</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {resources.assistance.map(o => (
                  <label key={o.facilityId} style={pick(facilityId === o.facilityId)}>
                    <input type="radio" checked={facilityId === o.facilityId} onChange={() => { setFacilityId(o.facilityId); setResponderId(''); setVehicleId(''); }} onClick={() => { if (facilityId === o.facilityId) setFacilityId(''); }} style={{ marginTop: 3 }} />
                    <span>
                      <strong>{o.facilityName}</strong> <span style={{ color: t.textMuted }}>· {o.institutionName}</span>
                      <div style={{ fontSize: 12, color: t.textMuted }}>{o.because}</div>
                    </span>
                  </label>
                ))}
              </div>
            </>
          ) : null}

          <div style={{ marginTop: 10 }}>
            <Field label="Instructions" hint="What they need to know. The responder reads this; the reporter never does."><Textarea value={instructions} onChange={setInstructions} rows={2} /></Field>
          </div>
        </>
      ) : null}
      <Actions>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={nothing || !resources} onClick={send}>Send</Button>
      </Actions>
    </Modal>
  );
}

/**
 * One attached file. Opened on request, never on page load: each open is counted and shown to
 * the reporter, and the bytes come sealed through the desk's own endpoint — there is no URL.
 */
function EvidenceLine({ incidentId, row }: { incidentId: string; row: EvidenceRow }) {
  const { t } = useTheme();
  const [file, setFile] = useState<{ url: string; contentType: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const open = async () => {
    setBusy(true); setFailed(null);
    try {
      const got = await dispatchApi.evidence(incidentId, row.id);
      setFile({ url: `data:${got.contentType};base64,${got.base64}`, contentType: got.contentType });
    } catch (caught) {
      setFailed(caught instanceof Error ? caught.message : 'It could not be opened.');
    } finally { setBusy(false); }
  };
  const kb = row.bytes >= 1_000_000 ? `${(row.bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(row.bytes / 1000))} KB`;
  return (
    <div style={{ display: 'grid', gap: 6, padding: '6px 0', borderBottom: `1px solid ${t.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700 }}>{EVIDENCE_KIND[row.kind] ?? 'File'}{row.caption ? ` — ${row.caption}` : ''}</span>
        <span style={{ color: t.textSubtle, fontSize: 12.5 }}>{kb} · {fmtDateTime(row.addedAt)} · {row.openCount === 0 ? 'not opened yet' : `opened ${row.openCount}×`}</span>
        <span style={{ flex: 1 }} />
        {file ? (
          <a href={file.url} download={row.fileName} style={{ color: t.brand, fontWeight: 700, fontSize: 12.5 }}>Save</a>
        ) : (
          <Button size="sm" tone="ghost" disabled={busy} onClick={() => void open()}>{busy ? 'Opening…' : 'Open'}</Button>
        )}
      </div>
      {failed ? <ErrorNote message={failed} /> : null}
      {file ? (
        file.contentType.startsWith('image/') ? <img src={file.url} alt={row.caption ?? row.fileName} style={{ maxWidth: '100%', maxHeight: 520, borderRadius: 10, border: `1px solid ${t.border}` }} />
        : file.contentType.startsWith('audio/') ? <audio controls src={file.url} style={{ width: '100%' }} />
        : file.contentType.startsWith('video/') ? <video controls src={file.url} style={{ maxWidth: '100%', maxHeight: 520, borderRadius: 10 }} />
        : <iframe title={row.fileName} src={file.url} style={{ width: '100%', height: 520, border: `1px solid ${t.border}`, borderRadius: 10 }} />
      ) : null}
    </div>
  );
}

function Facts({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTheme();
  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: '10px 14px' }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  const { t } = useTheme();
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 12.5, padding: '3px 0' }}>
      <span style={{ width: 84, flexShrink: 0, color: t.textSubtle }}>{label}</span>
      <span style={{ color: t.text, minWidth: 0, wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

function ReasonDialog({ title, hint, verb, required, onClose, onSave }: { title: string; hint: string; verb: string; required: boolean; onClose: () => void; onSave: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <Field label={required ? 'Why' : 'Note'} hint={hint}><Textarea value={text} onChange={setText} rows={3} /></Field>
      <Actions>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={required && !text.trim()} onClick={() => onSave(text.trim())}>{verb}</Button>
      </Actions>
    </Modal>
  );
}

function ChoiceDialog<T extends string | number>({ title, options, current, reasonLabel, verb, required = true, danger, hint, onClose, onSave }: {
  title: string; options: [T, string][]; current: T; reasonLabel: string; verb: string; required?: boolean; danger?: boolean; hint?: string;
  onClose: () => void; onSave: (value: T, reason: string) => void;
}) {
  const { t } = useTheme();
  const [value, setValue] = useState<T>(current);
  const [reason, setReason] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
        {options.map(([v, label]) => (
          <label key={String(v)} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: t.text, padding: '7px 10px', borderRadius: 9, border: `1px solid ${value === v ? t.brand : t.border}`, background: value === v ? t.brandSoft : 'transparent', cursor: 'pointer' }}>
            <input type="radio" checked={value === v} onChange={() => setValue(v)} /> {label}
          </label>
        ))}
      </div>
      <Field label={reasonLabel} hint={hint}><Textarea value={reason} onChange={setReason} rows={2} /></Field>
      <Actions>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone={danger ? 'danger' : 'primary'} disabled={required && !reason.trim()} onClick={() => onSave(value, reason.trim())}>{verb}</Button>
      </Actions>
    </Modal>
  );
}

function NoteDialog({ id, onClose, run }: { id: string; onClose: () => void; run: (work: Promise<DeskIncident>, message: string) => void }) {
  const { t } = useTheme();
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(true);
  return (
    <Modal title="Add a note" onClose={onClose}>
      <Field label="Note"><Textarea value={text} onChange={setText} rows={3} /></Field>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: t.text, marginBottom: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} />
        Desk only — the reporter does not see this
      </label>
      {!internal ? <div style={{ fontSize: 12.5, color: t.warning, fontWeight: 600, marginBottom: 12 }}>The reporter reads this on their status card. Write it for them.</div> : null}
      <Actions>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={!text.trim()} onClick={() => run(deskApi.note(id, text.trim(), internal), 'Noted.')}>Add</Button>
      </Actions>
    </Modal>
  );
}

function RerouteDialog({ options, onClose, onSave }: { options: RouteOption[]; onClose: () => void; onSave: (facilityId: string, reason: string) => void }) {
  const { t } = useTheme();
  const [facility, setFacility] = useState(options[0]?.facilityId ?? '');
  const [reason, setReason] = useState('');
  return (
    <Modal title="Route elsewhere" onClose={onClose} width={560}>
      {options.length === 0 ? <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 12 }}>Nothing else in the directory answers for this area in this sector.</div> : null}
      <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
        {options.map(o => (
          <label key={o.facilityId} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: t.text, padding: '8px 10px', borderRadius: 9, border: `1px solid ${facility === o.facilityId ? t.brand : t.border}`, background: facility === o.facilityId ? t.brandSoft : 'transparent', cursor: 'pointer' }}>
            <input type="radio" checked={facility === o.facilityId} onChange={() => setFacility(o.facilityId)} style={{ marginTop: 3 }} />
            <span>
              <strong>{o.facilityName}</strong> <span style={{ color: t.textMuted }}>· {o.institutionName}</span>
              <div style={{ fontSize: 12, color: t.textMuted }}>{o.because}{o.distanceKm !== null && !o.because.includes('km') ? ` · ${o.distanceKm} km` : ''}</div>
            </span>
          </label>
        ))}
      </div>
      <Field label="Why"><Textarea value={reason} onChange={setReason} rows={2} /></Field>
      <Actions>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={!facility || !reason.trim()} onClick={() => onSave(facility, reason.trim())}>Route</Button>
      </Actions>
    </Modal>
  );
}

function LocationDialog({ id, onClose, run }: { id: string; onClose: () => void; run: (work: Promise<DeskIncident>, message: string) => void }) {
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [districtSlug, setDistrictSlug] = useState('');
  const [community, setCommunity] = useState('');
  const [landmark, setLandmark] = useState('');
  const [note, setNote] = useState('');
  const { t } = useTheme();
  return (
    <Modal title="Correct the location" onClose={onClose} width={520}>
      <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 10 }}>After speaking to the reporter. Leave anything you do not know empty.</div>
      <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr' }}>
        <Field label="Latitude"><Input value={lat} onChange={setLat} /></Field>
        <Field label="Longitude"><Input value={lng} onChange={setLng} /></Field>
      </div>
      <Field label="District">
        <select value={districtSlug} onChange={e => setDistrictSlug(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${t.borderStrong}`, background: t.surfaceMuted, color: t.text, fontFamily: 'inherit', fontSize: 13.5 }}>
          <option value="">—</option>
          {Object.entries(DISTRICT_NAMES).map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
        </select>
      </Field>
      <Field label="Community"><Input value={community} onChange={setCommunity} /></Field>
      <Field label="Landmark"><Input value={landmark} onChange={setLandmark} /></Field>
      <Field label="Note"><Input value={note} onChange={setNote} /></Field>
      <Actions>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" onClick={() => run(deskApi.location({
          id, latitude: lat ? Number(lat) : null, longitude: lng ? Number(lng) : null,
          districtSlug: districtSlug || null, community: community || null, landmark: landmark || null, note: note || null,
        }), 'Location corrected.')}>Save</Button>
      </Actions>
    </Modal>
  );
}

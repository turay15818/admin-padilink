/**
 * One institution, whole.
 *
 * Everything the console knows and does about a responding institution on one page: how
 * it is performing, who works its desk, its chart of offices, the roll and the fleet, the
 * roster, the rules that escalate for it, the codes that let its stations register, who to
 * ring at head office, and the trail of what anybody changed. The directory lists; this is
 * where an administrator runs the relationship with the Ministry, the police, the service.
 *
 * People here are managed through the same service the institution's own supervisor uses
 * from the command centre — the console names the institution and holds the national
 * permission; the rules (nobody removes themselves, the last supervisor stays, an account
 * is finished only by its owner through a link) are the service's, not this page's.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import { Actions, Button, Card, Cell, ErrorNote, Field, Input, Loading, Modal, Pill, Row, Table, Toasts, fmtDate, fmtDateTime, useToasts } from '../components/ui';
import { adminApi, type AdminIdentity, type AuditEntry } from '../api/admin';
import {
  AMBULANCE_LEVEL, CATEGORY, COVERAGE, DISPATCHER_ROLE, ESCALATION_ACTION, ESCALATION_TRIGGER, FACILITY_KIND, FACILITY_STATUS, GPS_METHOD, HOURS, INCIDENT_STATUS, INSTITUTION_STATUS, RESPONDER_ROLE, RESPONDER_STATUS, SEVERITY, VEHICLE_KIND, VEHICLE_STATUS,
  commandApi, deskApi, deskRoleWords, emergencyApi, fleetApi,
  type DeskPerson, type DirectoryOverview, type EscalationRuleRow, type InstitutionDetail, type InstitutionPeople, type InsightsOverview, type LivePicture, type PersonLookup, type QueueCard, type RegistrationCodeRow, type ResponderRow, type ShiftRow, type VehicleRow,
} from '../api/emergency';
import { ContactsTable, FacilityDialog, FacilityDrawer, InstitutionDialog, NoteDialog, asChart } from './EmergencyDirectory';
import { ResponderDialog, RosterBoard, RuleDialog, ShiftDialog, VehicleDialog } from './EmergencyFleet';
import { Buckets, DayLine, HourBars, Ladder } from './EmergencyCommand';

const err = (caught: unknown, fallback: string) => (caught instanceof Error ? caught.message : fallback);
// The command centre's address: its own host when the build says so, otherwise the second
// page of this same deployment.
const COMMAND_URL = ((import.meta.env.VITE_COMMAND_URL as string | undefined) ?? `${window.location.origin}/command.html`).replace(/\/$/, '');

type Tab = 'overview' | 'stations' | 'people' | 'fleet' | 'roster' | 'rules' | 'codes' | 'contacts' | 'activity';
const TABS: [Tab, string][] = [['overview', 'Overview'], ['stations', 'Stations'], ['people', 'People'], ['fleet', 'Fleet'], ['roster', 'Roster'], ['rules', 'Rules'], ['codes', 'Codes'], ['contacts', 'Head office'], ['activity', 'Activity']];

export function EmergencyInstitution({ identity }: { identity: AdminIdentity }) {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'overview';
  const setTab = (next: Tab) => { const p = new URLSearchParams(params); if (next === 'overview') p.delete('tab'); else p.set('tab', next); setParams(p, { replace: true }); };
  const { t } = useTheme();
  const navigate = useNavigate();
  const { toasts, push } = useToasts();
  void identity;

  const [overview, setOverview] = useState<DirectoryOverview | null>(null);
  const [detail, setDetail] = useState<InstitutionDetail | null>(null);
  const [insights, setInsights] = useState<InsightsOverview | null>(null);
  const [live, setLive] = useState<LivePicture | null>(null);
  const [queue, setQueue] = useState<QueueCard[]>([]);
  const [people, setPeople] = useState<InstitutionPeople | null>(null);
  const [responders, setResponders] = useState<ResponderRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [rules, setRules] = useState<EscalationRuleRow[]>([]);
  const [codes, setCodes] = useState<RegistrationCodeRow[]>([]);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(n => n + 1), []);

  const [editing, setEditing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    Promise.all([emergencyApi.overview(), emergencyApi.getInstitution(id)])
      .then(([ov, d]) => { setOverview(ov); setDetail(d); setError(null); })
      .catch(caught => setError(err(caught, 'Could not open that institution.')));
  }, [id, tick]);
  useEffect(() => {
    commandApi.overview({ days: 30, institutionId: id }).then(setInsights).catch(() => setInsights(null));
    commandApi.live().then(setLive).catch(() => setLive(null));
    deskApi.queue({ take: 500 }).then(q => setQueue(q.cards)).catch(() => setQueue([]));
    emergencyApi.people(id).then(setPeople).catch(() => setPeople(null));
    fleetApi.responders(id).then(r => setResponders(r.responders)).catch(() => setResponders([]));
    fleetApi.vehicles(id).then(v => setVehicles(v.vehicles)).catch(() => setVehicles([]));
    fleetApi.rules(id).then(r => setRules(r.rules)).catch(() => setRules([]));
  }, [id, tick]);
  useEffect(() => {
    if (!detail) return;
    emergencyApi.codes(detail.row.sectorId, true).then(r => setCodes(r.codes.filter(c => c.institutionId === id || c.institutionId === null))).catch(() => setCodes([]));
    adminApi.audit({ search: detail.row.name, pageSize: 40 }).then(p => setAudit(p.items)).catch(() => setAudit([]));
  }, [detail, id, tick]);

  // The queue and the live picture name the institution rather than carrying its id; the
  // directory's name and short name are both accepted so a renamed institution still matches.
  const ours = useCallback((name: string | null) => !!detail && !!name && (name === detail.row.name || name === detail.row.shortName), [detail]);
  const mine = useMemo(() => queue.filter(c => ours(c.institutionName) && ![5, 6, 7, 8].includes(c.status)), [queue, ours]);
  const liveMine = useMemo(() => (live ? live.incidents.filter(i => ours(i.institutionName)) : []), [live, ours]);
  const fleetLive = useMemo(() => (live ? live.fleet.find(f => ours(f.institutionName)) ?? null : null), [live, ours]);

  if (error) return <ErrorNote message={error} />;
  if (!overview || !detail) return <Loading />;
  const { row } = detail;
  const canEdit = overview.canEdit;
  const supervisors = people?.people.filter(p => p.role === 2 && p.active).length ?? 0;
  const commandLink = `${COMMAND_URL}${COMMAND_URL.endsWith('.html') ? '' : '/'}?institution=${row.id}`;

  const tile = (label: string, value: ReactNode, note?: ReactNode, tone?: string, onClick?: () => void) => (
    <div onClick={onClick} style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: '10px 14px', minWidth: 0, background: t.surface, cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: tone ?? t.text, fontVariantNumeric: 'tabular-nums', marginTop: 2, lineHeight: 1.1 }}>{value}</div>
      {note ? <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 3 }}>{note}</div> : null}
    </div>
  );

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12.5 }}>
        <Link to="/emergency" style={{ color: t.textMuted, textDecoration: 'none' }}>Emergency directory</Link>
        <span style={{ color: t.textSubtle }}>›</span>
        <span style={{ color: t.textMuted }}>{row.sectorName}</span>
      </div>
      <Card pad={0} style={{ marginBottom: 14 }}>
        <div style={{ padding: '16px 18px', display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: t.text }}>{row.name}</h1>
              {row.shortName ? <span style={{ fontSize: 12.5, color: t.textSubtle }}>{row.shortName}</span> : null}
              <Pill tone={row.status === 2 ? 'success' : row.status === 1 ? 'neutral' : 'danger'}>{INSTITUTION_STATUS[row.status]}</Pill>
              {row.verified ? <Pill tone="success">Verified</Pill> : <Pill tone="warning">Unverified</Pill>}
              {row.national ? <Pill tone="info">National</Pill> : null}
              {row.government ? <Pill tone="neutral">Government</Pill> : null}
            </div>
            <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 5 }}>
              {row.sectorName}{row.typeName ? ` · ${row.typeName}` : ''}{row.headOfficeText ? ` · ${row.headOfficeText}` : ''}
              {row.publicPhone ? <> · public line <strong style={{ color: t.text }}>{row.publicPhone}</strong></> : null}
              {detail.email ? <> · {detail.email}</> : null}
            </div>
            {detail.description ? <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 6, lineHeight: 1.6, maxWidth: 720 }}>{detail.description}</div> : null}
            {row.verified && detail.verifiedByName ? <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 6 }}>Verified by {detail.verifiedByName}{detail.verifiedAt ? ` on ${fmtDate(detail.verifiedAt)}` : ''}{detail.verificationNote ? ` — ${detail.verificationNote}` : ''}</div> : null}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <a href={commandLink} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><Button size="sm" tone="primary">Open command centre ↗</Button></a>
            {canEdit ? (<>
              <Button size="sm" tone="subtle" onClick={() => setEditing(true)}>Edit</Button>
              <Button size="sm" tone="subtle" onClick={() => setVerifying(true)}>{row.verified ? 'Withdraw verification' : 'Mark verified'}</Button>
              <Button size="sm" tone="danger" onClick={() => setArchiving(true)}>Archive</Button>
            </>) : null}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', padding: '0 18px 16px' }}>
          {tile('Open now', mine.length, `${mine.filter(c => c.unowned).length} unowned`, mine.some(c => c.severity === 1) ? t.danger : undefined, () => setTab('overview'))}
          {tile('30 days', insights?.reported ?? '—', insights ? `${insights.resolved} resolved · ${insights.critical} critical` : undefined)}
          {tile('To acknowledge', insights?.ladder.toAcknowledge.medianMinutes ?? '—', 'median minutes')}
          {tile('To scene', insights?.ladder.toScene.medianMinutes ?? '—', 'median minutes')}
          {tile('On duty', fleetLive?.respondersOnDuty ?? insights?.respondersOnDuty ?? '—', fleetLive ? `${fleetLive.respondersFree} free · ${fleetLive.vehiclesFree} vehicles free` : undefined, undefined, () => setTab('fleet'))}
          {tile('Stations', detail.facilityRows.length, `${detail.facilityRows.filter(f => f.verified).length} verified · ${detail.facilityRows.filter(f => f.latitude === null).length} without a pin`, undefined, () => setTab('stations'))}
          {tile('Desk', people?.people.filter(p => p.active).length ?? '—', people ? `${supervisors} supervisor${supervisors === 1 ? '' : 's'} · ${people.people.filter(p => p.awaitingSetup).length} awaiting setup` : undefined, supervisors === 0 ? t.warning : undefined, () => setTab('people'))}
          {tile('Numbers to ring', row.contactsNeedingVerification, row.contactsNeedingVerification ? 'due, expired or changed' : 'all current', row.contactsNeedingVerification ? t.warning : t.success, () => navigate('/emergency/verification'))}
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {TABS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} style={{ padding: '7px 12px', borderRadius: 9, border: `1px solid ${tab === key ? t.brand : t.border}`, background: tab === key ? t.brandSoft : 'transparent', color: tab === key ? t.brand : t.textMuted, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            {label}{key === 'people' && people ? ` · ${people.people.length}` : key === 'stations' ? ` · ${detail.facilityRows.length}` : key === 'fleet' ? ` · ${responders.length + vehicles.length}` : key === 'rules' ? ` · ${rules.length}` : key === 'codes' ? ` · ${codes.filter(c => c.usable).length}` : ''}
          </button>
        ))}
      </div>

      {tab === 'overview' ? <OverviewTab detail={detail} insights={insights} mine={mine} liveMine={liveMine} overview={overview} navigate={navigate} /> : null}
      {tab === 'stations' ? <StationsTab detail={detail} overview={overview} canEdit={canEdit} push={push} refresh={refresh} /> : null}
      {tab === 'people' ? <PeopleTab institutionId={row.id} people={people} canEdit={canEdit} push={push} refresh={refresh} /> : null}
      {tab === 'fleet' ? <FleetTab institution={{ id: row.id, name: row.name }} responders={responders} vehicles={vehicles} canEdit={canEdit} push={push} refresh={refresh} /> : null}
      {tab === 'roster' ? <RosterTab institution={{ id: row.id, name: row.name }} responders={responders} canEdit={canEdit} push={push} refresh={refresh} /> : null}
      {tab === 'rules' ? <RulesTab institution={{ id: row.id, name: row.name }} rules={rules} canEdit={canEdit} push={push} refresh={refresh} /> : null}
      {tab === 'codes' ? <CodesTab detail={detail} codes={codes} canEdit={canEdit} push={push} refresh={refresh} /> : null}
      {tab === 'contacts' ? (
        <Card>
          <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6, marginBottom: 12 }}>Numbers held at institution level — the national control room, the head office. A station's own numbers live on the station.</div>
          <ContactsTable contacts={detail.institutionContacts} canEdit={canEdit} onOpen={() => navigate(`/emergency?open=${row.id}`)} onChanged={m => { refresh(); if (m) push(m); }} push={push} />
          <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 10 }}>Add or edit head-office contacts from the <Link to="/emergency">directory</Link>; verify numbers under <Link to="/emergency/verification">Verification</Link>.</div>
        </Card>
      ) : null}
      {tab === 'activity' ? <ActivityTab rows={audit} /> : null}

      {editing ? <InstitutionDialog overview={overview} existing={detail} onClose={() => setEditing(false)} onDone={saved => { setEditing(false); setDetail(saved); push('Saved.'); }} /> : null}
      {verifying ? <NoteDialog title={row.verified ? `Withdraw verification from ${row.name}` : `Mark ${row.name} as verified`} hint={row.verified ? 'Say what was wrong.' : 'Say what you checked — a letter from the institution, a call to the head office, a visit.'} verb={row.verified ? 'Withdraw' : 'Mark verified'} required={row.verified} onClose={() => setVerifying(false)} onSave={note => emergencyApi.verifyInstitution(row.id, !row.verified, note).then(next => { setVerifying(false); setDetail(next); push(row.verified ? 'Verification withdrawn.' : 'Marked verified.'); })} /> : null}
      {archiving ? <NoteDialog title={`Archive ${row.name}`} hint="Every station under it leaves the directory with it. The record stays, archived, and can be brought back." verb="Archive" required danger onClose={() => setArchiving(false)} onSave={reason => emergencyApi.archiveInstitution(row.id, reason).then(() => { setArchiving(false); push('Archived.'); navigate('/emergency'); })} /> : null}
      <Toasts toasts={toasts} />
    </>
  );
}

/* ------------------------------------------------------------------ overview */

function OverviewTab({ detail, insights, mine, liveMine, overview, navigate }: { detail: InstitutionDetail; insights: InsightsOverview | null; mine: QueueCard[]; liveMine: LivePicture['incidents']; overview: DirectoryOverview; navigate: (to: string) => void }) {
  const { t } = useTheme();
  const district = (slug: string | null) => overview.districts.find(d => d.slug === slug)?.name ?? '—';
  const sorted = [...mine].sort((a, b) => (Number(b.unowned) - Number(a.unowned)) || (a.severity - b.severity) || (b.ageMinutes - a.ageMinutes));
  const sevTone = (s: number) => (s === 1 ? t.danger : s === 2 ? t.warning : s === 3 ? t.brand : t.textSubtle);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 1.3fr) minmax(300px, 1fr)' }}>
        <Card pad={0}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 13 }}>Open now</strong><span style={{ fontSize: 12, color: t.textMuted }}>{mine.length} on this institution's desk · {liveMine.filter(i => i.latitude !== null).length} with a pin</span>
            <span style={{ flex: 1 }} /><Button size="sm" tone="subtle" onClick={() => navigate('/emergency/desk')}>Desk</Button><Button size="sm" tone="primary" onClick={() => navigate(`/emergency/analytics?institution=${detail.row.id}`)}>Full analytics ›</Button>
          </div>
          {sorted.length === 0 ? <div style={{ padding: 18, fontSize: 12.5, color: t.textMuted }}>Nothing open. Quiet.</div> : (
            <Table head={['', 'Number', 'What', 'Where', 'Station', 'Status', 'Age']}>
              {sorted.slice(0, 15).map(c => (
                <Row key={c.id} onClick={() => navigate(`/emergency/desk?open=${c.id}`)}>
                  <Cell><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 5, background: sevTone(c.severity) }} /></Cell>
                  <Cell mono><strong>{c.number}</strong></Cell>
                  <Cell>{c.situationWords}<div style={{ fontSize: 11.5, color: t.textSubtle }}>{CATEGORY[c.category]} · {SEVERITY[c.severity]}</div></Cell>
                  <Cell>{district(c.districtSlug)}<div style={{ fontSize: 11.5, color: t.textSubtle }}>{[c.community, c.landmark].filter(Boolean).join(' · ')}</div></Cell>
                  <Cell>{c.facilityName ?? <Pill tone="warning">Unrouted</Pill>}</Cell>
                  <Cell><Pill tone={c.unowned ? 'warning' : [9, 10, 11].includes(c.status) ? 'success' : 'info'}>{c.unowned ? 'Nobody on it' : INCIDENT_STATUS[c.status]}</Pill>{c.escalationLevel > 0 ? <> <Pill tone="danger">L{c.escalationLevel}</Pill></> : null}</Cell>
                  <Cell mono>{c.ageMinutes < 60 ? `${c.ageMinutes}m` : `${Math.floor(c.ageMinutes / 60)}h ${c.ageMinutes % 60}m`}</Cell>
                </Row>
              ))}
            </Table>
          )}
        </Card>
        <Card>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 2 }}>Response ladder</div>
          <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 10 }}>Thirty days, against the thirty before.</div>
          {insights ? <Ladder o={insights} /> : <Loading />}
        </Card>
      </div>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <Card><div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Reported and resolved, by day</div>{insights ? <DayLine points={insights.byDay} /> : <Loading />}</Card>
        <Card><div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>By hour of day</div>{insights ? <HourBars points={insights.byHour} /> : <Loading />}</Card>
        <Card><div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>By severity</div>{insights ? <Buckets rows={insights.bySeverity.map(b => ({ label: b.label, count: b.count, timing: b.toAcknowledge, tone: sevTone(Number(b.key)) }))} /> : <Loading />}</Card>
        <Card><div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Districts it answered in</div>{insights ? <Buckets rows={[...insights.byDistrict].sort((a, b) => b.reported - a.reported).slice(0, 8).map(d => ({ label: d.name, count: d.reported, timing: d.toAcknowledge, tone: t.series[0] }))} /> : <Loading />}</Card>
      </div>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Where it stands</div>
        <div style={{ display: 'grid', gap: '4px 24px', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', fontSize: 12.5, color: t.textMuted, lineHeight: 1.7 }}>
          <div>{detail.facilityRows.length} office{detail.facilityRows.length === 1 ? '' : 's'} on the chart — {detail.facilityRows.filter(f => !f.parentFacilityId).length} at the top, {detail.facilityRows.filter(f => f.parentFacilityId).length} reporting to another.</div>
          <div>{detail.facilityRows.filter(f => f.status === 2).length} active, {detail.facilityRows.filter(f => f.latitude !== null).length} with a pin, {detail.facilityRows.filter(f => f.verified).length} verified by Vacancy.</div>
          <div>{insights ? `${insights.assignmentsMade} people sent in thirty days, ${insights.assignmentsDeclined} declined, ${insights.escalationsFired} escalations fired.` : ''}</div>
          <div>{insights ? `${insights.unrouted} report${insights.unrouted === 1 ? '' : 's'} in its area found no station — each is a gap in the chart.` : ''}</div>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ stations */

function StationsTab({ detail, overview, canEdit, push, refresh }: { detail: InstitutionDetail; overview: DirectoryOverview; canEdit: boolean; push: (m: string, tone?: 'ok' | 'error') => void; refresh: () => void }) {
  const { t } = useTheme();
  const [adding, setAdding] = useState<{ parentId: string | null } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const chart = asChart(detail.facilityRows);
  return (
    <Card pad={0}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.5, flex: 1, minWidth: 260 }}>The institution's chart: headquarters, the offices under it, the stations under those — three levels at most. An incident is routed to a station, never to the chart; the chart is who reports to whom.</div>
        {canEdit ? <Button size="sm" tone="primary" onClick={() => setAdding({ parentId: null })}>Add an office</Button> : null}
      </div>
      {chart.length === 0 ? <div style={{ padding: 18, fontSize: 12.5, color: t.textMuted }}>No stations yet — until one exists, this institution answers for nothing except its national line.</div> : (
        <Table head={['Office', 'Kind', 'District', 'Covers', 'Pin', 'Hours', 'Units', 'Contacts', 'Status', '']}>
          {chart.map(({ row: f, depth }) => (
            <Row key={f.id} onClick={() => setOpenId(f.id)}>
              <Cell><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, paddingLeft: depth * 20 }}>{depth > 0 ? <span style={{ color: t.textSubtle }}>└</span> : null}<strong>{f.name}</strong>{f.verified ? <Pill tone="success">Verified</Pill> : null}{f.subOffices ? <span style={{ fontSize: 11, color: t.textSubtle, whiteSpace: 'nowrap' }}>{f.subOffices} under it</span> : null}</span></Cell>
              <Cell>{FACILITY_KIND[f.kind]}</Cell>
              <Cell>{overview.districts.find(d => d.slug === f.districtSlug)?.name ?? '—'}</Cell>
              <Cell>{f.coverage === 1 ? `${f.coverageRadiusKm} km` : f.coverage === 2 ? (overview.districts.find(d => d.slug === f.coverageDistrictSlug)?.name ?? 'district') : COVERAGE[f.coverage]}</Cell>
              <Cell>{f.latitude === null ? <Pill tone="warning">No pin</Pill> : f.gpsVerified ? <Pill tone="success">Surveyed</Pill> : <Pill tone="neutral">{GPS_METHOD[f.gpsMethod]}</Pill>}</Cell>
              <Cell>{HOURS[f.hours]}</Cell>
              <Cell>{f.units}</Cell>
              <Cell>{f.contacts}</Cell>
              <Cell><Pill tone={f.status === 2 ? 'success' : f.status === 1 ? 'neutral' : 'danger'}>{FACILITY_STATUS[f.status]}</Pill></Cell>
              <Cell>{canEdit && depth < 2 ? <Button size="sm" tone="subtle" onClick={() => setAdding({ parentId: f.id })}>+ sub-office</Button> : null}</Cell>
            </Row>
          ))}
        </Table>
      )}
      {adding ? <FacilityDialog overview={overview} institutionId={detail.row.id} siblings={detail.facilityRows} parentId={adding.parentId} onClose={() => setAdding(null)} onDone={saved => { setAdding(null); push(`${saved.row.name} added.`); refresh(); setOpenId(saved.row.id); }} /> : null}
      {openId ? <FacilityDrawer id={openId} overview={overview} canEdit={canEdit} siblings={detail.facilityRows} onClose={() => { setOpenId(null); refresh(); }} push={push} /> : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ people */

function PeopleTab({ institutionId, people, canEdit, push, refresh }: { institutionId: string; people: InstitutionPeople | null; canEdit: boolean; push: (m: string, tone?: 'ok' | 'error') => void; refresh: () => void }) {
  const { t } = useTheme();
  const [adding, setAdding] = useState<'admin' | 'person' | null>(null);
  const [editing, setEditing] = useState<DeskPerson | null>(null);
  const [removing, setRemoving] = useState<DeskPerson | null>(null);
  if (!people) return <Loading />;
  const supervisors = people.people.filter(p => p.role === 2 && p.active).length;
  const resend = (p: DeskPerson) => emergencyApi.resendSetup(p.id).then(r => push(r.message)).catch(caught => push(err(caught, 'Could not send it.'), 'error'));
  return (
    <Card pad={0}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.5, flex: 1, minWidth: 260 }}>
          Who may sign in to this institution's command centre. A <strong>dispatcher</strong> works incidents; a <strong>supervisor</strong> also runs the roll, the roster, the stations and this list from the command centre; <strong>view only</strong> reads. Somebody with no account is started here and finishes it themselves through an e-mailed link.
          {supervisors === 0 ? <span style={{ color: t.warning, fontWeight: 700 }}> No supervisor yet — name one, and the institution can run its own desk.</span> : null}
        </div>
        {canEdit ? <div style={{ display: 'flex', gap: 6 }}>{supervisors === 0 ? <Button size="sm" tone="primary" onClick={() => setAdding('admin')}>Profile an institution administrator</Button> : null}<Button size="sm" tone={supervisors === 0 ? 'subtle' : 'primary'} onClick={() => setAdding('person')}>Add a person</Button></div> : null}
      </div>
      {people.people.length === 0 ? <div style={{ padding: 18, fontSize: 12.5, color: t.textMuted, lineHeight: 1.6 }}>Nobody on the desk yet. Its incidents are seen only by Vacancy's own emergency administrators, and the timeline says so. Start with the institution's administrator: they then profile their own people — dispatchers at each station, station supervisors — from the command centre, and those people sign in with the password they choose through the link.</div> : (
        <Table head={['Who', 'Role', 'Station', 'Reaches them', 'Account', 'Last on the desk', 'Since', '']}>
          {people.people.map(p => (
            <Row key={p.id}>
              <Cell><strong style={{ opacity: p.active ? 1 : 0.6 }}>{p.name}</strong>{p.title ? <div style={{ fontSize: 11.5, color: t.textSubtle }}>{p.title}</div> : null}</Cell>
              <Cell><Pill tone={p.role === 2 ? 'info' : p.role === 3 ? 'neutral' : 'success'}>{deskRoleWords(p.role, p.facilityId)}</Pill>{!p.active ? <> <Pill tone="neutral">Inactive</Pill></> : null}</Cell>
              <Cell>{p.facilityName ?? 'Whole institution'}</Cell>
              <Cell mono><div>{p.email ?? '—'}</div><div style={{ fontSize: 11.5, color: t.textSubtle }}>{p.phone ?? ''}</div></Cell>
              <Cell>{!p.canSignIn ? <Pill tone="danger">No e-mail — no sign-in code</Pill> : p.awaitingSetup ? <Pill tone="warning">Awaiting setup</Pill> : <Pill tone="success">Ready</Pill>}</Cell>
              <Cell>{p.lastSeenAt ? fmtDateTime(p.lastSeenAt) : <span style={{ color: t.textSubtle }}>never</span>}</Cell>
              <Cell>{fmtDate(p.addedAt)}</Cell>
              <Cell>{canEdit ? <div style={{ display: 'flex', gap: 4 }}>{p.awaitingSetup ? <Button size="sm" tone="subtle" onClick={() => void resend(p)}>Send link again</Button> : null}<Button size="sm" tone="subtle" onClick={() => setEditing(p)}>Edit</Button><Button size="sm" tone="danger" onClick={() => setRemoving(p)}>Remove</Button></div> : null}</Cell>
            </Row>
          ))}
        </Table>
      )}
      {adding ? <PersonDialog institutionId={institutionId} people={people} presetRole={adding === 'admin' ? 2 : 1} onClose={() => setAdding(null)} onDone={m => { setAdding(null); push(m); refresh(); }} /> : null}
      {editing ? <PersonDialog institutionId={institutionId} people={people} existing={editing} onClose={() => setEditing(null)} onDone={m => { setEditing(null); push(m); refresh(); }} /> : null}
      {removing ? <NoteDialog title={`Remove ${removing.name} from the desk`} hint="They keep their Vacancy account; they lose the command centre. The last supervisor cannot be removed." verb="Remove" danger onClose={() => setRemoving(null)} onSave={reason => emergencyApi.removePerson(removing.id, reason).then(() => { setRemoving(null); push('Removed.'); refresh(); }).catch(caught => push(err(caught, 'Could not remove them.'), 'error'))} /> : null}
    </Card>
  );
}

/**
 * One person on a desk, from the console.
 *
 * Works with an institution fixed (the workspace) or chosen in the dialog (the national
 * list). The facilities offered are the institution's, fetched when it is chosen.
 */
export function PersonDialog({ institutionId: fixedInstitutionId, institutions = [], people: given, existing, presetRole, onClose, onDone }: {
  institutionId?: string; institutions?: { id: string; name: string }[]; people?: InstitutionPeople; existing?: DeskPerson; presetRole?: number; onClose: () => void; onDone: (message: string) => void;
}) {
  const { t } = useTheme();
  const [institutionId, setInstitutionId] = useState(fixedInstitutionId ?? institutions[0]?.id ?? '');
  const [fetched, setFetched] = useState<InstitutionPeople | null>(null);
  useEffect(() => {
    if (given || !institutionId) return;
    emergencyApi.people(institutionId).then(setFetched).catch(() => setFetched(null));
  }, [given, institutionId]);
  const people: InstitutionPeople = given ?? fetched ?? { institutionId, institutionName: '', canManage: true, facilities: [], people: [], managesFacilityId: null, managesFacilityName: null, commandUrl: null };
  const [mode, setMode] = useState<'find' | 'new'>('find');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<PersonLookup | null>(null);
  const [looking, setLooking] = useState(false);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState(existing?.role ?? presetRole ?? 1);
  const [title, setTitle] = useState(existing?.title ?? (presetRole === 2 ? 'Institution administrator' : ''));
  const [facilityId, setFacilityId] = useState(existing?.facilityId ?? '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectStyle = { width: '100%', padding: '9px 10px', borderRadius: 10, border: `1px solid ${t.borderStrong}`, background: t.surfaceMuted, color: t.text, fontFamily: 'inherit', fontSize: 13 } as const;

  const look = () => { setLooking(true); setError(null); setFound(null); emergencyApi.peopleLookup(institutionId, query.trim()).then(setFound).catch(caught => setError(err(caught, 'Could not look that up.'))).finally(() => setLooking(false)); };
  const save = () => {
    setBusy(true); setError(null);
    const base = { institutionId, facilityId: facilityId || null, role, title: title || null, active };
    const body = existing ? { id: existing.id, ...base } : mode === 'find' ? { userId: found?.userId ?? null, ...base } : { newAccount: { firstName: first.trim(), lastName: last.trim(), email: email.trim(), phone: phone.trim() || null }, ...base };
    emergencyApi.savePerson(body).then(r => onDone(r.message)).catch(caught => setError(err(caught, 'That did not save.'))).finally(() => setBusy(false));
  };
  const ready = Boolean(institutionId) && (existing ? true : mode === 'find' ? Boolean(found?.found && !found.alreadyOnDesk) : Boolean(first.trim() && email.includes('@')));

  return (
    <Modal title={existing ? existing.name : presetRole === 2 ? 'Profile the institution\'s administrator' : 'Add a person to the desk'} onClose={onClose} width={560}>
      {!existing && !fixedInstitutionId ? (
        <Field label="Institution"><select value={institutionId} onChange={e => { setInstitutionId(e.target.value); setFacilityId(''); setFound(null); }} style={selectStyle}>{institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
      ) : null}
      {presetRole === 2 && !existing ? <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6, marginBottom: 12, padding: '8px 10px', borderRadius: 10, background: t.brandSoft }}>The administrator is a supervisor bound to the whole institution. Once their account is ready they sign in to the command centre and profile everybody else themselves — dispatchers and supervisors at each station — so Vacancy never has to.</div> : null}
      {!existing ? (<>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {(['find', 'new'] as const).map(m => <button key={m} type="button" onClick={() => { setMode(m); setError(null); }} style={{ padding: '6px 12px', borderRadius: 9, border: `1px solid ${mode === m ? t.brand : t.border}`, background: mode === m ? t.brandSoft : 'transparent', color: mode === m ? t.brand : t.textMuted, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>{m === 'find' ? 'Has a Vacancy account' : 'Needs an account'}</button>)}
        </div>
        {mode === 'find' ? (<>
          <Field label="Their e-mail address or phone number" hint="Exact — the console finds the account; it does not browse them.">
            <div style={{ display: 'flex', gap: 6 }}><Input value={query} onChange={v => { setQuery(v); setFound(null); }} placeholder="fatmata@nems.gov.sl or +232 76 …" onEnter={look} /><Button tone="subtle" disabled={looking || query.trim().length < 3} onClick={look}>{looking ? '…' : 'Find'}</Button></div>
          </Field>
          {found ? <div style={{ padding: '8px 10px', borderRadius: 10, background: found.found ? (found.alreadyOnDesk || !found.maskedEmail ? t.warningSoft : t.successSoft) : t.surfaceMuted, fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>{found.found ? <><strong>{found.name}</strong> <span style={{ color: t.textMuted }}>· {found.maskedEmail ?? 'no e-mail'} {found.maskedPhone ?? ''}</span><div style={{ color: found.alreadyOnDesk || !found.maskedEmail ? t.warning : t.success }}>{found.message}</div></> : <><div>{found.message}</div><Button size="sm" tone="subtle" onClick={() => setMode('new')}>Start an account for them</Button></>}</div> : null}
        </>) : (<>
          <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr' }}>
            <Field label="First name"><Input value={first} onChange={setFirst} autoFocus /></Field>
            <Field label="Last name"><Input value={last} onChange={setLast} /></Field>
            <Field label="E-mail" hint="Where the setup link goes — the only way into the account."><Input value={email} onChange={setEmail} type="email" /></Field>
            <Field label="Phone"><Input value={phone} onChange={setPhone} /></Field>
          </div>
          <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5, marginBottom: 12, padding: '8px 10px', borderRadius: 10, background: t.surfaceMuted }}>Created without a usable password. They choose their own through the link, which works for fourteen days; nobody can set it for them. Until then their row says <em>awaiting setup</em>.</div>
        </>)}
      </>) : <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 10 }}>{existing.email ?? ''} {existing.phone ?? ''}{existing.awaitingSetup ? <span style={{ color: t.warning }}> · awaiting setup</span> : null}</div>}
      <Field label="Role" hint={role === 2 ? (facilityId ? 'A station supervisor: runs that station\'s desk and the offices under it, and profiles the people there.' : 'The institution\'s administrator: runs the whole desk — the roll, the roster, the stations, and everybody on it.') : role === 3 ? 'Reads everything, changes nothing, never sees where a private incident is.' : 'Works incidents: acknowledges, sends people, closes.'}>
        <select value={role} onChange={e => setRole(Number(e.target.value))} style={selectStyle}>{Object.entries(DISPATCHER_ROLE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </Field>
      <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr' }}>
        <Field label="Title" hint="As the desk knows them."><Input value={title} onChange={setTitle} placeholder="Duty officer" /></Field>
        <Field label="Station" hint={role === 2 ? 'Whole institution makes them its administrator; one station makes them that station\'s supervisor.' : 'Empty means the whole institution.'}><select value={facilityId} onChange={e => setFacilityId(e.target.value)} style={selectStyle}><option value="">Whole institution</option>{people.facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 12, cursor: 'pointer' }}><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active — can sign in</label>
      {error ? <ErrorNote message={error} /> : null}
      <Actions><Button tone="subtle" onClick={onClose}>Cancel</Button><Button tone="primary" disabled={busy || !ready} onClick={save}>{busy ? 'Saving…' : existing ? 'Save' : mode === 'new' ? 'Create and send the link' : 'Add to the desk'}</Button></Actions>
    </Modal>
  );
}

/* ------------------------------------------------------------------ fleet, roster, rules */

function FleetTab({ institution, responders, vehicles, canEdit, push, refresh }: { institution: { id: string; name: string }; responders: ResponderRow[]; vehicles: VehicleRow[]; canEdit: boolean; push: (m: string, tone?: 'ok' | 'error') => void; refresh: () => void }) {
  const { t } = useTheme();
  const [editingResponder, setEditingResponder] = useState<ResponderRow | 'new' | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<VehicleRow | 'new' | null>(null);
  const [removing, setRemoving] = useState<{ kind: 'responder' | 'vehicle'; id: string; label: string } | null>(null);
  const [parking, setParking] = useState<VehicleRow | null>(null);
  const institutions = [institution];
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Card pad={0}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 13 }}>Responders · {responders.length}</strong><span style={{ fontSize: 12, color: t.textMuted }}>{responders.filter(r => r.status !== 1 && r.status !== 8).length} on duty · {responders.filter(r => !r.verified).length} unverified</span>
          <span style={{ flex: 1 }} />{canEdit ? <Button size="sm" tone="primary" onClick={() => setEditingResponder('new')}>Add a responder</Button> : null}
        </div>
        {responders.length === 0 ? <div style={{ padding: 18, fontSize: 12.5, color: t.textMuted }}>Nobody on the roll. A responder is an ordinary Vacancy account, verified by their institution before a desk can send them.</div> : (
          <Table head={['Who', 'Station', 'Role · skills', 'Status', 'Verified', 'Position', '']}>
            {responders.map(r => (
              <Row key={r.id}>
                <Cell><strong>{r.name}</strong><div style={{ fontSize: 11.5, color: t.textSubtle }}>{r.phone ?? r.email}{r.employeeNumber ? ` · ${r.employeeNumber}` : ''}</div></Cell>
                <Cell>{[r.facilityName, r.unitName].filter(Boolean).join(' · ') || 'Whole institution'}</Cell>
                <Cell>{RESPONDER_ROLE[r.role]}<div style={{ fontSize: 11.5, color: t.textSubtle }}>{r.skills.join(', ') || '—'}</div></Cell>
                <Cell><Pill tone={r.status === 2 ? 'success' : r.status === 1 || r.status === 8 ? 'neutral' : 'warning'}>{RESPONDER_STATUS[r.status]}</Pill>{r.openAssignments ? <div style={{ fontSize: 11.5, color: t.textSubtle }}>{r.openAssignments} live</div> : null}</Cell>
                <Cell>{r.verified ? <Pill tone="success">Verified</Pill> : <Pill tone="warning">Not verified</Pill>}{!r.active ? <> <Pill tone="neutral">Inactive</Pill></> : null}</Cell>
                <Cell>{r.shareLocation ? (r.locationAgeMinutes === null ? 'Sharing, nothing yet' : `Seen ${r.locationAgeMinutes === 0 ? 'just now' : `${r.locationAgeMinutes} min ago`}`) : 'Not sharing'}</Cell>
                <Cell>{canEdit ? <div style={{ display: 'flex', gap: 4 }}><Button size="sm" tone="subtle" onClick={() => setEditingResponder(r)}>Edit</Button><Button size="sm" tone="danger" onClick={() => setRemoving({ kind: 'responder', id: r.id, label: r.name })}>Remove</Button></div> : null}</Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>
      <Card pad={0}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 13 }}>Vehicles · {vehicles.length}</strong><span style={{ fontSize: 12, color: t.textMuted }}>{vehicles.filter(v => v.status === 1).length} free · {vehicles.filter(v => v.inspectionDue).length} inspection due</span>
          <span style={{ flex: 1 }} />{canEdit ? <Button size="sm" tone="primary" onClick={() => setEditingVehicle('new')}>Add a vehicle</Button> : null}
        </div>
        {vehicles.length === 0 ? <div style={{ padding: 18, fontSize: 12.5, color: t.textMuted }}>No vehicles yet.</div> : (
          <Table head={['Call sign', 'Station', 'Kind', 'Status', 'Inspection', '']}>
            {vehicles.map(v => (
              <Row key={v.id}>
                <Cell><strong>{v.callSign}</strong><div style={{ fontSize: 11.5, color: t.textSubtle }}>{v.registration ?? '—'}{v.equipment ? ` · ${v.equipment}` : ''}</div></Cell>
                <Cell>{[v.facilityName, v.unitName].filter(Boolean).join(' · ') || 'Whole institution'}</Cell>
                <Cell>{VEHICLE_KIND[v.kind]}<div style={{ fontSize: 11.5, color: t.textSubtle }}>{v.kind === 1 ? AMBULANCE_LEVEL[v.ambulanceLevel] : v.capacity ? `carries ${v.capacity}` : ''}</div></Cell>
                <Cell><Pill tone={v.status === 1 ? 'success' : v.status >= 6 ? 'neutral' : 'warning'}>{VEHICLE_STATUS[v.status]}</Pill></Cell>
                <Cell>{v.nextInspectionOn ? <span style={{ color: v.inspectionDue ? t.warning : t.text, fontWeight: v.inspectionDue ? 700 : 400 }}>{v.inspectionDue ? 'Due ' : 'Next '}{fmtDate(v.nextInspectionOn)}</span> : '—'}</Cell>
                <Cell>{canEdit ? <div style={{ display: 'flex', gap: 4 }}><Button size="sm" tone="subtle" onClick={() => setEditingVehicle(v)}>Edit</Button><Button size="sm" tone="subtle" onClick={() => setParking(v)}>{v.status >= 6 ? 'Back in service' : 'Out of service'}</Button><Button size="sm" tone="danger" onClick={() => setRemoving({ kind: 'vehicle', id: v.id, label: v.callSign })}>Remove</Button></div> : null}</Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>
      {editingResponder ? <ResponderDialog existing={editingResponder === 'new' ? null : editingResponder} institutions={institutions} onClose={() => setEditingResponder(null)} onDone={() => { setEditingResponder(null); push('Saved.'); refresh(); }} /> : null}
      {editingVehicle ? <VehicleDialog existing={editingVehicle === 'new' ? null : editingVehicle} institutions={institutions} onClose={() => setEditingVehicle(null)} onDone={() => { setEditingVehicle(null); push('Saved.'); refresh(); }} /> : null}
      {parking ? <NoteDialog title={parking.status >= 6 ? `${parking.callSign} back in service` : `${parking.callSign} out of service`} hint={parking.status >= 6 ? 'It becomes available to the desk again.' : 'Why — a gearbox, an inspection.'} verb={parking.status >= 6 ? 'Back in service' : 'Out of service'} onClose={() => setParking(null)} onSave={note => fleetApi.vehicleStatus(parking.id, parking.status >= 6 ? 1 : 7, note).then(() => { setParking(null); push('Done.'); refresh(); })} /> : null}
      {removing ? <NoteDialog title={`Remove ${removing.label}`} hint="Why. The row is kept with the reason." verb="Remove" danger onClose={() => setRemoving(null)} onSave={reason => (removing.kind === 'responder' ? fleetApi.removeResponder(removing.id, reason) : fleetApi.removeVehicle(removing.id, reason)).then(() => { setRemoving(null); push('Removed.'); refresh(); })} /> : null}
    </div>
  );
}

function RosterTab({ institution, responders, canEdit, push, refresh }: { institution: { id: string; name: string }; responders: ResponderRow[]; canEdit: boolean; push: (m: string, tone?: 'ok' | 'error') => void; refresh: () => void }) {
  const [editingShift, setEditingShift] = useState<ShiftRow | { at: Date; responderId?: string } | null>(null);
  const [key, setKey] = useState(0);
  return (
    <>
      <RosterBoard key={key} institutions={[institution]} responders={responders} onAdd={(at, responderId) => { if (canEdit) setEditingShift({ at, responderId }); }} onEdit={s => { if (canEdit) setEditingShift(s); }} onChanged={() => { push('Saved.'); refresh(); }} onError={m => push(m, 'error')} />
      {editingShift ? <ShiftDialog seed={editingShift} institutions={[institution]} responders={responders} onClose={() => setEditingShift(null)} onDone={() => { setEditingShift(null); push('Saved.'); setKey(k => k + 1); refresh(); }} /> : null}
    </>
  );
}

function RulesTab({ institution, rules, canEdit, push, refresh }: { institution: { id: string; name: string }; rules: EscalationRuleRow[]; canEdit: boolean; push: (m: string, tone?: 'ok' | 'error') => void; refresh: () => void }) {
  const { t } = useTheme();
  const [editing, setEditing] = useState<EscalationRuleRow | 'new' | null>(null);
  const [removing, setRemoving] = useState<EscalationRuleRow | null>(null);
  return (
    <Card pad={0}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.5, flex: 1, minWidth: 260 }}>Nothing escalates on its own until a rule says so. These are the rules written for this institution; rules written for everybody apply as well and are kept under <Link to="/emergency/fleet">Fleet</Link>. Every rule names who approved its timing.</div>
        {canEdit ? <Button size="sm" tone="primary" onClick={() => setEditing('new')}>Add a rule</Button> : null}
      </div>
      {rules.length === 0 ? <div style={{ padding: 18, fontSize: 12.5, color: t.textSubtle }}>No rule written for this institution.</div> : (
        <Table head={['Rule', 'Applies to', 'When', 'Then', 'Approved by', 'Fired', '']}>
          {rules.map(r => (
            <Row key={r.id}>
              <Cell><strong>{r.name}</strong>{!r.active ? <> <Pill tone="neutral">Off</Pill></> : null}</Cell>
              <Cell>{[r.sectorCode, r.severity ? SEVERITY[r.severity] : null].filter(Boolean).join(' · ') || 'any sector, any severity'}</Cell>
              <Cell>{ESCALATION_TRIGGER[r.trigger]} <span style={{ color: t.textSubtle }}>after {r.afterMinutes} min</span></Cell>
              <Cell>{ESCALATION_ACTION[r.action]}{r.action > 1 ? <span style={{ color: t.textSubtle }}> · level {r.level}</span> : null}</Cell>
              <Cell>{r.approvedBy}<div style={{ fontSize: 11.5, color: t.textSubtle }}>{r.approvedOn ? fmtDate(r.approvedOn) : ''}</div></Cell>
              <Cell>{r.timesFired}{r.lastFiredAt ? <div style={{ fontSize: 11.5, color: t.textSubtle }}>last {fmtDateTime(r.lastFiredAt)}</div> : null}</Cell>
              <Cell>{canEdit ? <div style={{ display: 'flex', gap: 4 }}><Button size="sm" tone="subtle" onClick={() => setEditing(r)}>Edit</Button><Button size="sm" tone="danger" onClick={() => setRemoving(r)}>Remove</Button></div> : null}</Cell>
            </Row>
          ))}
        </Table>
      )}
      {editing ? <RuleDialog existing={editing === 'new' ? null : editing} institutions={[institution]} onClose={() => setEditing(null)} onDone={() => { setEditing(null); push('Saved.'); refresh(); }} /> : null}
      {removing ? <NoteDialog title={`Remove ${removing.name}`} hint="Why." verb="Remove" danger onClose={() => setRemoving(null)} onSave={reason => fleetApi.removeRule(removing.id, reason).then(() => { setRemoving(null); push('Removed.'); refresh(); })} /> : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ codes */

function CodesTab({ detail, codes, canEdit, push, refresh }: { detail: InstitutionDetail; codes: RegistrationCodeRow[]; canEdit: boolean; push: (m: string, tone?: 'ok' | 'error') => void; refresh: () => void }) {
  const { t } = useTheme();
  const [issuing, setIssuing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ label: '', grant: 1, maxUses: 1, expiresInDays: 90 });
  const [copied, setCopied] = useState<string | null>(null);
  const [showSpent, setShowSpent] = useState(false);
  const shown = codes.filter(c => showSpent || c.usable);
  const GRANT: Record<number, string> = { 1: 'Dispatcher', 2: 'Supervisor' };
  const selectStyle = { width: '100%', padding: '9px 10px', borderRadius: 10, border: `1px solid ${t.borderStrong}`, background: t.surfaceMuted, color: t.text, fontFamily: 'inherit', fontSize: 13 } as const;
  const issue = () => {
    setBusy(true);
    emergencyApi.issueCode({ sectorId: detail.row.sectorId, institutionId: detail.row.id, label: form.label || null, grant: form.grant, maxUses: form.maxUses, expiresInDays: form.expiresInDays || null })
      .then(row => { push(`Code ${row.code} issued.`); setIssuing(false); refresh(); }).catch(caught => push(err(caught, 'Could not issue a code.'), 'error')).finally(() => setBusy(false));
  };
  const copy = (code: string) => { try { void navigator.clipboard.writeText(code); setCopied(code); window.setTimeout(() => setCopied(null), 1500); } catch { /* on screen */ } };
  return (
    <Card pad={0}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.5, flex: 1, minWidth: 260 }}>A code lets the people who run this institution's stations register them from the app or the website — name, pin, numbers — and puts them on the station's desk at once. The station stays a draft until you verify it. Codes issued for the whole {detail.row.sectorName} category are listed too.</div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: t.textMuted }}><input type="checkbox" checked={showSpent} onChange={e => setShowSpent(e.target.checked)} /> spent and withdrawn</label>
        {canEdit ? <Button size="sm" tone="primary" onClick={() => setIssuing(v => !v)}>{issuing ? 'Cancel' : 'Issue a code'}</Button> : null}
      </div>
      {issuing ? (
        <div style={{ padding: 16, borderBottom: `1px solid ${t.border}`, background: t.surfaceMuted }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <Field label="Label" hint="For your eye only."><Input value={form.label} onChange={v => setForm({ ...form, label: v })} placeholder="Western Area divisions" /></Field>
            <Field label="Makes the person a"><select value={form.grant} onChange={e => setForm({ ...form, grant: Number(e.target.value) })} style={selectStyle}><option value={1}>Dispatcher — works their station's desk</option><option value={2}>Supervisor — runs the institution's desk</option></select></Field>
            <Field label="Stations it may register" hint="0 for no limit."><Input type="number" value={String(form.maxUses)} onChange={v => setForm({ ...form, maxUses: Math.max(0, Number(v) || 0) })} /></Field>
            <Field label="Expires in days" hint="0 for never."><Input type="number" value={String(form.expiresInDays)} onChange={v => setForm({ ...form, expiresInDays: Math.max(0, Number(v) || 0) })} /></Field>
          </div>
          <Actions><Button tone="primary" disabled={busy} onClick={issue}>{busy ? 'Issuing…' : 'Issue'}</Button></Actions>
        </div>
      ) : null}
      {shown.length === 0 ? <div style={{ padding: 18, fontSize: 12.5, color: t.textSubtle }}>No {showSpent ? '' : 'live '}code for this institution.</div> : (
        <div style={{ display: 'grid', gap: 8, padding: 12 }}>
          {shown.map(row => (
            <div key={row.id} style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <code style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1, color: row.usable ? t.text : t.textSubtle, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{row.code}</code>
                <Button size="sm" tone="subtle" onClick={() => copy(row.code)}>{copied === row.code ? 'Copied' : 'Copy'}</Button>
                {row.usable ? <Pill tone="success">Live</Pill> : row.active ? <Pill tone="neutral">Spent</Pill> : <Pill tone="danger">Withdrawn</Pill>}
                <Pill tone="info">{GRANT[row.grant] ?? 'Dispatcher'}</Pill>
                {row.institutionId === null ? <Pill tone="neutral">Whole category</Pill> : null}
                <span style={{ flex: 1 }} />
                {row.usable && canEdit ? <Button size="sm" tone="danger" disabled={busy} onClick={() => { setBusy(true); emergencyApi.revokeCode(row.id).then(() => { push(`${row.code} withdrawn.`); refresh(); }).catch(caught => push(err(caught, 'Could not withdraw it.'), 'error')).finally(() => setBusy(false)); }}>Withdraw</Button> : null}
              </div>
              <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 5 }}>{row.label ? `${row.label} · ` : ''}used {row.uses}{row.maxUses ? ` of ${row.maxUses}` : ''}{row.expiresAt ? ` · expires ${fmtDateTime(row.expiresAt)}` : ' · never expires'}{row.issuedByName ? ` · issued by ${row.issuedByName}` : ''} · {fmtDate(row.issuedAt)}</div>
              {row.registrations.length > 0 ? <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>{row.registrations.map(r => <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, flexWrap: 'wrap' }}><strong>{r.facilityName}</strong><span style={{ color: t.textMuted }}>{r.personName}{r.personPhone ? ` · ${r.personPhone}` : ''} · {fmtDateTime(r.registeredAt)}</span>{r.facilityVerified ? <Pill tone="success">Verified</Pill> : <Pill tone="warning">Awaiting verification</Pill>}</div>)}</div> : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ activity */

function ActivityTab({ rows }: { rows: AuditEntry[] | null }) {
  const { t } = useTheme();
  if (!rows) return <Loading />;
  return (
    <Card pad={0}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, fontSize: 12.5, color: t.textMuted }}>What anybody changed about this institution, its stations, its desk and its roll — newest first. The full trail, with filters, is under <Link to="/audit">Audit</Link>.</div>
      {rows.length === 0 ? <div style={{ padding: 18, fontSize: 12.5, color: t.textSubtle }}>Nothing on the trail mentions this institution yet.</div> : (
        <Table head={['When', 'Who', 'What', 'Severity']}>
          {rows.map(r => (
            <Row key={r.id}>
              <Cell mono>{fmtDateTime(r.at)}</Cell>
              <Cell><strong>{r.actorName}</strong></Cell>
              <Cell>{r.summary}{r.reason ? <div style={{ fontSize: 11.5, color: t.textSubtle }}>“{r.reason}”</div> : null}<div style={{ fontSize: 11, color: t.textSubtle }}>{r.actionLabel}</div></Cell>
              <Cell><Pill tone={r.severity >= 3 ? 'danger' : r.severity === 2 ? 'warning' : 'neutral'}>{r.severityLabel}</Pill></Cell>
            </Row>
          ))}
        </Table>
      )}
    </Card>
  );
}

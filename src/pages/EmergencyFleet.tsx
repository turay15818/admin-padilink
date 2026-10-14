/**
 * The fleet: who can be sent, what they go in, and when a slow desk is escalated.
 *
 * <p>Three tabs over one page. Responders and vehicles belong to an institution and are
 * managed by Vacancy's national desk or by that institution's supervisor — the service
 * decides which, and a supervisor never sees another institution's roll. Escalation rules
 * carry the name of the person who approved the timing; the form will not save without it,
 * because a timing nobody put their name to is the platform making policy.</p>
 *
 * <p>A responder's status is their own claim from their phone. The console shows it, with how
 * long ago they said it, and never sets it — except "verified", which is the institution's
 * word that this person is theirs.</p>
 */
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  Actions, Button, Card, Cell, ErrorNote, Field, Input, Loading, Modal, PageHeader, Pill, Row, Table, Textarea, Toasts, fmtDate, fmtDateTime, useToasts,
} from '../components/ui';
import {
  AMBULANCE_LEVEL, ESCALATION_ACTION, ESCALATION_TRIGGER, RESPONDER_ROLE, RESPONDER_STATUS, SEVERITY, VEHICLE_KIND, VEHICLE_STATUS,
  deskApi, emergencyApi, fleetApi,
  type EscalationRuleRow, type FleetSummary, type ResponderRow, type RosterResponse, type ShiftRow, type VehicleRow,
} from '../api/emergency';
import { NoteDialog } from './EmergencyDirectory';
import type { AdminIdentity } from '../api/admin';

type Tab = 'responders' | 'vehicles' | 'rules' | 'roster';
export type Institution = { id: string; name: string };

const err = (caught: unknown, fallback: string) => (caught instanceof Error ? caught.message : fallback);

const SKILL_CHOICES = [
  'emergency', 'trauma', 'maternity', 'paediatric', 'burns', 'mentalhealth', 'surgery', 'blood', 'icu', 'ambulance',
  'police.general', 'police.traffic', 'police.domestic', 'police.child', 'police.criminal',
  'fire.structural', 'fire.vehicle', 'fire.trapped', 'fire.hazmat',
  'disaster.flood', 'disaster.landslide', 'disaster.shelter', 'rescue.water', 'rescue.rope',
];

export function EmergencyFleet({ identity }: { identity: AdminIdentity }) {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [tab, setTab] = useState<Tab>('responders');
  const [summary, setSummary] = useState<FleetSummary | null>(null);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [responders, setResponders] = useState<ResponderRow[] | null>(null);
  const [vehicles, setVehicles] = useState<VehicleRow[] | null>(null);
  const [rules, setRules] = useState<EscalationRuleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingResponder, setEditingResponder] = useState<ResponderRow | 'new' | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<VehicleRow | 'new' | null>(null);
  const [editingRule, setEditingRule] = useState<EscalationRuleRow | 'new' | null>(null);
  const [removing, setRemoving] = useState<{ kind: Tab; id: string; label: string } | null>(null);
  const [parking, setParking] = useState<VehicleRow | null>(null);
  const [editingShift, setEditingShift] = useState<ShiftRow | { at: Date; responderId?: string } | null>(null);
  void identity;

  const load = useCallback(() => {
    Promise.all([fleetApi.summary(), fleetApi.responders(), fleetApi.vehicles(), fleetApi.rules()])
      .then(([s, r, v, ru]) => { setSummary(s); setResponders(r.responders); setVehicles(v.vehicles); setRules(ru.rules); setError(null); })
      .catch((caught: unknown) => setError(err(caught, 'Could not load the fleet.')));
    // The institution list is a national-permission read. A supervisor gets their own
    // institution from the desk instead, which is the only one they may write to anyway.
    emergencyApi.searchInstitutions({ pageSize: 200 })
      .then(page => setInstitutions(page.items.map(i => ({ id: i.id, name: i.name }))))
      .catch(() => deskApi.access().then(a => setInstitutions(a.institutionId && a.institutionName ? [{ id: a.institutionId, name: a.institutionName }] : [])).catch(() => setInstitutions([])));
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!summary || !responders || !vehicles || !rules) return <Loading />;

  const tabStyle = (active: boolean) => ({
    padding: '7px 12px', borderRadius: 9, border: `1px solid ${active ? t.brand : t.border}`, background: active ? t.brandSoft : 'transparent',
    color: active ? t.brand : t.textMuted, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
  } as const);

  const tile = (label: string, value: string | number, tone?: string) => (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: '10px 14px', minWidth: 120 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: tone ?? t.text, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{value}</div>
    </div>
  );

  const removeNow = (reason: string) => {
    if (!removing) return Promise.resolve();
    const work = removing.kind === 'responders' ? fleetApi.removeResponder(removing.id, reason)
      : removing.kind === 'vehicles' ? fleetApi.removeVehicle(removing.id, reason)
      : fleetApi.removeRule(removing.id, reason);
    return work.then(() => { setRemoving(null); push('Removed.'); load(); });
  };

  return (
    <>
      <PageHeader
        title="Fleet"
        subtitle="Responders, vehicles and escalation rules — per institution. A responder's status is their own word from their phone."
        action={(
          <div style={{ display: 'flex', gap: 6 }}>
            {tab === 'responders' ? <Button tone="primary" onClick={() => setEditingResponder('new')}>Add a responder</Button> : null}
            {tab === 'vehicles' ? <Button tone="primary" onClick={() => setEditingVehicle('new')}>Add a vehicle</Button> : null}
            {tab === 'rules' ? <Button tone="primary" onClick={() => setEditingRule('new')}>Add a rule</Button> : null}
            {tab === 'roster' ? <Button tone="primary" onClick={() => setEditingShift({ at: nextHour() })}>Add a shift</Button> : null}
          </div>
        )}
      />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {tile('Responders', summary.responders)}
        {tile('On duty', summary.onDuty, summary.onDuty > 0 ? t.success : undefined)}
        {tile('Free now', summary.free)}
        {tile('Vehicles', summary.vehicles)}
        {tile('Vehicles free', summary.vehiclesFree)}
        {tile('Out on assignments', summary.openAssignments, summary.openAssignments > 0 ? t.warning : undefined)}
        {tile('Rules', summary.rules)}
        {tile('Rostered now', summary.rosteredNow)}
        {tile('Rostered, not on', summary.rosteredNotOn, summary.rosteredNotOn > 0 ? t.danger : undefined)}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button type="button" style={tabStyle(tab === 'responders')} onClick={() => setTab('responders')}>Responders</button>
        <button type="button" style={tabStyle(tab === 'vehicles')} onClick={() => setTab('vehicles')}>Vehicles</button>
        <button type="button" style={tabStyle(tab === 'rules')} onClick={() => setTab('rules')}>Escalation rules</button>
        <button type="button" style={tabStyle(tab === 'roster')} onClick={() => setTab('roster')}>Roster</button>
      </div>

      {tab === 'roster' ? (
        <RosterBoard institutions={institutions} responders={responders} onAdd={(at, responderId) => setEditingShift({ at, responderId })} onEdit={setEditingShift} onChanged={() => { push('Saved.'); load(); }} onError={m => push(m, 'error')} />
      ) : null}

      {tab === 'responders' ? (
        <Card pad={0}>
          {responders.length === 0 ? (
            <div style={{ padding: 18, fontSize: 12.5, color: t.textMuted, lineHeight: 1.6 }}>
              Nobody on the roll yet. A responder is an ordinary Vacancy account, added here by their institution's supervisor and verified before a desk can send them.
            </div>
          ) : (
            <Table head={['Who', 'Institution', 'Role · skills', 'Status', 'Verified', 'Position', '']}>
              {responders.map(r => (
                <Row key={r.id}>
                  <Cell><strong>{r.name}</strong><div style={{ fontSize: 11.5, color: t.textSubtle }}>{r.phone ?? r.email}{r.employeeNumber ? ` · ${r.employeeNumber}` : ''}</div></Cell>
                  <Cell>{r.institutionName}<div style={{ fontSize: 11.5, color: t.textSubtle }}>{[r.facilityName, r.unitName].filter(Boolean).join(' · ') || 'Whole institution'}</div></Cell>
                  <Cell>{RESPONDER_ROLE[r.role]}<div style={{ fontSize: 11.5, color: t.textSubtle }}>{r.skills.join(', ') || '—'}</div></Cell>
                  <Cell>
                    <Pill tone={r.status === 2 ? 'success' : r.status === 1 || r.status === 8 ? 'neutral' : 'warning'}>{RESPONDER_STATUS[r.status]}</Pill>
                    <div style={{ fontSize: 11.5, color: t.textSubtle }}>since {fmtDateTime(r.statusChangedAt)}{r.openAssignments ? ` · ${r.openAssignments} live` : ''}</div>
                  </Cell>
                  <Cell>{r.verified ? <Pill tone="success">Verified</Pill> : <Pill tone="warning">Not verified</Pill>}{!r.active ? <> <Pill tone="neutral">Inactive</Pill></> : null}</Cell>
                  <Cell>{r.shareLocation ? (r.locationAgeMinutes === null ? 'Sharing, nothing yet' : `Seen ${r.locationAgeMinutes === 0 ? 'just now' : `${r.locationAgeMinutes} min ago`}`) : 'Not sharing'}</Cell>
                  <Cell><div style={{ display: 'flex', gap: 4 }}><Button size="sm" tone="subtle" onClick={() => setEditingResponder(r)}>Edit</Button><Button size="sm" tone="danger" onClick={() => setRemoving({ kind: 'responders', id: r.id, label: r.name })}>Remove</Button></div></Cell>
                </Row>
              ))}
            </Table>
          )}
        </Card>
      ) : null}

      {tab === 'vehicles' ? (
        <Card pad={0}>
          {vehicles.length === 0 ? (
            <div style={{ padding: 18, fontSize: 12.5, color: t.textMuted, lineHeight: 1.6 }}>No vehicles yet. A call sign is what the radio calls it; the rest is what the desk needs to choose one.</div>
          ) : (
            <Table head={['Call sign', 'Institution', 'Kind', 'Status', 'Inspection', '']}>
              {vehicles.map(v => (
                <Row key={v.id}>
                  <Cell><strong>{v.callSign}</strong><div style={{ fontSize: 11.5, color: t.textSubtle }}>{v.registration ?? '—'}{v.equipment ? ` · ${v.equipment}` : ''}</div></Cell>
                  <Cell>{v.institutionName}<div style={{ fontSize: 11.5, color: t.textSubtle }}>{[v.facilityName, v.unitName].filter(Boolean).join(' · ') || 'Whole institution'}</div></Cell>
                  <Cell>{VEHICLE_KIND[v.kind]}<div style={{ fontSize: 11.5, color: t.textSubtle }}>{v.kind === 1 ? AMBULANCE_LEVEL[v.ambulanceLevel] : v.capacity ? `carries ${v.capacity}` : ''}</div></Cell>
                  <Cell>
                    <Pill tone={v.status === 1 ? 'success' : v.status >= 6 ? 'neutral' : 'warning'}>{VEHICLE_STATUS[v.status]}</Pill>
                    <div style={{ fontSize: 11.5, color: t.textSubtle }}>since {fmtDateTime(v.statusChangedAt)}{v.gpsEnabled ? ' · own GPS' : ''}</div>
                  </Cell>
                  <Cell>{v.nextInspectionOn ? <span style={{ color: v.inspectionDue ? t.warning : t.text, fontWeight: v.inspectionDue ? 700 : 400 }}>{v.inspectionDue ? 'Due ' : 'Next '}{fmtDate(v.nextInspectionOn)}</span> : '—'}</Cell>
                  <Cell><div style={{ display: 'flex', gap: 4 }}>
                    <Button size="sm" tone="subtle" onClick={() => setEditingVehicle(v)}>Edit</Button>
                    <Button size="sm" tone="subtle" onClick={() => setParking(v)}>{v.status >= 6 ? 'Back in service' : 'Out of service'}</Button>
                    <Button size="sm" tone="danger" onClick={() => setRemoving({ kind: 'vehicles', id: v.id, label: v.callSign })}>Remove</Button>
                  </div></Cell>
                </Row>
              ))}
            </Table>
          )}
        </Card>
      ) : null}

      {tab === 'rules' ? (
        <Card pad={0}>
          <div style={{ padding: '12px 18px 0', fontSize: 12.5, color: t.textMuted, lineHeight: 1.6 }}>
            Nothing escalates on its own until a rule says so. A rule fires once per incident, on the minute it is due, and writes who approved the timing on the timeline.
          </div>
          {rules.length === 0 ? (
            <div style={{ padding: 18, fontSize: 12.5, color: t.textSubtle }}>No rules yet.</div>
          ) : (
            <Table head={['Rule', 'Applies to', 'When', 'Then', 'Approved by', 'Fired', '']}>
              {rules.map(r => (
                <Row key={r.id}>
                  <Cell><strong>{r.name}</strong>{!r.active ? <> <Pill tone="neutral">Off</Pill></> : null}</Cell>
                  <Cell>{r.institutionName ?? <Pill tone="info">Everybody</Pill>}<div style={{ fontSize: 11.5, color: t.textSubtle }}>{[r.sectorCode, r.severity ? SEVERITY[r.severity] : null].filter(Boolean).join(' · ') || 'any sector, any severity'}</div></Cell>
                  <Cell>{ESCALATION_TRIGGER[r.trigger]} <span style={{ color: t.textSubtle }}>after {r.afterMinutes} min</span></Cell>
                  <Cell>{ESCALATION_ACTION[r.action]}{r.action > 1 ? <span style={{ color: t.textSubtle }}> · level {r.level}</span> : null}</Cell>
                  <Cell>{r.approvedBy}<div style={{ fontSize: 11.5, color: t.textSubtle }}>{r.approvedOn ? fmtDate(r.approvedOn) : ''}</div></Cell>
                  <Cell>{r.timesFired}{r.lastFiredAt ? <div style={{ fontSize: 11.5, color: t.textSubtle }}>last {fmtDateTime(r.lastFiredAt)}</div> : null}</Cell>
                  <Cell><div style={{ display: 'flex', gap: 4 }}><Button size="sm" tone="subtle" onClick={() => setEditingRule(r)}>Edit</Button><Button size="sm" tone="danger" onClick={() => setRemoving({ kind: 'rules', id: r.id, label: r.name })}>Remove</Button></div></Cell>
                </Row>
              ))}
            </Table>
          )}
        </Card>
      ) : null}

      {editingResponder ? <ResponderDialog existing={editingResponder === 'new' ? null : editingResponder} institutions={institutions} onClose={() => setEditingResponder(null)} onDone={() => { setEditingResponder(null); push('Saved.'); load(); }} /> : null}
      {editingVehicle ? <VehicleDialog existing={editingVehicle === 'new' ? null : editingVehicle} institutions={institutions} onClose={() => setEditingVehicle(null)} onDone={() => { setEditingVehicle(null); push('Saved.'); load(); }} /> : null}
      {editingRule ? <RuleDialog existing={editingRule === 'new' ? null : editingRule} institutions={institutions} onClose={() => setEditingRule(null)} onDone={() => { setEditingRule(null); push('Saved.'); load(); }} /> : null}
      {editingShift ? <ShiftDialog seed={editingShift} institutions={institutions} responders={responders} onClose={() => setEditingShift(null)} onDone={() => { setEditingShift(null); push('Saved.'); load(); }} /> : null}
      {parking ? (
        <NoteDialog title={parking.status >= 6 ? `${parking.callSign} back in service` : `${parking.callSign} out of service`} hint={parking.status >= 6 ? 'It becomes available to the desk again.' : 'Why — a gearbox, an inspection. It cannot be sent until it is back.'} verb={parking.status >= 6 ? 'Back in service' : 'Out of service'}
          onClose={() => setParking(null)} onSave={note => fleetApi.vehicleStatus(parking.id, parking.status >= 6 ? 1 : 7, note).then(() => { setParking(null); push('Done.'); load(); }).catch((caught: unknown) => push(err(caught, 'Could not change it.'), 'error'))} />
      ) : null}
      {removing ? <NoteDialog title={`Remove ${removing.label}`} hint="Why. The row is kept with the reason; anything they were sent to stays on the record." verb="Remove" danger onClose={() => setRemoving(null)} onSave={removeNow} /> : null}
      <Toasts toasts={toasts} />
    </>
  );
}

/* ------------------------------------------------------------------ dialogs */

function useSelectStyle() {
  const { t } = useTheme();
  return { width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${t.borderStrong}`, background: t.surfaceMuted, color: t.text, fontFamily: 'inherit', fontSize: 13.5 } as const;
}

function usePlaces(institutionId: string) {
  const [facilities, setFacilities] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!institutionId) { setFacilities([]); return; }
    emergencyApi.getInstitution(institutionId).then(d => setFacilities(d.facilityRows.map(f => ({ id: f.id, name: f.name })))).catch(() => setFacilities([]));
  }, [institutionId]);
  return facilities;
}

export function ResponderDialog({ existing, institutions, onClose, onDone }: { existing: ResponderRow | null; institutions: Institution[]; onClose: () => void; onDone: () => void }) {
  const { t } = useTheme();
  const selectStyle = useSelectStyle();
  const [lookup, setLookup] = useState('');
  const [institutionId, setInstitutionId] = useState(existing?.institutionId ?? institutions[0]?.id ?? '');
  const [facilityId, setFacilityId] = useState(existing?.facilityId ?? '');
  const [role, setRole] = useState(existing?.role ?? 1);
  const [skills, setSkills] = useState<string[]>(existing?.skills ?? []);
  const [employeeNumber, setEmployeeNumber] = useState(existing?.employeeNumber ?? '');
  const [certification, setCertification] = useState(existing?.certification ?? '');
  const [expires, setExpires] = useState(existing?.certificationExpiresOn ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [radius, setRadius] = useState(String(existing?.responseRadiusKm ?? 25));
  const [verified, setVerified] = useState(existing?.verified ?? false);
  const [active, setActive] = useState(existing?.active ?? true);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const facilities = usePlaces(institutionId);

  const toggle = (code: string) => setSkills(s => (s.includes(code) ? s.filter(x => x !== code) : [...s, code]));

  const save = () => {
    setBusy(true); setError(null);
    fleetApi.saveResponder({
      id: existing?.id ?? null, userId: existing?.userId ?? null, userLookup: existing ? null : lookup.trim(),
      institutionId, facilityId: facilityId || null, role, skills, employeeNumber: employeeNumber || null,
      certification: certification || null, certificationExpiresOn: expires || null, phone: phone || null,
      responseRadiusKm: Number(radius) || 25, verified, notes: notes || null, active,
    }).then(onDone).catch((caught: unknown) => setError(err(caught, 'That did not save.'))).finally(() => setBusy(false));
  };

  return (
    <Modal title={existing ? `Edit ${existing.name}` : 'Add a responder'} onClose={onClose} width={560}>
      {!existing ? <Field label="Who" hint="The e-mail or phone number of an existing Vacancy account. The console does not create accounts."><Input value={lookup} onChange={setLookup} autoFocus placeholder="musa@nems.gov.sl" /></Field> : null}
      <Field label="Institution"><select value={institutionId} disabled={!!existing} onChange={e => { setInstitutionId(e.target.value); setFacilityId(''); }} style={selectStyle}>{institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
      <Field label="Station" hint="Where they are based. Empty means anywhere in the institution."><select value={facilityId} onChange={e => setFacilityId(e.target.value)} style={selectStyle}><option value="">Whole institution</option>{facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
      <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr' }}>
        <Field label="Role"><select value={role} onChange={e => setRole(Number(e.target.value))} style={selectStyle}>{Object.entries(RESPONDER_ROLE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Employee number"><Input value={employeeNumber} onChange={setEmployeeNumber} /></Field>
        <Field label="Phone the desk rings" hint="Empty uses the account's number."><Input value={phone} onChange={setPhone} /></Field>
        <Field label="Usual radius, km" hint="Advisory. A desk may still send them further."><Input value={radius} onChange={setRadius} /></Field>
        <Field label="Certification"><Input value={certification} onChange={setCertification} placeholder="EMT-B" /></Field>
        <Field label="Expires"><Input value={expires} onChange={setExpires} type="date" /></Field>
      </div>
      <Field label="Skills" hint="Capability codes. A desk sees 'can handle it' when a skill matches what the situation asks for.">
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {SKILL_CHOICES.map(code => (
            <button key={code} type="button" onClick={() => toggle(code)} style={{ fontFamily: 'inherit', fontSize: 12, padding: '4px 9px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${skills.includes(code) ? t.brand : t.border}`, background: skills.includes(code) ? t.brandSoft : 'transparent', color: skills.includes(code) ? t.brand : t.textMuted, fontWeight: 600 }}>{code}</button>
          ))}
        </div>
      </Field>
      <Field label="Notes"><Textarea value={notes} onChange={setNotes} rows={2} /></Field>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: t.text, marginBottom: 8, cursor: 'pointer' }}><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} /> Verified — this institution confirms this person is theirs. A desk cannot send anyone unverified.</label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: t.text, marginBottom: 12, cursor: 'pointer' }}><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active</label>
      {error ? <ErrorNote message={error} /> : null}
      <Actions>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={busy || !institutionId || (!existing && lookup.trim().length < 3)} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
      </Actions>
    </Modal>
  );
}

export function VehicleDialog({ existing, institutions, onClose, onDone }: { existing: VehicleRow | null; institutions: Institution[]; onClose: () => void; onDone: () => void }) {
  const { t } = useTheme();
  const selectStyle = useSelectStyle();
  const [institutionId, setInstitutionId] = useState(existing?.institutionId ?? institutions[0]?.id ?? '');
  const [facilityId, setFacilityId] = useState(existing?.facilityId ?? '');
  const [kind, setKind] = useState(existing?.kind ?? 1);
  const [callSign, setCallSign] = useState(existing?.callSign ?? '');
  const [registration, setRegistration] = useState(existing?.registration ?? '');
  const [capacity, setCapacity] = useState(String(existing?.capacity ?? 0));
  const [level, setLevel] = useState(existing?.ambulanceLevel ?? 1);
  const [equipment, setEquipment] = useState(existing?.equipment ?? '');
  const [gps, setGps] = useState(existing?.gpsEnabled ?? false);
  const [last, setLast] = useState(existing?.lastInspectionOn ?? '');
  const [next, setNext] = useState(existing?.nextInspectionOn ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const facilities = usePlaces(institutionId);

  const save = () => {
    setBusy(true); setError(null);
    fleetApi.saveVehicle({
      id: existing?.id ?? null, institutionId, facilityId: facilityId || null, kind, callSign: callSign.trim(), registration: registration || null,
      capacity: Number(capacity) || 0, ambulanceLevel: kind === 1 ? level : 0, equipment: equipment || null, gpsEnabled: gps,
      lastInspectionOn: last || null, nextInspectionOn: next || null, notes: notes || null, active,
    }).then(onDone).catch((caught: unknown) => setError(err(caught, 'That did not save.'))).finally(() => setBusy(false));
  };

  return (
    <Modal title={existing ? `Edit ${existing.callSign}` : 'Add a vehicle'} onClose={onClose} width={540}>
      <Field label="Institution"><select value={institutionId} disabled={!!existing} onChange={e => { setInstitutionId(e.target.value); setFacilityId(''); }} style={selectStyle}>{institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
      <Field label="Station"><select value={facilityId} onChange={e => setFacilityId(e.target.value)} style={selectStyle}><option value="">Whole institution</option>{facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
      <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr' }}>
        <Field label="Call sign" hint="What the radio calls it."><Input value={callSign} onChange={setCallSign} autoFocus placeholder="Alpha 1" /></Field>
        <Field label="Registration"><Input value={registration} onChange={setRegistration} /></Field>
        <Field label="Kind"><select value={kind} onChange={e => setKind(Number(e.target.value))} style={selectStyle}>{Object.entries(VEHICLE_KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Carries" hint="People besides the crew."><Input value={capacity} onChange={setCapacity} /></Field>
        {kind === 1 ? <Field label="Ambulance level"><select value={level} onChange={e => setLevel(Number(e.target.value))} style={selectStyle}>{[1, 2, 3].map(v => <option key={v} value={v}>{AMBULANCE_LEVEL[v]}</option>)}</select></Field> : null}
        <Field label="Last inspection"><Input value={last} onChange={setLast} type="date" /></Field>
        <Field label="Next inspection"><Input value={next} onChange={setNext} type="date" /></Field>
      </div>
      <Field label="Equipment aboard"><Input value={equipment} onChange={setEquipment} placeholder="Oxygen, stretcher, defibrillator" /></Field>
      <Field label="Notes"><Textarea value={notes} onChange={setNotes} rows={2} /></Field>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: t.text, marginBottom: 8, cursor: 'pointer' }}><input type="checkbox" checked={gps} onChange={e => setGps(e.target.checked)} /> Reports its own position. Otherwise its dot is its responder's phone.</label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: t.text, marginBottom: 12, cursor: 'pointer' }}><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active</label>
      {error ? <ErrorNote message={error} /> : null}
      <Actions>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={busy || !institutionId || !callSign.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
      </Actions>
    </Modal>
  );
}

export function RuleDialog({ existing, institutions, onClose, onDone }: { existing: EscalationRuleRow | null; institutions: Institution[]; onClose: () => void; onDone: () => void }) {
  const { t } = useTheme();
  const selectStyle = useSelectStyle();
  const [institutionId, setInstitutionId] = useState(existing?.institutionId ?? institutions[0]?.id ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [sector, setSector] = useState(existing?.sectorCode ?? '');
  const [severity, setSeverity] = useState(existing?.severity ?? 0);
  const [trigger, setTrigger] = useState(existing?.trigger ?? 1);
  const [after, setAfter] = useState(String(existing?.afterMinutes ?? 10));
  const [action, setAction] = useState(existing?.action ?? 1);
  const [level, setLevel] = useState(existing?.level ?? 1);
  const [approvedBy, setApprovedBy] = useState(existing?.approvedBy ?? '');
  const [approvedOn, setApprovedOn] = useState(existing?.approvedOn ?? '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setBusy(true); setError(null);
    fleetApi.saveRule({
      id: existing?.id ?? null, institutionId: institutionId || null, sectorCode: sector || null, severity: severity || null, name: name.trim(),
      trigger, afterMinutes: Number(after) || 10, action, level, approvedBy: approvedBy.trim(), approvedOn: approvedOn || null, active,
    }).then(onDone).catch((caught: unknown) => setError(err(caught, 'That did not save.'))).finally(() => setBusy(false));
  };

  const sentence = `${severity ? SEVERITY[severity] : 'Any'} ${sector ? `${sector} ` : ''}incident: if ${ESCALATION_TRIGGER[trigger]?.toLowerCase()} after ${after || '?'} minutes, ${ESCALATION_ACTION[action]?.toLowerCase()}${action > 1 ? ` (level ${level})` : ''}.`;

  return (
    <Modal title={existing ? `Edit “${existing.name}”` : 'Add an escalation rule'} onClose={onClose} width={560}>
      <div style={{ fontSize: 12.5, color: t.text, background: t.surfaceMuted, border: `1px solid ${t.border}`, borderRadius: 10, padding: '8px 12px', marginBottom: 12, lineHeight: 1.5 }}>{sentence}</div>
      <Field label="Name"><Input value={name} onChange={setName} autoFocus placeholder="P1 unacknowledged" /></Field>
      <Field label="Applies to" hint="'Everybody' can only be written by Vacancy's national desk."><select value={institutionId} onChange={e => setInstitutionId(e.target.value)} style={selectStyle}><option value="">Everybody (national)</option>{institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
      <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr' }}>
        <Field label="Sector" hint="Empty: any."><Input value={sector} onChange={setSector} placeholder="health" /></Field>
        <Field label="Severity"><select value={severity} onChange={e => setSeverity(Number(e.target.value))} style={selectStyle}><option value={0}>Any</option>{Object.entries(SEVERITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Waits for"><select value={trigger} onChange={e => setTrigger(Number(e.target.value))} style={selectStyle}>{Object.entries(ESCALATION_TRIGGER).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="After, minutes"><Input value={after} onChange={setAfter} /></Field>
        <Field label="Then"><select value={action} onChange={e => setAction(Number(e.target.value))} style={selectStyle}>{Object.entries(ESCALATION_ACTION).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        {action > 1 ? <Field label="Raise to level"><select value={level} onChange={e => setLevel(Number(e.target.value))} style={selectStyle}>{[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}</select></Field> : null}
        <Field label="Approved by" hint="Name and position. Required — a timing nobody put their name to is the platform making policy."><Input value={approvedBy} onChange={setApprovedBy} placeholder="Dr Conteh, Medical Director" /></Field>
        <Field label="Approved on"><Input value={approvedOn} onChange={setApprovedOn} type="date" /></Field>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: t.text, marginBottom: 12, cursor: 'pointer' }}><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active</label>
      {error ? <ErrorNote message={error} /> : null}
      <Actions>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={busy || !name.trim() || !approvedBy.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
      </Actions>
    </Modal>
  );
}

/* ------------------------------------------------------------------ the roster */

const DAY_MS = 86_400_000;
function nextHour() { const d = new Date(); d.setUTCMinutes(0, 0, 0); d.setUTCHours(d.getUTCHours() + 1); return d; }
function startOfWeek(d: Date) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; }
const hhmm = (iso: string) => new Date(iso).toISOString().slice(11, 16);
const dayWord = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * The week, as a grid: one column per day, one row per responder, each shift a bar labelled
 * with its hours. Reads top-down like a duty sheet pinned on a wall, which is what it replaces.
 * A shift the responder is not on for (rostered but their switch says off) is drawn in the
 * warning colour; one they confirmed carries a tick.
 */
export function RosterBoard({ institutions, responders, onAdd, onEdit, onChanged, onError }: {
  institutions: Institution[]; responders: ResponderRow[];
  onAdd: (at: Date, responderId?: string) => void; onEdit: (shift: ShiftRow) => void; onChanged: () => void; onError: (message: string) => void;
}) {
  const { t } = useTheme();
  const selectStyle = useSelectStyle();
  const [institutionId, setInstitutionId] = useState(institutions[0]?.id ?? '');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [roster, setRoster] = useState<RosterResponse | null>(null);
  const [removing, setRemoving] = useState<ShiftRow | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { if (!institutionId && institutions[0]) setInstitutionId(institutions[0].id); }, [institutions, institutionId]);
  useEffect(() => {
    if (!institutionId) return;
    const to = new Date(weekStart.getTime() + 7 * DAY_MS);
    fleetApi.roster({ institutionId, from: weekStart.toISOString(), to: to.toISOString() }).then(setRoster).catch((caught: unknown) => onError(err(caught, 'Could not load the roster.')));
  }, [institutionId, weekStart, tick, onError]);
  const refresh = () => setTick(n => n + 1);

  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS));
  const people = responders.filter(r => r.institutionId === institutionId);
  const byPerson = new Map<string, ShiftRow[]>();
  for (const s of roster?.shifts ?? []) byPerson.set(s.responderId, [...(byPerson.get(s.responderId) ?? []), s]);
  const onDay = (list: ShiftRow[], day: Date) => list.filter(s => new Date(s.startsAt).getTime() < day.getTime() + DAY_MS && new Date(s.endsAt).getTime() > day.getTime());
  const today = startOfWeek(new Date()).getTime() === weekStart.getTime();

  const remove = (whole: boolean) => {
    if (!removing) return;
    fleetApi.removeShift(removing.id, whole).then(() => { setRemoving(null); onChanged(); refresh(); }).catch((caught: unknown) => onError(err(caught, 'Could not remove it.')));
  };

  return (
    <Card pad={0}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${t.border}`, flexWrap: 'wrap' }}>
        <select value={institutionId} onChange={e => setInstitutionId(e.target.value)} style={{ ...selectStyle, width: 'auto', minWidth: 220 }}>
          {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Button tone="ghost" onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * DAY_MS))}>‹</Button>
          <span style={{ fontSize: 13, fontWeight: 700, minWidth: 180, textAlign: 'center' }}>{dayWord(days[0])} – {dayWord(days[6])}{today ? ' · this week' : ''}</span>
          <Button tone="ghost" onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * DAY_MS))}>›</Button>
          {!today ? <Button tone="ghost" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</Button> : null}
        </div>
        <span style={{ flex: 1 }} />
        {roster ? <span style={{ fontSize: 12.5, color: roster.rosteredNotOn > 0 ? t.danger : t.textMuted, fontWeight: 700 }}>{roster.rosteredNow} rostered now{roster.rosteredNotOn > 0 ? ` · ${roster.rosteredNotOn} not on` : ''}</span> : null}
      </div>
      {people.length === 0 ? (
        <div style={{ padding: 18, fontSize: 12.5, color: t.textMuted, lineHeight: 1.6 }}>Nobody on this institution's roll yet. Add responders first, then roster them.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 14px', fontSize: 11, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.4, width: 180 }}>Who</th>
                {days.map(d => {
                  const isToday = new Date().toISOString().slice(0, 10) === d.toISOString().slice(0, 10);
                  return <th key={d.toISOString()} style={{ padding: '8px 6px', fontSize: 11, fontWeight: 800, color: isToday ? t.brand : t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.4, borderLeft: `1px solid ${t.border}` }}>{dayWord(d)}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {people.map(p => {
                const mine = byPerson.get(p.id) ?? [];
                const off = p.status === 1 || p.status === 8;
                return (
                  <tr key={p.id} style={{ borderTop: `1px solid ${t.border}` }}>
                    <td style={{ padding: '8px 14px', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                      <div style={{ fontSize: 11.5, color: off ? t.textSubtle : t.success }}>{RESPONDER_ROLE[p.role]} · {RESPONDER_STATUS[p.status]}</div>
                    </td>
                    {days.map(d => {
                      const here = onDay(mine, d);
                      return (
                        <td key={d.toISOString()} style={{ padding: 4, verticalAlign: 'top', borderLeft: `1px solid ${t.border}`, minWidth: 92 }}>
                          <div style={{ display: 'grid', gap: 3 }}>
                            {here.map(s => {
                              const gap = s.when === 'now' && (s.responderStatus === 1 || s.responderStatus === 8);
                              const colour = s.when === 'past' ? t.textSubtle : gap ? t.danger : s.when === 'now' ? t.success : t.brand;
                              return (
                                <div key={s.id} role="button" tabIndex={0} data-shift={s.id} onClick={() => onEdit(s)} onKeyDown={e => { if (e.key === 'Enter') onEdit(s); }} title={`${s.label ?? 'Shift'} ${hhmm(s.startsAt)}–${hhmm(s.endsAt)}${s.facilityName ? ` · ${s.facilityName}` : ''}${gap ? ' · rostered but not on' : ''}${s.note ? `\n${s.note}` : ''}`} style={{
                                  borderLeft: `3px solid ${colour}`, background: t.surfaceMuted, borderRadius: 6, padding: '4px 6px', fontSize: 11.5, cursor: 'pointer', lineHeight: 1.3,
                                }}>
                                  <div style={{ fontWeight: 800, color: s.when === 'past' ? t.textMuted : t.text, fontVariantNumeric: 'tabular-nums' }}>{hhmm(s.startsAt)}–{hhmm(s.endsAt)}{s.confirmed ? ' ✓' : ''}</div>
                                  <div style={{ color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label ?? ''}{gap ? ' · not on' : ''}</div>
                                  <button type="button" onClick={e => { e.stopPropagation(); setRemoving(s); }} style={{ fontFamily: 'inherit', fontSize: 10.5, border: 'none', background: 'transparent', color: t.textSubtle, cursor: 'pointer', padding: 0, marginTop: 2 }}>remove</button>
                                </div>
                              );
                            })}
                            <button type="button" onClick={() => { const at = new Date(d); at.setUTCHours(8, 0, 0, 0); onAdd(at, p.id); }} style={{ fontFamily: 'inherit', fontSize: 11, border: `1px dashed ${t.border}`, background: 'transparent', color: t.textSubtle, borderRadius: 6, padding: '3px 0', cursor: 'pointer' }}>+</button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {removing ? (
        <Modal title={`Remove ${removing.responderName}'s shift`} onClose={() => setRemoving(null)} width={440}>
          <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6 }}>{dayWord(new Date(removing.startsAt))} {hhmm(removing.startsAt)}–{hhmm(removing.endsAt)}{removing.label ? ` · ${removing.label}` : ''}.{removing.seriesId ? ' It is one of a weekly series.' : ''}</div>
          <Actions>
            <Button tone="ghost" onClick={() => setRemoving(null)}>Keep it</Button>
            {removing.seriesId ? <Button tone="danger" onClick={() => remove(true)}>This and every later one</Button> : null}
            <Button tone="danger" onClick={() => remove(false)}>Just this one</Button>
          </Actions>
        </Modal>
      ) : null}
    </Card>
  );
}

export function ShiftDialog({ seed, institutions, responders, onClose, onDone }: {
  seed: ShiftRow | { at: Date; responderId?: string }; institutions: Institution[]; responders: ResponderRow[]; onClose: () => void; onDone: () => void;
}) {
  const selectStyle = useSelectStyle();
  const existing = 'id' in seed ? seed : null;
  const seededResponder = existing ? responders.find(r => r.id === existing.responderId) : 'responderId' in seed && seed.responderId ? responders.find(r => r.id === seed.responderId) : undefined;
  const startAt = existing ? new Date(existing.startsAt) : seed instanceof Object && 'at' in seed ? seed.at : nextHour();
  const endAt = existing ? new Date(existing.endsAt) : new Date(startAt.getTime() + 8 * 3_600_000);
  const [institutionId, setInstitutionId] = useState(existing?.institutionId ?? seededResponder?.institutionId ?? institutions[0]?.id ?? '');
  const [responderId, setResponderId] = useState(existing?.responderId ?? seededResponder?.id ?? '');
  const [facilityId, setFacilityId] = useState(existing?.facilityId ?? seededResponder?.facilityId ?? '');
  const [date, setDate] = useState(startAt.toISOString().slice(0, 10));
  const [start, setStart] = useState(startAt.toISOString().slice(11, 16));
  const [end, setEnd] = useState(endAt.toISOString().slice(11, 16));
  const [label, setLabel] = useState(existing?.label ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [repeat, setRepeat] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const facilities = usePlaces(institutionId);
  const people = responders.filter(r => r.institutionId === institutionId && r.active);

  const save = () => {
    const startsAt = new Date(`${date}T${start}:00Z`);
    let endsAt = new Date(`${date}T${end}:00Z`);
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + DAY_MS); // overnight: 22:00–06:00 ends tomorrow
    setBusy(true); setError(null);
    fleetApi.saveShift({
      id: existing?.id ?? null, institutionId, facilityId: facilityId || null, responderId,
      startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), label: label || null, note: note || null, repeatWeeks: existing ? 0 : Number(repeat) || 0,
    }).then(onDone).catch((caught: unknown) => setError(err(caught, 'That did not save.'))).finally(() => setBusy(false));
  };

  return (
    <Modal title={existing ? `Move ${existing.responderName}'s shift` : 'Add a shift'} onClose={onClose} width={520}>
      <Field label="Institution"><select value={institutionId} disabled={!!existing} onChange={e => { setInstitutionId(e.target.value); setResponderId(''); setFacilityId(''); }} style={selectStyle}>{institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
      <Field label="Who"><select value={responderId} disabled={!!existing} onChange={e => setResponderId(e.target.value)} style={selectStyle}><option value="">Pick a responder</option>{people.map(r => <option key={r.id} value={r.id}>{r.name} · {RESPONDER_ROLE[r.role]}</option>)}</select></Field>
      <Field label="Station" hint="Where the shift is. Empty means the whole institution — a control room."><select value={facilityId} onChange={e => setFacilityId(e.target.value)} style={selectStyle}><option value="">Whole institution</option>{facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
      <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr 1fr' }}>
        <Field label="Date"><Input value={date} onChange={setDate} type="date" /></Field>
        <Field label="Starts"><Input value={start} onChange={setStart} type="time" /></Field>
        <Field label="Ends" hint="Earlier than the start means the next day."><Input value={end} onChange={setEnd} type="time" /></Field>
      </div>
      <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr' }}>
        <Field label="Label"><Input value={label} onChange={setLabel} placeholder="Night" /></Field>
        {!existing ? <Field label="Repeat weekly" hint="How many more weeks, up to 12. A week that clashes is skipped."><Input value={repeat} onChange={v => setRepeat(v.replace(/\D/g, ''))} /></Field> : null}
      </div>
      <Field label="Note"><Textarea value={note} onChange={setNote} rows={2} /></Field>
      {error ? <ErrorNote message={error} /> : null}
      <Actions>
        <Button tone="ghost" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={busy || !responderId || !institutionId} onClick={save}>{existing ? 'Move it' : 'Add the shift'}</Button>
      </Actions>
    </Modal>
  );
}


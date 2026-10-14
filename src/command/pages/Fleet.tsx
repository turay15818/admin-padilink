/**
 * The roll: responders and vehicles.
 *
 * Who the institution can send and what it can send them in, with their switch state
 * now. Supervisors add, edit and remove; dispatchers read. A responder is somebody with a
 * Vacancy account — the desk finds them by e-mail or phone and never creates the account,
 * so the phone the responder carries is the one that gets the assignment.
 */
import { useEffect, useMemo, useState } from 'react';
import { AMBULANCE_LEVEL, RESPONDER_ROLE, RESPONDER_STATUS, VEHICLE_KIND, VEHICLE_STATUS, commandApi, errorWords, type CommandFacilityOption, type FleetSummary, type ResponderRow, type VehicleRow } from '../api';
import { T } from '../theme';
import { Actions, Btn, Check, Empty, ErrorLine, Field, Input, Loading, Modal, Pill, Segmented, Select, Table, Td, Textarea, Th, Tile, Toasts, fmtDate, useToasts } from '../ui';
import { useCommand } from '../useCommand';

const SKILL_CHOICES = [
  'emergency', 'trauma', 'maternity', 'paediatric', 'burns', 'mentalhealth', 'surgery', 'blood', 'icu', 'ambulance',
  'police.general', 'police.traffic', 'police.domestic', 'police.child', 'police.criminal',
  'fire.structural', 'fire.vehicle', 'fire.trapped', 'fire.hazmat',
  'disaster.flood', 'disaster.landslide', 'disaster.shelter', 'rescue.water', 'rescue.rope',
];

const statusTone = (s: number) => (s === 2 ? 'good' : s === 1 || s === 8 ? 'neutral' : 'warn');

export function Fleet() {
  const { tick, access, institutionId } = useCommand();
  const canWrite = access.role === 2 || access.national;
  const [tab, setTab] = useState<'responders' | 'vehicles'>('responders');
  const [summary, setSummary] = useState<FleetSummary | null>(null);
  const [responders, setResponders] = useState<ResponderRow[] | null>(null);
  const [vehicles, setVehicles] = useState<VehicleRow[] | null>(null);
  const [facilities, setFacilities] = useState<CommandFacilityOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [onDuty, setOnDuty] = useState(false);
  const [editing, setEditing] = useState<{ kind: 'responder'; row: ResponderRow | null } | { kind: 'vehicle'; row: VehicleRow | null } | null>(null);
  const [removing, setRemoving] = useState<{ kind: 'responder' | 'vehicle'; id: string; name: string } | null>(null);
  const [parking, setParking] = useState<VehicleRow | null>(null);
  const { toasts, push } = useToasts();

  const load = () => {
    Promise.all([commandApi.fleet(), commandApi.responders(false, institutionId), commandApi.vehicles(institutionId)])
      .then(([s, r, v]) => { setSummary(s); setResponders(r.responders); setVehicles(v.vehicles); setError(null); })
      .catch(caught => setError(errorWords(caught, 'Could not load the roll.')));
  };
  useEffect(load, [tick, institutionId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { commandApi.people(institutionId).then(p => setFacilities(p.facilities)).catch(() => setFacilities([])); }, [institutionId]);

  const needle = search.trim().toLowerCase();
  const shownResponders = useMemo(() => (responders ?? []).filter(r => (!onDuty || (r.status !== 1 && r.status !== 8)) && (!needle || `${r.name} ${r.phone ?? ''} ${r.facilityName ?? ''} ${r.skills.join(' ')} ${RESPONDER_ROLE[r.role]}`.toLowerCase().includes(needle))), [responders, onDuty, needle]);
  const shownVehicles = useMemo(() => (vehicles ?? []).filter(v => !needle || `${v.callSign} ${v.registration ?? ''} ${v.facilityName ?? ''} ${VEHICLE_KIND[v.kind]}`.toLowerCase().includes(needle)), [vehicles, needle]);

  const remove = (reason: string) => {
    if (!removing) return;
    const work = removing.kind === 'responder' ? commandApi.removeResponder(removing.id, reason) : commandApi.removeVehicle(removing.id, reason);
    work.then(() => { setRemoving(null); push('Removed.'); load(); }).catch(caught => push(errorWords(caught, 'Could not remove it.'), 'error'));
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
        <Tile label="Responders" value={summary?.responders ?? '—'} note={summary ? `${summary.onDuty} on duty` : undefined} />
        <Tile label="Free now" value={summary?.free ?? '—'} tone={summary && summary.free > 0 ? T.good : undefined} note="on duty and not sent" />
        <Tile label="Vehicles" value={summary?.vehicles ?? '—'} note={summary ? `${summary.vehiclesFree} free` : undefined} />
        <Tile label="Out now" value={summary?.openAssignments ?? '—'} tone={summary && summary.openAssignments > 0 ? T.warn : undefined} note="open assignments" />
        <Tile label="Rostered now" value={summary?.rosteredNow ?? '—'} note={summary && summary.rosteredNotOn > 0 ? <span style={{ color: T.warn }}>{summary.rosteredNotOn} not on</span> : 'all on'} />
      </div>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Segmented value={tab} onChange={setTab} options={[['responders', <>Responders <b className="cc-num">{responders?.length ?? 0}</b></>], ['vehicles', <>Vehicles <b className="cc-num">{vehicles?.length ?? 0}</b></>]]} />
        {tab === 'responders' ? <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, color: T.muted, cursor: 'pointer' }}><input type="checkbox" checked={onDuty} onChange={e => setOnDuty(e.target.checked)} style={{ accentColor: T.accent }} /> on duty only</label> : null}
        <span style={{ flex: 1 }} />
        <div style={{ width: 240 }}><Input value={search} onChange={setSearch} placeholder="Name, phone, station, skill…" /></div>
        {canWrite && institutionId ? <Btn tone="primary" size="sm" onClick={() => setEditing(tab === 'responders' ? { kind: 'responder', row: null } : { kind: 'vehicle', row: null })}>{tab === 'responders' ? 'Add responder' : 'Add vehicle'}</Btn> : null}
      </div>

      <div style={{ border: `1px solid ${T.line}`, borderRadius: T.radius, background: T.surface, overflow: 'hidden' }}>
        {tab === 'responders' ? (
          !responders ? <Loading /> : shownResponders.length === 0 ? <Empty>{responders.length === 0 ? 'Nobody on the roll yet.' : 'Nobody matches.'}</Empty> : (
            <Table minWidth={900}>
              <thead><tr><Th>Name</Th><Th>Role</Th><Th>Station</Th><Th>Status</Th><Th>Skills</Th><Th>Phone</Th><Th>Certified</Th><Th right>Open</Th>{canWrite ? <Th /> : null}</tr></thead>
              <tbody>
                {shownResponders.map(r => (
                  <tr key={r.id} className="cc-row">
                    <Td><b>{r.name}</b>{!r.verified ? <Pill tone="warn"> unverified</Pill> : null}{!r.active ? <Pill> inactive</Pill> : null}<div style={{ fontSize: 11, color: T.subtle }}>{r.employeeNumber ?? ''}{r.locationAgeMinutes !== null ? ` · seen ${r.locationAgeMinutes === 0 ? 'now' : `${r.locationAgeMinutes}m ago`}` : r.shareLocation ? '' : ' · no position'}</div></Td>
                    <Td muted>{RESPONDER_ROLE[r.role]}</Td>
                    <Td muted>{r.facilityName ?? 'whole institution'}{r.unitName ? ` · ${r.unitName}` : ''}</Td>
                    <Td><Pill tone={statusTone(r.status)} dot>{RESPONDER_STATUS[r.status]}</Pill></Td>
                    <Td><div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: 240 }}>{r.skills.map(s => <span key={s} style={{ fontSize: 10.5, padding: '1px 6px', borderRadius: 4, background: T.surface3, color: T.muted }}>{s}</span>)}</div></Td>
                    <Td mono muted>{r.phone ?? '—'}</Td>
                    <Td muted>{r.certification ? <>{r.certification}{r.certificationExpiresOn ? <span style={{ color: new Date(r.certificationExpiresOn) < new Date() ? T.bad : T.subtle }}> · {fmtDate(r.certificationExpiresOn)}</span> : null}</> : '—'}</Td>
                    <Td right mono>{r.openAssignments || <span style={{ color: T.subtle }}>0</span>}</Td>
                    {canWrite ? <Td right><div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}><Btn size="xs" onClick={() => setEditing({ kind: 'responder', row: r })}>Edit</Btn><Btn size="xs" tone="danger" onClick={() => setRemoving({ kind: 'responder', id: r.id, name: r.name })}>Remove</Btn></div></Td> : null}
                  </tr>
                ))}
              </tbody>
            </Table>
          )
        ) : (
          !vehicles ? <Loading /> : shownVehicles.length === 0 ? <Empty>{vehicles.length === 0 ? 'No vehicle on the fleet yet.' : 'Nothing matches.'}</Empty> : (
            <Table minWidth={860}>
              <thead><tr><Th>Call sign</Th><Th>Kind</Th><Th>Station</Th><Th>Status</Th><Th>Carries</Th><Th>Inspection</Th><Th right>Open</Th>{canWrite ? <Th /> : null}</tr></thead>
              <tbody>
                {shownVehicles.map(v => (
                  <tr key={v.id} className="cc-row">
                    <Td><b className="cc-num">{v.callSign}</b>{!v.active ? <Pill> inactive</Pill> : null}<div style={{ fontSize: 11, color: T.subtle }}>{v.registration ?? ''}{v.gpsEnabled ? ' · own GPS' : ''}</div></Td>
                    <Td muted>{VEHICLE_KIND[v.kind]}{v.kind === 1 ? <div style={{ fontSize: 11, color: T.subtle }}>{AMBULANCE_LEVEL[v.ambulanceLevel]?.split(' — ')[0]}</div> : null}</Td>
                    <Td muted>{v.facilityName ?? 'whole institution'}</Td>
                    <Td><Pill tone={v.status === 1 ? 'good' : v.status >= 6 ? 'neutral' : 'warn'} dot>{VEHICLE_STATUS[v.status]}</Pill></Td>
                    <Td mono muted>{v.capacity || '—'}</Td>
                    <Td muted>{v.nextInspectionOn ? <span style={{ color: v.inspectionDue ? T.warn : undefined }}>{fmtDate(v.nextInspectionOn)}{v.inspectionDue ? ' · due' : ''}</span> : '—'}</Td>
                    <Td right mono>{v.openAssignments || <span style={{ color: T.subtle }}>0</span>}</Td>
                    {canWrite ? <Td right><div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}><Btn size="xs" onClick={() => setParking(v)}>{v.status >= 6 ? 'Back in service' : 'Take out'}</Btn><Btn size="xs" onClick={() => setEditing({ kind: 'vehicle', row: v })}>Edit</Btn><Btn size="xs" tone="danger" onClick={() => setRemoving({ kind: 'vehicle', id: v.id, name: v.callSign })}>Remove</Btn></div></Td> : null}
                  </tr>
                ))}
              </tbody>
            </Table>
          )
        )}
      </div>

      {editing?.kind === 'responder' && institutionId ? <ResponderDialog existing={editing.row} institutionId={institutionId} facilities={facilities} onClose={() => setEditing(null)} onDone={() => { setEditing(null); push('Saved.'); load(); }} /> : null}
      {editing?.kind === 'vehicle' && institutionId ? <VehicleDialog existing={editing.row} institutionId={institutionId} facilities={facilities} onClose={() => setEditing(null)} onDone={() => { setEditing(null); push('Saved.'); load(); }} /> : null}
      {removing ? <ReasonModal title={`Remove ${removing.name}`} hint="They come off the roll. Open assignments stay on the record." verb="Remove" danger onClose={() => setRemoving(null)} onSave={remove} /> : null}
      {parking ? <ReasonModal title={parking.status >= 6 ? `${parking.callSign} back in service` : `Take ${parking.callSign} out of service`} hint={parking.status >= 6 ? 'It becomes available to send.' : 'Maintenance, a breakdown, a crash — say which.'} verb={parking.status >= 6 ? 'Back in service' : 'Take out'} required={parking.status < 6} onClose={() => setParking(null)} onSave={note => commandApi.vehicleStatus(parking.id, parking.status >= 6 ? 1 : 7, note).then(() => { setParking(null); push('Done.'); load(); }).catch(caught => push(errorWords(caught, 'Could not change it.'), 'error'))} /> : null}
      <Toasts toasts={toasts} />
    </div>
  );
}

export function ReasonModal({ title, hint, verb, required = true, danger, onClose, onSave }: { title: string; hint: string; verb: string; required?: boolean; danger?: boolean; onClose: () => void; onSave: (text: string) => void }) {
  const [text, setText] = useState('');
  return <Modal title={title} onClose={onClose}><Field label={required ? 'Why' : 'Note'} hint={hint}><Textarea value={text} onChange={setText} rows={2} /></Field><Actions><Btn onClick={onClose}>Cancel</Btn><Btn tone={danger ? 'danger' : 'primary'} disabled={required && !text.trim()} onClick={() => onSave(text.trim())}>{verb}</Btn></Actions></Modal>;
}

function ResponderDialog({ existing, institutionId, facilities, onClose, onDone }: { existing: ResponderRow | null; institutionId: string; facilities: CommandFacilityOption[]; onClose: () => void; onDone: () => void }) {
  const [lookup, setLookup] = useState('');
  const [facilityId, setFacilityId] = useState(existing?.facilityId ?? '');
  const [role, setRole] = useState(existing?.role ?? 1);
  const [skills, setSkills] = useState<string[]>(existing?.skills ?? []);
  const [employeeNumber, setEmployeeNumber] = useState(existing?.employeeNumber ?? '');
  const [certification, setCertification] = useState(existing?.certification ?? '');
  const [expires, setExpires] = useState(existing?.certificationExpiresOn ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [radius, setRadius] = useState(String(existing?.responseRadiusKm ?? 25));
  const [verified, setVerified] = useState(existing?.verified ?? true);
  const [active, setActive] = useState(existing?.active ?? true);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (code: string) => setSkills(s => (s.includes(code) ? s.filter(x => x !== code) : [...s, code]));
  const save = () => {
    setBusy(true); setError(null);
    commandApi.saveResponder({
      id: existing?.id ?? null, userId: existing?.userId ?? null, userLookup: existing ? null : lookup.trim(), institutionId, facilityId: facilityId || null, role, skills,
      employeeNumber: employeeNumber || null, certification: certification || null, certificationExpiresOn: expires || null, phone: phone || null,
      responseRadiusKm: Number(radius) || 25, verified, notes: notes || null, active,
    }).then(onDone).catch(caught => setError(errorWords(caught, 'That did not save.'))).finally(() => setBusy(false));
  };
  return (
    <Modal title={existing ? `Edit ${existing.name}` : 'Add a responder'} onClose={onClose} width={580}>
      {!existing ? <Field label="Who" hint="The e-mail or phone number of an existing Vacancy account — the phone they carry is the one that gets the assignment. Somebody with no account yet is added under People first."><Input value={lookup} onChange={setLookup} autoFocus placeholder="musa@nems.gov.sl or +232 76 …" /></Field> : null}
      <Field label="Station" hint="Where they are based. Empty means anywhere in the institution."><Select value={facilityId} onChange={setFacilityId}><option value="">Whole institution</option>{facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
      <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr' }}>
        <Field label="Role"><Select value={String(role)} onChange={v => setRole(Number(v))}>{Object.entries(RESPONDER_ROLE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Employee number"><Input value={employeeNumber} onChange={setEmployeeNumber} /></Field>
        <Field label="Phone the desk rings" hint="Empty uses the account's number."><Input value={phone} onChange={setPhone} mono /></Field>
        <Field label="Usual radius, km" hint="Advisory. A desk may still send them further."><Input value={radius} onChange={setRadius} mono /></Field>
        <Field label="Certification"><Input value={certification} onChange={setCertification} placeholder="EMT-B" /></Field>
        <Field label="Expires"><Input value={expires} onChange={setExpires} type="date" /></Field>
      </div>
      <Field label="Skills" hint="A desk sees 'can handle it' when a skill matches what the situation asks for.">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {SKILL_CHOICES.map(code => <button key={code} type="button" onClick={() => toggle(code)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, cursor: 'pointer', border: `1px solid ${skills.includes(code) ? T.accent : T.line2}`, background: skills.includes(code) ? T.accentSoft : 'transparent', color: skills.includes(code) ? T.accent : T.muted, fontWeight: 600 }}>{code}</button>)}
        </div>
      </Field>
      <Field label="Notes"><Textarea value={notes} onChange={setNotes} rows={2} /></Field>
      <Check checked={verified} onChange={setVerified}>Verified — this institution confirms this person is theirs. A desk cannot send anyone unverified.</Check>
      <Check checked={active} onChange={setActive}>Active</Check>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <Actions><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={busy || (!existing && lookup.trim().length < 3)} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn></Actions>
    </Modal>
  );
}

function VehicleDialog({ existing, institutionId, facilities, onClose, onDone }: { existing: VehicleRow | null; institutionId: string; facilities: CommandFacilityOption[]; onClose: () => void; onDone: () => void }) {
  const [facilityId, setFacilityId] = useState(existing?.facilityId ?? '');
  const [kind, setKind] = useState(existing?.kind ?? 1);
  const [callSign, setCallSign] = useState(existing?.callSign ?? '');
  const [registration, setRegistration] = useState(existing?.registration ?? '');
  const [capacity, setCapacity] = useState(String(existing?.capacity ?? 0));
  const [level, setLevel] = useState(existing?.ambulanceLevel || 1);
  const [equipment, setEquipment] = useState(existing?.equipment ?? '');
  const [gps, setGps] = useState(existing?.gpsEnabled ?? false);
  const [last, setLast] = useState(existing?.lastInspectionOn ?? '');
  const [next, setNext] = useState(existing?.nextInspectionOn ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    setBusy(true); setError(null);
    commandApi.saveVehicle({
      id: existing?.id ?? null, institutionId, facilityId: facilityId || null, kind, callSign: callSign.trim(), registration: registration || null, capacity: Number(capacity) || 0,
      ambulanceLevel: kind === 1 ? level : 0, equipment: equipment || null, gpsEnabled: gps, lastInspectionOn: last || null, nextInspectionOn: next || null, notes: notes || null, active,
    }).then(onDone).catch(caught => setError(errorWords(caught, 'That did not save.'))).finally(() => setBusy(false));
  };
  return (
    <Modal title={existing ? `Edit ${existing.callSign}` : 'Add a vehicle'} onClose={onClose} width={540}>
      <Field label="Station"><Select value={facilityId} onChange={setFacilityId}><option value="">Whole institution</option>{facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
      <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr' }}>
        <Field label="Call sign" hint="What the radio calls it."><Input value={callSign} onChange={setCallSign} autoFocus placeholder="Alpha 1" mono /></Field>
        <Field label="Registration"><Input value={registration} onChange={setRegistration} mono /></Field>
        <Field label="Kind"><Select value={String(kind)} onChange={v => setKind(Number(v))}>{Object.entries(VEHICLE_KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Carries" hint="People besides the crew."><Input value={capacity} onChange={setCapacity} mono /></Field>
        {kind === 1 ? <Field label="Ambulance level" span={2}><Select value={String(level)} onChange={v => setLevel(Number(v))}>{[1, 2, 3].map(v => <option key={v} value={v}>{AMBULANCE_LEVEL[v]}</option>)}</Select></Field> : null}
        <Field label="Last inspection"><Input value={last} onChange={setLast} type="date" /></Field>
        <Field label="Next inspection"><Input value={next} onChange={setNext} type="date" /></Field>
      </div>
      <Field label="Equipment aboard"><Input value={equipment} onChange={setEquipment} placeholder="Oxygen, stretcher, defibrillator" /></Field>
      <Field label="Notes"><Textarea value={notes} onChange={setNotes} rows={2} /></Field>
      <Check checked={gps} onChange={setGps}>Reports its own position. Otherwise its dot is its responder's phone.</Check>
      <Check checked={active} onChange={setActive}>Active</Check>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <Actions><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={busy || !callSign.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn></Actions>
    </Modal>
  );
}

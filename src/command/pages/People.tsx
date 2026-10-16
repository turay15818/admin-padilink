/**
 * Who may sign in to this institution's command centre.
 *
 * A supervisor's screen. Find a colleague who already has a Vacancy account by their exact
 * e-mail or phone, or start an account for one who has none — created unusable, finished
 * by the person through a link only their inbox holds, so nobody on the desk ever holds a
 * colleague's password. Roles are three: a dispatcher works incidents, a supervisor also
 * manages the desk, view-only reads. The desk cannot lock itself out: nobody removes or
 * demotes themselves, and the last supervisor stays.
 */
import { useEffect, useMemo, useState } from 'react';
import { LEVEL_WORDS, commandApi, deskRoleWords, errorWords, type CommandLookupResult, type CommandPeople, type CommandPerson } from '../api';
import { T } from '../theme';
import { Actions, Btn, Check, Empty, ErrorLine, Eyebrow, Field, Input, Loading, Modal, Panel, Pill, Segmented, Select, Table, Td, Th, Tile, Toasts, age, fmtDate, useToasts } from '../ui';
import { useCommand } from '../useCommand';
import { ReasonModal } from './Fleet';

export function People() {
  const { tick, access, institutionId } = useCommand();
  const [data, setData] = useState<CommandPeople | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CommandPerson | null>(null);
  const [removing, setRemoving] = useState<CommandPerson | null>(null);
  const [search, setSearch] = useState('');
  const [rung, setRung] = useState<number>(0);
  const [local, setLocal] = useState(0);
  const { toasts, push } = useToasts();

  useEffect(() => { setData(null); commandApi.people(institutionId).then(d => { setData(d); setError(null); }).catch(caught => setError(errorWords(caught, 'Could not load the desk.'))); }, [tick, local, institutionId]);
  const reload = () => setLocal(n => n + 1);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.people ?? []).filter(p => (rung === 0 || p.level === rung) && (!needle || `${p.name} ${p.email ?? ''} ${p.title ?? ''} ${p.facilityName ?? ''} ${p.districtName ?? ''}`.toLowerCase().includes(needle)));
  }, [data, search, rung]);
  const byLevel = useMemo(() => [1, 2, 3].map(l => [l, data?.people.filter(p => p.level === l).length ?? 0] as [number, number]).filter(([, n]) => n > 0), [data]);
  const supervisors = data?.people.filter(p => p.role === 2 && p.active).length ?? 0;
  const awaiting = data?.people.filter(p => p.awaitingSetup).length ?? 0;
  const seenToday = data?.people.filter(p => p.lastSeenAt && Date.now() - new Date(p.lastSeenAt).getTime() < 86_400_000).length ?? 0;

  const resend = (p: CommandPerson) => commandApi.resendSetup(p.id).then(r => push(r.message)).catch(caught => push(errorWords(caught, 'Could not send it.'), 'error'));
  if (access.national && !institutionId) return <Panel><Empty>A national desk manages people one institution at a time — pick one at the top of the rail.</Empty></Panel>;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        <Tile label="On the desk" value={data?.people.filter(p => p.active).length ?? '—'} note={data ? `${data.people.length - data.people.filter(p => p.active).length} inactive` : undefined} />
        <Tile label="Administrators" value={supervisors} tone={supervisors === 0 ? T.warn : undefined} note={data ? `${data.people.filter(p => p.role === 2 && p.active && p.level === 3).length} headquarters · ${data.people.filter(p => p.role === 2 && p.active && p.level === 2).length} district · ${data.people.filter(p => p.role === 2 && p.active && p.level === 1).length} station` : undefined} />
        <Tile label="Awaiting setup" value={awaiting} tone={awaiting > 0 ? T.warn : T.subtle} note="have not chosen a password" />
        <Tile label="Seen today" value={seenToday} tone={seenToday > 0 ? T.good : undefined} note="opened the desk in 24 h" />
      </div>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      {data ? <Standing data={data} /> : null}
      <Panel flush title={<>{data?.institutionName ?? 'Desk'} · people</>} action={<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {byLevel.length > 1 ? <Segmented size="xs" value={rung} onChange={setRung} options={[[0, 'Everyone'], ...byLevel.map(([l, n]) => [l, `${LEVEL_WORDS[l]} · ${n}`] as [number, string])]} /> : null}
        <div style={{ width: 220 }}><Input value={search} onChange={setSearch} placeholder="Name, title, place…" /></div>
        {data?.canManage ? <Btn size="sm" tone="primary" onClick={() => setAdding(true)}>Add a person</Btn> : null}
      </div>}>
        {!data ? <Loading /> : rows.length === 0 ? <Empty>{data.people.length === 0 ? 'Nobody on the desk yet.' : 'Nobody matches.'}</Empty> : (
          <Table minWidth={820}>
            <thead><tr><Th>Name</Th><Th>Role</Th><Th>Stands at</Th><Th>Reaches them</Th><Th>Account</Th><Th>Last on the desk</Th><Th>Since</Th>{data.canManage ? <Th /> : null}</tr></thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id} className="cc-row" style={{ opacity: p.active ? 1 : 0.55 }}>
                  <Td><b>{p.name}</b>{p.isMe ? <Pill tone="accent"> you</Pill> : null}{p.title ? <div style={{ fontSize: 11, color: T.subtle }}>{p.title}</div> : null}</Td>
                  <Td><Pill tone={p.role === 2 ? (p.level === 1 ? 'info' : 'accent') : p.role === 3 ? 'neutral' : 'good'}>{deskRoleWords(p.role, p.facilityId, p.level)}</Pill>{!p.active ? <Pill> inactive</Pill> : null}</Td>
                  <Td muted>{placeOf(p)}</Td>
                  <Td mono muted><div>{p.email ?? '—'}</div><div style={{ fontSize: 11 }}>{p.phone ?? ''}</div></Td>
                  <Td>{!p.canSignIn ? <Pill tone="bad" dot>no e-mail</Pill> : p.awaitingSetup ? <Pill tone="warn" dot>awaiting setup</Pill> : <Pill tone="good" dot>ready</Pill>}</Td>
                  <Td muted>{p.lastSeenAt ? <span className="cc-num">{age(Math.round((Date.now() - new Date(p.lastSeenAt).getTime()) / 60_000))} ago</span> : <span style={{ color: T.subtle }}>never</span>}</Td>
                  <Td muted>{fmtDate(p.addedAt)}</Td>
                  {data.canManage ? <Td right>{p.manageable ? <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    {p.awaitingSetup ? <Btn size="xs" onClick={() => void resend(p)}>Send link again</Btn> : null}
                    <Btn size="xs" onClick={() => setEditing(p)}>Edit</Btn>
                    {!p.isMe || access.national ? <Btn size="xs" tone="danger" onClick={() => setRemoving(p)}>Remove</Btn> : null}
                  </div> : <span style={{ fontSize: 11, color: T.subtle }}>not yours to change</span>}</Td> : null}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
      <div style={{ fontSize: 11.5, color: T.subtle, lineHeight: 1.5, maxWidth: 760 }}>
        A <b style={{ color: T.muted }}>dispatcher</b> works incidents on this desk. A <b style={{ color: T.muted }}>supervisor</b> also manages the roll, the roster, the stations and this list: at headquarters they are the head of administration and see the whole country, at a district command they run every station in that district, and at a station they run that station and the offices under it. Each rung appoints the one below it. <b style={{ color: T.muted }}>View only</b> reads everything and changes nothing, and never sees where a private incident is. Everybody signs in to the command centre with their e-mail — an account without one gets no code. Responders — the people who are sent — are a separate roll, under Fleet.
      </div>

      {adding && data ? <AddDialog data={data} onClose={() => setAdding(false)} onDone={m => { setAdding(false); push(m); reload(); }} /> : null}
      {editing && data ? <EditDialog data={data} person={editing} onClose={() => setEditing(null)} onDone={m => { setEditing(null); push(m); reload(); }} /> : null}
      {removing ? <ReasonModal title={`Remove ${removing.name} from the desk`} hint="They can no longer sign in to the command centre. Their Vacancy account is untouched." verb="Remove" required={false} danger onClose={() => setRemoving(null)} onSave={reason => commandApi.removePerson(removing.id, reason).then(() => { setRemoving(null); push('Removed.'); reload(); }).catch(caught => push(errorWords(caught, 'Could not remove them.'), 'error'))} /> : null}
      <Toasts toasts={toasts} />
    </div>
  );
}

function placeOf(p: CommandPerson): string {
  if (p.level === 1) return p.facilityName ?? 'a station';
  if (p.level === 2) return `${p.districtName ?? 'a'} district`;
  return 'Headquarters · nationwide';
}

function Standing({ data }: { data: CommandPeople }) {
  const words = data.level === 1 ? `You run ${data.managesFacilityName ?? 'your station'}'s desk: you appoint and manage the people at that station and the offices under it.`
    : data.level === 2 ? `You are the district command for ${data.managesDistrictName ?? 'your district'}: you appoint and manage every station's administrator and staff in the district. Headquarters appoints the district's own administrators.`
      : data.level === 4 ? 'You stand as Vacancy: you manage any institution, one at a time.'
        : 'You are headquarters: you appoint district administrators and see everybody, nationwide.';
  const above = data.above ?? [];
  return (
    <div style={{ display: 'grid', gap: 8, padding: '10px 12px', borderRadius: 8, background: T.surface2, border: `1px solid ${T.line}`, fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
      <div><b style={{ color: T.text }}>{LEVEL_WORDS[data.level] ?? 'Desk'}</b> · {words}</div>
      {above.length > 0 ? <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><span style={{ color: T.subtle }}>You answer to</span>{above.map((a, i) => <Pill key={`${a.name}-${i}`} tone="neutral">{a.name}{a.title ? ` · ${a.title}` : ''}{a.where ? ` · ${a.where}` : ''}</Pill>)}</div> : null}
    </div>
  );
}

type Placement = { level: number; setLevel: (l: number) => void; facilityId: string; setFacilityId: (f: string) => void; districtSlug: string; setDistrictSlug: (d: string) => void };

function RoleField({ data, role, setRole, title, setTitle, place, active, setActive, self, fixedPlace }: { data: CommandPeople; role: number; setRole: (r: number) => void; title: string; setTitle: (t: string) => void; place: Placement; active: boolean; setActive: (a: boolean) => void; self?: boolean; fixedPlace?: boolean }) {
  const levels = data.levels && data.levels.length > 0 ? data.levels : [{ level: 3, label: 'Headquarters', hint: '' }];
  const here = levels.find(l => l.level === place.level) ?? levels[0];
  const roleHint = role === 2
    ? (place.level === 1 ? "Runs that station's desk: its people, and the offices under it." : place.level === 2 ? "The district's administrator: appoints and manages every station in the district." : "Head of police administration: manages the whole country, every district and station.")
    : role === 3 ? "Reads everything in reach, changes nothing, never sees a private incident's location." : 'Works incidents: acknowledges, sends people, closes.';
  const stations = data.facilities;
  const districts = data.districts ?? [];
  return (<>
    {levels.length > 1 ? (
      <Field label="Stands at" hint={here.hint}>
        <Segmented value={place.level} onChange={place.setLevel} options={levels.map(l => [l.level, l.label] as [number, string])} />
      </Field>
    ) : null}
    <Field label="Role" hint={roleHint}>
      <Segmented value={role} onChange={setRole} options={[[1, 'Dispatcher'], [2, place.level === 1 ? 'Station administrator' : place.level === 2 ? 'District administrator' : 'Administrator'], [3, 'View only']]} />
    </Field>
    <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr' }}>
      <Field label="Title" hint="As the desk knows them."><Input value={title} onChange={setTitle} placeholder={place.level === 2 ? 'District commander' : 'Duty officer'} /></Field>
      {place.level === 1 ? (
        <Field label="Station" hint={fixedPlace ? 'A person is moved by removing and adding them again.' : 'The station, or an office under it. They see nothing outside it.'}>
          <Select value={place.facilityId} onChange={place.setFacilityId} disabled={fixedPlace}><option value="">Pick a station</option>{stations.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</Select>
        </Field>
      ) : place.level === 2 ? (
        <Field label="District" hint={fixedPlace ? 'A person is moved by removing and adding them again.' : 'They see every station in this district.'}>
          <Select value={place.districtSlug} onChange={place.setDistrictSlug} disabled={fixedPlace}><option value="">Pick a district</option>{districts.map(d => <option key={d.slug} value={d.slug}>{d.name} · {d.stations} {d.stations === 1 ? 'station' : 'stations'}</option>)}</Select>
        </Field>
      ) : <Field label="Reach" hint="Every district and station."><Input value="Nationwide" onChange={() => undefined} disabled /></Field>}
    </div>
    {!self ? <Check checked={active} onChange={setActive}>Active — can sign in</Check> : null}
  </>);
}

function usePlacement(data: CommandPeople, start?: { level: number; facilityId: string | null; districtSlug: string | null }): Placement & { ready: boolean; body: { facilityId: string | null; districtSlug: string | null } } {
  const first = data.levels && data.levels.length > 0 ? data.levels[0].level : data.level;
  const [level, setLevel] = useState(start?.level ?? first);
  const [facilityId, setFacilityId] = useState(start?.facilityId ?? (data.managesFacilityId && data.level === 1 ? data.managesFacilityId : ''));
  const [districtSlug, setDistrictSlug] = useState(start?.districtSlug ?? data.managesDistrictSlug ?? '');
  const ready = level === 1 ? Boolean(facilityId) : level === 2 ? Boolean(districtSlug) : true;
  return { level, setLevel, facilityId, setFacilityId, districtSlug, setDistrictSlug, ready, body: { facilityId: level === 1 ? facilityId || null : null, districtSlug: level === 2 ? districtSlug || null : null } };
}

function AddDialog({ data, onClose, onDone }: { data: CommandPeople; onClose: () => void; onDone: (message: string) => void }) {
  const [mode, setMode] = useState<'find' | 'new'>('find');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<CommandLookupResult | null>(null);
  const [looking, setLooking] = useState(false);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState(1);
  const [title, setTitle] = useState('');
  const place = usePlacement(data);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const look = () => {
    setLooking(true); setError(null); setFound(null);
    commandApi.lookup(query.trim(), data.institutionId).then(setFound).catch(caught => setError(errorWords(caught, 'Could not look that up.'))).finally(() => setLooking(false));
  };
  const save = () => {
    setBusy(true); setError(null);
    const body = mode === 'find'
      ? { userId: found?.userId ?? null, institutionId: data.institutionId, ...place.body, role, title: title || null, active }
      : { newAccount: { firstName: first.trim(), lastName: last.trim(), email: email.trim(), phone: phone.trim() || null }, institutionId: data.institutionId, ...place.body, role, title: title || null, active };
    commandApi.savePerson(body).then(r => onDone(r.message)).catch(caught => setError(errorWords(caught, 'That did not save.'))).finally(() => setBusy(false));
  };
  const ready = place.ready && (mode === 'find' ? Boolean(found?.found && !found.alreadyOnDesk) : Boolean(first.trim() && email.trim().includes('@')));

  return (
    <Modal title="Add a person to the desk" onClose={onClose} width={560}>
      <div style={{ marginBottom: 12 }}><Segmented value={mode} onChange={m => { setMode(m); setError(null); }} options={[['find', 'Has a Vacancy account'], ['new', 'Needs an account']]} /></div>
      {mode === 'find' ? (<>
        <Field label="Their e-mail address or phone number" hint="Exact — this is not a search. The desk finds the account; it does not browse them.">
          <div style={{ display: 'flex', gap: 6 }}><Input value={query} onChange={v => { setQuery(v); setFound(null); }} autoFocus placeholder="fatmata@nems.gov.sl or +232 76 …" /><Btn onClick={look} disabled={looking || query.trim().length < 3}>{looking ? '…' : 'Find'}</Btn></div>
        </Field>
        {found ? (
          <div style={{ padding: '8px 10px', borderRadius: 8, background: found.found ? (found.alreadyOnDesk ? T.warnSoft : T.goodSoft) : T.surface2, fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>
            {found.found ? <><b>{found.name}</b> <span style={{ color: T.muted }}>· {found.maskedEmail ?? 'no e-mail'} {found.maskedPhone ?? ''}</span><div style={{ color: found.alreadyOnDesk || !found.maskedEmail ? T.warn : T.good }}>{found.message}</div></> : <><div>{found.message}</div><Btn size="xs" tone="ghost" onClick={() => setMode('new')}>Start an account for them</Btn></>}
          </div>
        ) : null}
      </>) : (<>
        <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr' }}>
          <Field label="First name"><Input value={first} onChange={setFirst} autoFocus /></Field>
          <Field label="Last name"><Input value={last} onChange={setLast} /></Field>
          <Field label="E-mail" hint="Where the setup link goes. It is the only way into the account."><Input value={email} onChange={setEmail} type="email" /></Field>
          <Field label="Phone"><Input value={phone} onChange={setPhone} mono /></Field>
        </div>
        <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.5, marginBottom: 12, padding: '8px 10px', borderRadius: 8, background: T.surface2 }}>The account is created without a usable password. They choose their own through the link, which works for fourteen days; nobody — not you, not Vacancy — can set it for them. Until they do, their row says <i>awaiting setup</i>.</div>
      </>)}
      <Eyebrow style={{ margin: '4px 0 8px' }}>On this desk</Eyebrow>
      <RoleField data={data} role={role} setRole={setRole} title={title} setTitle={setTitle} place={place} active={active} setActive={setActive} />
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <Actions><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={busy || !ready} onClick={save}>{busy ? 'Saving…' : mode === 'new' ? 'Create and send the link' : 'Add to the desk'}</Btn></Actions>
    </Modal>
  );
}

function EditDialog({ data, person, onClose, onDone }: { data: CommandPeople; person: CommandPerson; onClose: () => void; onDone: (message: string) => void }) {
  const [role, setRole] = useState(person.role);
  const [title, setTitle] = useState(person.title ?? '');
  const place = usePlacement(data, { level: person.level, facilityId: person.facilityId, districtSlug: person.districtSlug });
  const [active, setActive] = useState(person.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    setBusy(true); setError(null);
    commandApi.savePerson({ id: person.id, institutionId: data.institutionId, ...place.body, role, title: title || null, active }).then(r => onDone(r.message)).catch(caught => setError(errorWords(caught, 'That did not save.'))).finally(() => setBusy(false));
  };
  return (
    <Modal title={person.name} onClose={onClose} width={520}>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>{person.email ?? ''} {person.phone ?? ''}{person.awaitingSetup ? <span style={{ color: T.warn }}> · awaiting setup</span> : null}</div>
      <RoleField data={data} role={role} setRole={setRole} title={title} setTitle={setTitle} place={place} active={active} setActive={setActive} self={person.isMe} fixedPlace={person.isMe} />
      {person.isMe ? <div style={{ fontSize: 11.5, color: T.subtle, marginBottom: 8 }}>You cannot demote or deactivate yourself — another supervisor does that.</div> : null}
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <Actions><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={busy || !place.ready} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn></Actions>
    </Modal>
  );
}

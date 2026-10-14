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
import { commandApi, deskRoleWords, errorWords, type CommandLookupResult, type CommandPeople, type CommandPerson } from '../api';
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
  const [local, setLocal] = useState(0);
  const { toasts, push } = useToasts();

  useEffect(() => { setData(null); commandApi.people(institutionId).then(d => { setData(d); setError(null); }).catch(caught => setError(errorWords(caught, 'Could not load the desk.'))); }, [tick, local, institutionId]);
  const reload = () => setLocal(n => n + 1);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.people ?? []).filter(p => !needle || `${p.name} ${p.email ?? ''} ${p.title ?? ''} ${p.facilityName ?? ''}`.toLowerCase().includes(needle));
  }, [data, search]);
  const supervisors = data?.people.filter(p => p.role === 2 && p.active).length ?? 0;
  const awaiting = data?.people.filter(p => p.awaitingSetup).length ?? 0;
  const seenToday = data?.people.filter(p => p.lastSeenAt && Date.now() - new Date(p.lastSeenAt).getTime() < 86_400_000).length ?? 0;

  const resend = (p: CommandPerson) => commandApi.resendSetup(p.id).then(r => push(r.message)).catch(caught => push(errorWords(caught, 'Could not send it.'), 'error'));
  if (access.national && !institutionId) return <Panel><Empty>A national desk manages people one institution at a time — pick one at the top of the rail.</Empty></Panel>;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        <Tile label="On the desk" value={data?.people.filter(p => p.active).length ?? '—'} note={data ? `${data.people.length - data.people.filter(p => p.active).length} inactive` : undefined} />
        <Tile label="Administrators" value={data?.people.filter(p => p.role === 2 && p.active && !p.facilityId).length ?? '—'} tone={supervisors <= 1 ? T.warn : undefined} note={supervisors <= 1 ? 'only one person manages — name a second' : `${supervisors} manage, incl. station supervisors`} />
        <Tile label="Awaiting setup" value={awaiting} tone={awaiting > 0 ? T.warn : T.subtle} note="have not chosen a password" />
        <Tile label="Seen today" value={seenToday} tone={seenToday > 0 ? T.good : undefined} note="opened the desk in 24 h" />
      </div>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      {data?.managesFacilityName ? <div style={{ fontSize: 12, color: T.muted, padding: '8px 12px', borderRadius: 8, background: T.surface2, border: `1px solid ${T.line}` }}>You run <b style={{ color: T.text }}>{data.managesFacilityName}</b>'s desk: you manage the people at that station and the offices under it. The institution's administrator manages the rest.</div> : null}
      <Panel flush title={<>{data?.institutionName ?? 'Desk'} · people</>} action={<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ width: 220 }}><Input value={search} onChange={setSearch} placeholder="Name, title, station…" /></div>
        {data?.canManage ? <Btn size="sm" tone="primary" onClick={() => setAdding(true)}>Add a person</Btn> : null}
      </div>}>
        {!data ? <Loading /> : rows.length === 0 ? <Empty>{data.people.length === 0 ? 'Nobody on the desk yet.' : 'Nobody matches.'}</Empty> : (
          <Table minWidth={820}>
            <thead><tr><Th>Name</Th><Th>Role</Th><Th>Station</Th><Th>Reaches them</Th><Th>Account</Th><Th>Last on the desk</Th><Th>Since</Th>{data.canManage ? <Th /> : null}</tr></thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id} className="cc-row" style={{ opacity: p.active ? 1 : 0.55 }}>
                  <Td><b>{p.name}</b>{p.isMe ? <Pill tone="accent"> you</Pill> : null}{p.title ? <div style={{ fontSize: 11, color: T.subtle }}>{p.title}</div> : null}</Td>
                  <Td><Pill tone={p.role === 2 ? (p.facilityId ? 'info' : 'accent') : p.role === 3 ? 'neutral' : 'good'}>{deskRoleWords(p.role, p.facilityId)}</Pill>{!p.active ? <Pill> inactive</Pill> : null}</Td>
                  <Td muted>{p.facilityName ?? 'whole institution'}</Td>
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
        A <b style={{ color: T.muted }}>dispatcher</b> works incidents on this desk. A <b style={{ color: T.muted }}>supervisor</b> also manages the roll, the roster, the stations and this list — bound to the whole institution they are its <b style={{ color: T.muted }}>administrator</b> and profile everybody; bound to one station they run that station and the offices under it. <b style={{ color: T.muted }}>View only</b> reads everything and changes nothing, and never sees where a private incident is. Everybody signs in to the command centre with their e-mail — an account without one gets no code. Responders — the people who are sent — are a separate roll, under Fleet.
      </div>

      {adding && data ? <AddDialog data={data} onClose={() => setAdding(false)} onDone={m => { setAdding(false); push(m); reload(); }} /> : null}
      {editing && data ? <EditDialog data={data} person={editing} onClose={() => setEditing(null)} onDone={m => { setEditing(null); push(m); reload(); }} /> : null}
      {removing ? <ReasonModal title={`Remove ${removing.name} from the desk`} hint="They can no longer sign in to the command centre. Their Vacancy account is untouched." verb="Remove" required={false} danger onClose={() => setRemoving(null)} onSave={reason => commandApi.removePerson(removing.id, reason).then(() => { setRemoving(null); push('Removed.'); reload(); }).catch(caught => push(errorWords(caught, 'Could not remove them.'), 'error'))} /> : null}
      <Toasts toasts={toasts} />
    </div>
  );
}

function RoleField({ role, setRole, title, setTitle, facilityId, setFacilityId, active, setActive, facilities, self }: { role: number; setRole: (r: number) => void; title: string; setTitle: (t: string) => void; facilityId: string; setFacilityId: (f: string) => void; active: boolean; setActive: (a: boolean) => void; facilities: CommandPeople['facilities']; self?: boolean }) {
  return (<>
    <Field label="Role" hint={role === 2 ? (facilityId ? 'Runs that station\'s desk: its people, and the offices under it.' : 'The institution\'s administrator: manages the roll, the roster, the stations and everybody on this desk.') : role === 3 ? 'Reads everything, changes nothing, never sees a private incident\'s location.' : 'Works incidents: acknowledges, sends people, closes.'}>
      <Segmented value={role} onChange={setRole} options={[[1, 'Dispatcher'], [2, 'Supervisor'], [3, 'View only']]} />
    </Field>
    <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr' }}>
      <Field label="Title" hint="As the desk knows them."><Input value={title} onChange={setTitle} placeholder="Duty officer" /></Field>
      <Field label="Station" hint="Empty means the whole institution."><Select value={facilityId} onChange={setFacilityId}><option value="">Whole institution</option>{facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
    </div>
    {!self ? <Check checked={active} onChange={setActive}>Active — can sign in</Check> : null}
  </>);
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
  const [facilityId, setFacilityId] = useState('');
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
      ? { userId: found?.userId ?? null, institutionId: data.institutionId, facilityId: facilityId || null, role, title: title || null, active }
      : { newAccount: { firstName: first.trim(), lastName: last.trim(), email: email.trim(), phone: phone.trim() || null }, institutionId: data.institutionId, facilityId: facilityId || null, role, title: title || null, active };
    commandApi.savePerson(body).then(r => onDone(r.message)).catch(caught => setError(errorWords(caught, 'That did not save.'))).finally(() => setBusy(false));
  };
  const ready = mode === 'find' ? Boolean(found?.found && !found.alreadyOnDesk) : Boolean(first.trim() && email.trim().includes('@'));

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
      <RoleField role={role} setRole={setRole} title={title} setTitle={setTitle} facilityId={facilityId} setFacilityId={setFacilityId} active={active} setActive={setActive} facilities={data.facilities} />
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <Actions><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={busy || !ready} onClick={save}>{busy ? 'Saving…' : mode === 'new' ? 'Create and send the link' : 'Add to the desk'}</Btn></Actions>
    </Modal>
  );
}

function EditDialog({ data, person, onClose, onDone }: { data: CommandPeople; person: CommandPerson; onClose: () => void; onDone: (message: string) => void }) {
  const [role, setRole] = useState(person.role);
  const [title, setTitle] = useState(person.title ?? '');
  const [facilityId, setFacilityId] = useState(person.facilityId ?? '');
  const [active, setActive] = useState(person.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    setBusy(true); setError(null);
    commandApi.savePerson({ id: person.id, institutionId: data.institutionId, facilityId: facilityId || null, role, title: title || null, active }).then(r => onDone(r.message)).catch(caught => setError(errorWords(caught, 'That did not save.'))).finally(() => setBusy(false));
  };
  return (
    <Modal title={person.name} onClose={onClose} width={520}>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>{person.email ?? ''} {person.phone ?? ''}{person.awaitingSetup ? <span style={{ color: T.warn }}> · awaiting setup</span> : null}</div>
      <RoleField role={role} setRole={setRole} title={title} setTitle={setTitle} facilityId={facilityId} setFacilityId={setFacilityId} active={active} setActive={setActive} facilities={data.facilities} self={person.isMe} />
      {person.isMe ? <div style={{ fontSize: 11.5, color: T.subtle, marginBottom: 8 }}>You cannot demote or deactivate yourself — another supervisor does that.</div> : null}
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <Actions><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn></Actions>
    </Modal>
  );
}

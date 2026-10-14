/**
 * Who works the desks.
 *
 * <p>A dispatcher is an ordinary Vacancy account bound to an institution — and, optionally, to
 * one of its stations. The binding is what scopes the desk: they see what was routed to their
 * institution and nothing else. The console finds the person by e-mail or phone; it never
 * creates an account, because a desk login is not something typed in a hurry.</p>
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PersonDialog } from './EmergencyInstitution';
import { useTheme } from '../theme/ThemeProvider';
import { Actions, Button, Card, Cell, ErrorNote, Field, Input, Loading, Modal, PageHeader, Pill, Row, Table, Toasts, fmtDateTime, useToasts } from '../components/ui';
import { DISPATCHER_ROLE, deskApi, deskRoleWords, emergencyApi, type DirectoryOverview, type DispatcherRow, type InstitutionRow } from '../api/emergency';
import { NoteDialog } from './EmergencyDirectory';
import type { AdminIdentity } from '../api/admin';

export function EmergencyDispatchers({ identity }: { identity: AdminIdentity }) {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [rows, setRows] = useState<DispatcherRow[] | null>(null);
  const [institutions, setInstitutions] = useState<InstitutionRow[]>([]);
  const [overview, setOverview] = useState<DirectoryOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<DispatcherRow | 'new' | null>(null);
  const [removing, setRemoving] = useState<DispatcherRow | null>(null);
  void identity;

  const load = useCallback(() => {
    Promise.all([deskApi.dispatchers(), emergencyApi.searchInstitutions({ pageSize: 100 }), emergencyApi.overview()])
      .then(([list, page, ov]) => { setRows(list.dispatchers); setInstitutions(page.items); setOverview(ov); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load.'));
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!rows || !overview) return <Loading />;
  const canEdit = overview.canEdit;

  return (
    <>
      <PageHeader
        title="Dispatchers"
        subtitle="Ordinary accounts bound to an institution. Each sees the incidents routed to their institution and nothing else. Open an institution to start accounts, resend setup links and run its desk."
        action={canEdit ? <Button tone="primary" onClick={() => setEditing('new')}>Add a person</Button> : undefined}
      />
      <Card pad={0}>
        {rows.length === 0 ? (
          <div style={{ padding: 18, fontSize: 12.5, color: t.textMuted, lineHeight: 1.6 }}>
            Nobody yet. Until an institution has a dispatcher, its incidents are seen only by Vacancy's own emergency administrators — and the timeline says so on each one.
          </div>
        ) : (
          <Table head={['Who', 'Institution', 'Station', 'Role', 'Last seen', '']}>
            {rows.map(r => (
              <Row key={r.id}>
                <Cell><strong>{r.name}</strong><div style={{ fontSize: 11.5, color: t.textSubtle }}>{r.email ?? r.phone}{r.title ? ` · ${r.title}` : ''}</div></Cell>
                <Cell><Link to={`/emergency/institutions/${r.institutionId}?tab=people`} style={{ color: t.brand, fontWeight: 700, textDecoration: 'none' }}>{r.institutionName}</Link></Cell>
                <Cell>{r.facilityName ?? 'Whole institution'}</Cell>
                <Cell><Pill tone={r.role === 2 ? 'info' : r.role === 3 ? 'neutral' : 'success'}>{deskRoleWords(r.role, r.facilityId)}</Pill>{!r.active ? <> <Pill tone="neutral">Inactive</Pill></> : null}</Cell>
                <Cell>{r.lastSeenAt ? fmtDateTime(r.lastSeenAt) : '—'}</Cell>
                <Cell>{canEdit ? <div style={{ display: 'flex', gap: 4 }}><Button size="sm" tone="subtle" onClick={() => setEditing(r)}>Edit</Button><Button size="sm" tone="danger" onClick={() => setRemoving(r)}>Remove</Button></div> : null}</Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      {editing === 'new' ? (
        <PersonDialog institutions={institutions.map(i => ({ id: i.id, name: i.name }))} onClose={() => setEditing(null)} onDone={message => { setEditing(null); push(message); load(); }} />
      ) : editing ? (
        <DispatcherDialog existing={editing} institutions={institutions} onClose={() => setEditing(null)} onDone={() => { setEditing(null); push('Saved.'); load(); }} />
      ) : null}
      {removing ? (
        <NoteDialog title={`Remove ${removing.name} from ${removing.institutionName}`} hint="They keep their Vacancy account; they lose the desk." verb="Remove" danger
          onClose={() => setRemoving(null)} onSave={reason => deskApi.removeDispatcher(removing.id, reason).then(() => { setRemoving(null); push('Removed.'); load(); })} />
      ) : null}
      <Toasts toasts={toasts} />
    </>
  );
}

function DispatcherDialog({ existing, institutions, onClose, onDone }: { existing: DispatcherRow | null; institutions: InstitutionRow[]; onClose: () => void; onDone: () => void }) {
  const { t } = useTheme();
  const [lookup, setLookup] = useState('');
  const [institutionId, setInstitutionId] = useState(existing?.institutionId ?? institutions[0]?.id ?? '');
  const [facilityId, setFacilityId] = useState(existing?.facilityId ?? '');
  const [facilities, setFacilities] = useState<{ id: string; name: string }[]>([]);
  const [role, setRole] = useState(existing?.role ?? 1);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [active, setActive] = useState(existing?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!institutionId) return;
    emergencyApi.getInstitution(institutionId).then(d => setFacilities(d.facilityRows.map(f => ({ id: f.id, name: f.name })))).catch(() => setFacilities([]));
  }, [institutionId]);

  const selectStyle = { width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${t.borderStrong}`, background: t.surfaceMuted, color: t.text, fontFamily: 'inherit', fontSize: 13.5 } as const;

  const save = () => {
    setBusy(true); setError(null);
    deskApi.saveDispatcher({ id: existing?.id ?? null, userId: existing?.userId ?? null, userLookup: existing ? null : lookup.trim(), institutionId, facilityId: facilityId || null, role, title: title || null, active })
      .then(onDone).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not save.')).finally(() => setBusy(false));
  };

  return (
    <Modal title={existing ? `Edit ${existing.name}` : 'Add a dispatcher'} onClose={onClose} width={520}>
      {!existing ? <Field label="Who" hint="The e-mail or phone number of an existing Vacancy account."><Input value={lookup} onChange={setLookup} autoFocus placeholder="kadiatu@police.gov.sl" /></Field> : null}
      <Field label="Institution"><select value={institutionId} onChange={e => { setInstitutionId(e.target.value); setFacilityId(''); }} style={selectStyle}>{institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
      <Field label="Station" hint="Empty means every station of the institution."><select value={facilityId} onChange={e => setFacilityId(e.target.value)} style={selectStyle}><option value="">Whole institution</option>{facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
      <Field label="Role" hint="A supervisor is also pushed on escalation. View-only sees the queue and never a sensitive location."><select value={role} onChange={e => setRole(Number(e.target.value))} style={selectStyle}>{Object.entries(DISPATCHER_ROLE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      <Field label="Title"><Input value={title} onChange={setTitle} placeholder="Control room" /></Field>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: t.text, marginBottom: 12, cursor: 'pointer' }}><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active</label>
      {error ? <ErrorNote message={error} /> : null}
      <Actions>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={busy || !institutionId || (!existing && lookup.trim().length < 3)} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
      </Actions>
    </Modal>
  );
}

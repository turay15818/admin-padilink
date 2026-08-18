/**
 * The admin team: who can open this console, and how they got in.
 *
 * The screen is built around one idea — nobody should ever know anybody else's password.
 * An invitation carries a one-time link and the invited person sets their own, so an
 * account begins without a shared secret. Resetting a password afterwards is possible,
 * deliberately noisy, and always leaves a reason on the audit trail.
 *
 * Revoking access and ending sessions are separate on purpose. Revoking takes the console
 * away and leaves the person's ordinary account alone; ending sessions leaves everything
 * intact and simply makes every device ask again. A lost laptop needs the second. A
 * departure needs both.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, Cell, EmptyState, ErrorNote, Field, Input, Loading, Modal, PageHeader,
  Pill, Row, Table, Textarea, Toasts, fmtDate, timeAgo, useToasts,
} from '../components/ui';
import { MultiSelect } from '../components/Select';
import { SetPasswordDialog } from '../components/Password';
import { Icon } from '../components/Icon';
import { adminApi, type AdminIdentity, type AdminInvite, type AdminTeam, type AdminTeamMember } from '../api/admin';

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Administrator', detail: 'Everything in this console except acting on other administrators' },
  { value: 'SUPER_ADMIN', label: 'Super administrator', detail: 'Also grants roles, sets passwords and revokes access' },
];

export function Team({ identity }: { identity: AdminIdentity }) {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [team, setTeam] = useState<AdminTeam | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [password, setPassword] = useState<AdminTeamMember | null>(null);
  const [confirm, setConfirm] = useState<{ member: AdminTeamMember; kind: 'revoke' | 'sessions' } | null>(null);

  const load = useCallback(() => {
    adminApi.team(search)
      .then(result => { setTeam(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the team.'));
  }, [search]);

  // Debounced: the API does the searching, and one request per keystroke is not a search,
  // it is a queue.
  useEffect(() => {
    const timer = setTimeout(load, 260);
    return () => clearTimeout(timer);
  }, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!team) return <Loading />;

  const canManage = team.canManage && identity.isSuperAdmin;
  const waiting = team.invites.filter(invite => invite.status === 'pending');

  return (
    <>
      <PageHeader
        title="Admin team"
        subtitle="Who can open this console, what they can do, and who let them in."
        action={
          <Button
            tone="primary"
            disabled={!canManage}
            title={canManage ? undefined : 'Only a super administrator can invite'}
            onClick={() => setInviteOpen(true)}
          >
            ＋ Invite someone
          </Button>
        }
      />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {/* "On the team" rather than "Administrators": the super administrators are counted
            in it, and two numbers that overlap without saying so are worse than one. */}
        <Tally label="On the team" value={team.members.length} />
        <Tally label="Of those, super" value={team.members.filter(m => m.isSuperAdmin).length} tone="accent" />
        <Tally label="Open sessions" value={team.members.reduce((sum, m) => sum + m.openSessions, 0)} tone="info" />
        <Tally label="Invitations waiting" value={waiting.length} tone={waiting.length ? 'warning' : 'neutral'} />
      </div>

      <div style={{ maxWidth: 340, marginBottom: 12 }}>
        <Input value={search} onChange={setSearch} placeholder="Search the team…" />
      </div>

      <Card pad={0}>
        {team.members.length === 0 ? (
          <div style={{ padding: 30 }}>
            <EmptyState
              icon="👤"
              title="Nobody matches that"
              message="Try a shorter search, or invite the person you were looking for."
            />
          </div>
        ) : (
          <Table head={['Person', 'Can do', 'Account', 'Last seen', '']}>
            {team.members.map(member => {
              const isMe = member.id === identity.userId;
              return (
                <Row key={member.id}>
                  <Cell>
                    <Link to={`/users/${member.id}`} style={{ color: t.text, textDecoration: 'none', fontWeight: 700 }}>
                      {member.name}
                    </Link>
                    {isMe ? <span style={{ marginLeft: 7 }}><Pill tone="info">you</Pill></span> : null}
                    <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 2 }}>{member.email ?? '—'}</div>
                    {member.invitedByName ? (
                      <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
                        Invited by {member.invitedByName} · joined {fmtDate(member.dateCreated)}
                      </div>
                    ) : null}
                  </Cell>
                  <Cell>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {member.isSuperAdmin
                        ? <Pill tone="accent">Super administrator</Pill>
                        : <Pill tone="info">Administrator</Pill>}
                    </div>
                  </Cell>
                  <Cell>
                    <Pill tone={member.status === 2 ? 'success' : 'warning'}>{member.statusName}</Pill>
                  </Cell>
                  <Cell>
                    <div style={{ fontSize: 12.5, color: t.text }}>
                      {member.lastSignInAt ? timeAgo(member.lastSignInAt) : 'Never'}
                    </div>
                    <div style={{ fontSize: 11.5, color: member.openSessions ? t.success : t.textSubtle, marginTop: 2 }}>
                      {member.openSessions
                        ? `${member.openSessions} open ${member.openSessions === 1 ? 'session' : 'sessions'}`
                        : 'Not signed in'}
                    </div>
                  </Cell>
                  <Cell style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Button
                      size="sm" tone="subtle"
                      disabled={!canManage || isMe}
                      title={isMe ? 'Change your own password from Account' : undefined}
                      onClick={() => setPassword(member)}
                    >
                      Set password
                    </Button>
                    {' '}
                    <Button
                      size="sm" tone="subtle"
                      disabled={!canManage || isMe || member.openSessions === 0}
                      title={member.openSessions === 0 ? 'They have no open sessions' : undefined}
                      onClick={() => setConfirm({ member, kind: 'sessions' })}
                    >
                      Sign out
                    </Button>
                    {' '}
                    <Button
                      size="sm" tone="danger"
                      disabled={!canManage || isMe}
                      title={isMe ? 'You cannot remove your own access' : undefined}
                      onClick={() => setConfirm({ member, kind: 'revoke' })}
                    >
                      Revoke
                    </Button>
                  </Cell>
                </Row>
              );
            })}
          </Table>
        )}
      </Card>

      <Invitations invites={team.invites} canManage={canManage} onChanged={load} onNote={push} />

      {inviteOpen ? (
        <InviteDialog
          grantable={team.grantableRoles}
          onClose={() => setInviteOpen(false)}
          onDone={message => { push(message); load(); }}
        />
      ) : null}

      {password ? (
        <SetPasswordDialog
          user={{ id: password.id, name: password.name, email: password.email, isConsoleUser: true }}
          onClose={() => setPassword(null)}
          onDone={message => { push(message); load(); }}
        />
      ) : null}

      {confirm ? (
        <ConfirmDialog
          member={confirm.member}
          kind={confirm.kind}
          onClose={() => setConfirm(null)}
          onDone={message => { push(message); load(); }}
        />
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

/* ---------- invitations ---------- */

function Invitations({ invites, canManage, onChanged, onNote }: {
  invites: AdminInvite[];
  canManage: boolean;
  onChanged: () => void;
  onNote: (message: string, tone?: 'ok' | 'error') => void;
}) {
  const { t } = useTheme();
  const [busy, setBusy] = useState<string | null>(null);

  if (invites.length === 0) return null;

  const act = (invite: AdminInvite, kind: 'resend' | 'revoke') => {
    setBusy(invite.id);
    const call = kind === 'resend'
      ? adminApi.resendInvite(invite.id)
      : adminApi.revokeInvite(invite.id, 'Withdrawn from the console');
    call
      .then(() => {
        onNote(kind === 'resend'
          ? `A fresh link is on its way to ${invite.email}.`
          : `The invitation to ${invite.email} no longer works.`);
        onChanged();
      })
      .catch((caught: unknown) => onNote(caught instanceof Error ? caught.message : 'That did not work.', 'error'))
      .finally(() => setBusy(null));
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <Icon name="mail" size={16} color={t.textMuted} />
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: t.text }}>Invitations</h2>
      </div>
      <Card pad={0}>
        <Table head={['Sent to', 'Will be', 'Sent', 'State', '']}>
          {invites.map(invite => (
            <Row key={invite.id}>
              <Cell>
                <div style={{ fontWeight: 700, color: t.text }}>{invite.email}</div>
                {invite.name ? <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 2 }}>{invite.name}</div> : null}
              </Cell>
              <Cell>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {invite.roles.map(role => (
                    <Pill key={role} tone={role === 'SUPER_ADMIN' ? 'accent' : 'info'}>
                      {role === 'SUPER_ADMIN' ? 'Super administrator' : 'Administrator'}
                    </Pill>
                  ))}
                </div>
              </Cell>
              <Cell>
                <div style={{ fontSize: 12.5, color: t.text }}>{timeAgo(invite.sentAt)}</div>
                <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
                  {invite.invitedByName ? `by ${invite.invitedByName}` : ''}
                </div>
              </Cell>
              <Cell>
                <Pill tone={
                  invite.status === 'accepted' ? 'success'
                    : invite.status === 'pending' ? 'warning'
                    : 'neutral'
                }>
                  {invite.statusLabel}
                </Pill>
                {invite.status === 'pending' ? (
                  <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 3 }}>
                    Link dies {fmtDate(invite.expiresAt)}
                  </div>
                ) : null}
              </Cell>
              <Cell style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {invite.status === 'pending' || invite.status === 'expired' ? (
                  <>
                    <Button
                      size="sm" tone="subtle"
                      disabled={!canManage || busy === invite.id}
                      onClick={() => act(invite, 'resend')}
                    >
                      {busy === invite.id ? '…' : 'Send again'}
                    </Button>
                    {' '}
                    <Button
                      size="sm" tone="subtle"
                      disabled={!canManage || busy === invite.id}
                      onClick={() => act(invite, 'revoke')}
                    >
                      Withdraw
                    </Button>
                  </>
                ) : null}
              </Cell>
            </Row>
          ))}
        </Table>
      </Card>
      <p style={{ fontSize: 12, color: t.textSubtle, margin: '9px 2px 0', lineHeight: 1.6 }}>
        Sending again mints a new link and kills the old one, so only ever one door is open.
      </p>
    </div>
  );
}

function InviteDialog({ grantable, onClose, onDone }: {
  grantable: string[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useTheme();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roles, setRoles] = useState<string[]>(['ADMIN']);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const ready = looksLikeEmail && roles.length > 0;

  const submit = () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    adminApi.invite({ email: email.trim(), name: name.trim() || null, roles, note: note.trim() || null })
      .then(() => { onDone(`Invitation sent to ${email.trim()}.`); onClose(); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title="Invite someone into the console" onClose={onClose} width={520}>
      <p style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.6, marginTop: 0 }}>
        They get a link that works once and expires in seven days. They choose their own
        password when they open it — you never see it, and neither does anyone else.
      </p>

      <Field label="Email address" hint="Where the link goes. It must be an address they already read.">
        <Input value={email} onChange={setEmail} placeholder="name@company.com" />
      </Field>
      {email.trim() && !looksLikeEmail ? (
        <div style={{ fontSize: 12.5, color: t.warning, margin: '-6px 0 12px' }}>That does not look like an email address.</div>
      ) : null}

      <Field label="Their name" hint="Optional — shown on the invitation and on the audit trail.">
        <Input value={name} onChange={setName} placeholder="e.g. Aminata Kamara" onEnter={submit} />
      </Field>

      <Field label="What they can do">
        <MultiSelect
          values={roles}
          onChange={setRoles}
          options={ROLE_OPTIONS.filter(option => grantable.includes(option.value))}
          placeholder="Choose at least one"
          summary={values => values.length === 0 ? 'Choose at least one'
            : values.includes('SUPER_ADMIN') ? 'Super administrator' : 'Administrator'}
        />
      </Field>

      {roles.includes('SUPER_ADMIN') ? (
        <div style={{
          background: t.warningSoft, border: `1px solid ${t.warning}`, borderRadius: 10,
          padding: '10px 12px', margin: '-4px 0 14px', fontSize: 12.5, color: t.textMuted, lineHeight: 1.6,
        }}>
          A super administrator can grant roles, set other administrators' passwords and
          revoke access — including yours. Give it to someone you would trust with the keys
          to the building.
        </div>
      ) : null}

      <Field label="A line for them" hint="Optional. Goes in the invitation email.">
        <Textarea value={note} onChange={setNote} placeholder="e.g. This is for the Freetown operations desk." rows={2} />
      </Field>

      {error ? <div style={{ marginBottom: 12 }}><ErrorNote message={error} /></div> : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={!ready || busy} onClick={submit}>
          {busy ? 'Sending…' : 'Send invitation'}
        </Button>
      </div>
    </Modal>
  );
}

/* ---------- revoke / end sessions ---------- */

function ConfirmDialog({ member, kind, onClose, onDone }: {
  member: AdminTeamMember;
  kind: 'revoke' | 'sessions';
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useTheme();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revoking = kind === 'revoke';
  const ready = reason.trim().length >= 6;

  const submit = () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const call = revoking
      ? adminApi.revokeAdminAccess(member.id, reason.trim()).then(() => `${member.name} can no longer open the console.`)
      : adminApi.forceSignOut(member.id, reason.trim()).then(result => result?.message ?? `${member.name} was signed out everywhere.`);
    call
      .then(message => { onDone(message); onClose(); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      title={revoking ? `Take away ${member.name}'s console access` : `Sign ${member.name} out everywhere`}
      onClose={onClose}
    >
      <p style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.6, marginTop: 0 }}>
        {revoking ? (
          <>
            Their ordinary account stays exactly as it is — they keep their bookings, their
            profile and their password. What goes is the console: the administrator roles are
            removed and every session ends immediately.
          </>
        ) : (
          <>
            Ends every session on every device the moment you confirm — console, phone,
            tablet. Nothing else changes: same account, same password, same access. They
            simply have to sign in again.
          </>
        )}
      </p>

      <Field label="Why" hint="Required. Recorded on the audit trail beside your name.">
        <Input
          value={reason}
          onChange={setReason}
          placeholder={revoking ? 'e.g. Left the company on Friday' : 'e.g. Reported their laptop stolen'}
          onEnter={submit}
        />
      </Field>

      {error ? <div style={{ marginBottom: 12 }}><ErrorNote message={error} /></div> : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="danger" disabled={!ready || busy} onClick={submit}>
          {busy ? 'Working…' : revoking ? 'Revoke access' : 'Sign them out'}
        </Button>
      </div>
    </Modal>
  );
}

/* ---------- pieces ---------- */

function Tally({ label, value, tone = 'neutral' }: {
  label: string; value: number; tone?: 'neutral' | 'accent' | 'info' | 'warning';
}) {
  const { t } = useTheme();
  const colour = tone === 'accent' ? t.brand : tone === 'info' ? t.info : tone === 'warning' ? t.warning : t.text;
  return (
    <div style={{
      background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12,
      padding: '11px 15px', minWidth: 132,
    }}>
      <div style={{ fontSize: 21, fontWeight: 800, color: colour, lineHeight: 1.15 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: t.textSubtle, fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );
}

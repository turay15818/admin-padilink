/**
 * People: find an account, open it, and act on it.
 *
 * Every destructive move goes through a dialog that asks for a reason, because the reason
 * is what the audit trail will be read for later. The dialog states plainly what the
 * person will experience — "cannot sign in" is more useful than the word "blocked".
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, Cell, EmptyState, ErrorNote, Field, Input, Loading, Modal, PageHeader,
  Pill, Row, Table, Textarea, Toasts, fmtDate, fmtDateTime, statusTone, timeAgo, useToasts,
} from '../components/ui';
import { SetPasswordDialog } from '../components/Password';
import { CustomerStandingCard } from '../components/CustomerStandingCard';
import {
  adminApi, AccountStatus,
  type AdminIdentity, type AdminUserDetail, type AdminUserSearch,
  type PersonFile, type PersonThing,
  type CreateUserDraft, type PendingSetup, type CreatedUser,
} from '../api/admin';
import { MultiSelect, Select } from '../components/Select';
import { AuditRowLine } from './Audit';

/* ---------------- list ---------------- */

export function People() {
  const { t } = useTheme();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState<AdminUserSearch | null>(null);
  const [pageIndex, setPageIndex] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<PendingSetup[]>([]);
  const [reload, setReload] = useState(0);
  const { toasts: listToasts, push: pushList } = useToasts();

  useEffect(() => {
    adminApi.pendingSetups().then(setPending).catch(() => setPending([]));
  }, [reload]);

  useEffect(() => {
    setBusy(true);
    const timer = window.setTimeout(() => {
      adminApi.users(search, pageIndex)
        .then(result => { setPage(result); setError(null); })
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load people.'))
        .finally(() => setBusy(false));
    }, 240);
    return () => window.clearTimeout(timer);
  }, [search, pageIndex]);

  const totalPages = page ? Math.max(1, Math.ceil(page.totalCount / page.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="People"
        subtitle="Every account on the platform. Open one to see what they have done and act on it."
        action={<Button tone="primary" onClick={() => setCreating(true)}>＋ Set someone up</Button>}
      />

      {/* Accounts that exist and cannot be signed into. Left unwatched these become support
          calls — somebody was set up at a desk, the email never arrived, and nobody knows. */}
      {pending.length > 0 ? (
        <Card style={{ marginBottom: 14, borderColor: t.warning, background: t.warningSoft }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: t.text, marginBottom: 4 }}>
            {pending.length} {pending.length === 1 ? 'account is' : 'accounts are'} waiting on a password
          </div>
          <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 10, lineHeight: 1.6 }}>
            These were set up here and nobody has finished them. They cannot sign in until they do.
          </div>
          {pending.slice(0, 6).map(row => (
            <div
              key={row.id}
              style={{
                display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0',
                borderTop: `1px solid ${t.border}`,
              }}
            >
              <Link to={`/users/${row.userId}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{row.name}</div>
                <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
                  {row.email} · set up by {row.createdByName} · sent {row.sendCount}×
                </div>
              </Link>
              <Pill tone={row.expired ? 'danger' : 'warning'}>
                {row.expired ? 'link expired' : `expires ${fmtDate(row.expiresAt)}`}
              </Pill>
              <Button
                size="sm"
                tone="subtle"
                onClick={() => {
                  adminApi.resendSetup(row.userId)
                    .then(result => { pushList(result.message); setReload(n => n + 1); })
                    .catch((caught: unknown) => pushList(
                      caught instanceof Error ? caught.message : 'That did not work.', 'error'));
                }}
              >
                Send again
              </Button>
            </div>
          ))}
        </Card>
      ) : null}

      <Card pad={14} style={{ marginBottom: 14 }}>
        <Input
          value={search}
          onChange={value => { setSearch(value); setPageIndex(1); }}
          placeholder="Search by name or email…"
        />
      </Card>

      {creating ? (
        <CreateAccount
          onClose={() => setCreating(false)}
          onDone={(result: CreatedUser) => {
            pushList(result.message);
            setCreating(false);
            setReload(n => n + 1);
            navigate(`/users/${result.userId}`);
          }}
        />
      ) : null}

      <Toasts toasts={listToasts} />

      {error ? <ErrorNote message={error} /> : null}

      <Card pad={0}>
        {!page && busy ? <Loading /> : (page?.items.length ?? 0) === 0 ? (
          <EmptyState icon="👥" title="Nobody matches" message="Try a different name or email." />
        ) : (
          <Table head={['Name', 'Email', 'Type', 'Status', 'Joined', '']}>
            {page!.items.map(user => (
              <Row key={user.id} onClick={() => navigate(`/users/${user.id}`)}>
                <Cell><span style={{ fontWeight: 700 }}>{user.name}</span></Cell>
                <Cell style={{ color: t.textMuted }}>{user.email ?? '—'}</Cell>
                <Cell><Pill tone={user.userType >= 3 ? 'accent' : 'neutral'}>{user.userTypeName}</Pill></Cell>
                <Cell><Pill tone={statusTone(user.status)}>{user.statusName}</Pill></Cell>
                <Cell style={{ color: t.textMuted }}>{fmtDate(user.dateCreated)}</Cell>
                <Cell style={{ textAlign: 'right', color: t.textSubtle }}>→</Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      {page && page.totalCount > page.pageSize ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, justifyContent: 'center' }}>
          <Button size="sm" tone="subtle" disabled={pageIndex <= 1} onClick={() => setPageIndex(index => index - 1)}>← Previous</Button>
          <span style={{ fontSize: 12.5, color: t.textMuted }}>Page {page.pageIndex} of {totalPages} · {page.totalCount} people</span>
          <Button size="sm" tone="subtle" disabled={pageIndex >= totalPages} onClick={() => setPageIndex(index => index + 1)}>Next →</Button>
        </div>
      ) : null}
    </>
  );
}

/* ---------------- detail ---------------- */

const ROLES = ['INDIVIDUAL', 'PROVIDER', 'COMPANY', 'ADMIN', 'SUPER_ADMIN'];

export function Person({ identity }: { identity: AdminIdentity }) {
  const { userId } = useParams();
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [file, setFile] = useState<PersonFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [draftRoles, setDraftRoles] = useState<string[]>([]);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const load = useCallback(() => {
    if (!userId) return;
    adminApi.user(userId)
      .then(result => { setUser(result); setDraftRoles(result.roles); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load this account.'));

    // Fetched alongside rather than instead: the header has to appear immediately, and the
    // file is ten queries. A failure here leaves the page working with less on it, because
    // "could not load their booking history" must not become "could not load this account".
    adminApi.personFile(userId)
      .then(setFile)
      .catch(() => setFile(null));
  }, [userId]);
  useEffect(load, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!user) return <Loading />;

  const applyStatus = () => {
    if (statusTarget === null || !userId) return;
    setBusy(true);
    adminApi.setUserStatus(userId, statusTarget, reason.trim() || null)
      .then(result => {
        setUser(result);
        setStatusTarget(null);
        setReason('');
        push(`${result.name} is now ${result.statusName.toLowerCase()}.`);
      })
      .catch((caught: unknown) => push(caught instanceof Error ? caught.message : 'That did not work.', 'error'))
      .finally(() => setBusy(false));
  };

  const applyRoles = () => {
    if (!userId) return;
    setBusy(true);
    adminApi.setUserRoles(userId, draftRoles, reason.trim() || null)
      .then(result => {
        setUser(result);
        setRolesOpen(false);
        setReason('');
        push(`Roles updated for ${result.name}.`);
      })
      .catch((caught: unknown) => push(caught instanceof Error ? caught.message : 'That did not work.', 'error'))
      .finally(() => setBusy(false));
  };

  const facts: [string, string][] = [
    ['Email', user.email ?? '—'],
    ['Phone', user.phoneNumber ?? '—'],
    ['Joined', fmtDate(user.dateCreated)],
    ['Last change', user.lastUpdated ? fmtDateTime(user.lastUpdated) : '—'],
    ['Email verified', user.emailVerified ? 'Yes' : 'No'],
    ['Phone verified', user.phoneVerified ? 'Yes' : 'No'],
  ];

  const activity: [string, number][] = [
    ['Bookings made', user.bookingsAsCustomer],
    ['Jobs completed', user.bookingsAsProvider],
    ['Jobs posted', user.jobsPosted],
    ['Classes taught', user.classesTaught],
    ['Certificates', user.certificatesEarned],
  ];

  // Asked of the API, not guessed from a user type. The console once decided this itself
  // with `userType === 4` — which is SUPER_ADMIN — and quietly hid every ordinary
  // administrator from the one screen that was supposed to reach them.
  const isConsoleUser = user.isConsoleUser
    ?? user.roles.some(role => role === 'ADMIN' || role === 'SUPER_ADMIN');
  const isMe = user.id === identity.userId;

  const endSessions = () => {
    if (!userId) return;
    setBusy(true);
    adminApi.forceSignOut(userId, reason.trim())
      .then(result => {
        setSignOutOpen(false);
        setReason('');
        push(result?.message ?? `${user.name} was signed out everywhere.`);
        load();
      })
      .catch((caught: unknown) => push(caught instanceof Error ? caught.message : 'That did not work.', 'error'))
      .finally(() => setBusy(false));
  };

  const statusAction = (target: number, label: string, tone: 'primary' | 'danger' | 'ghost') => (
    <Button tone={tone} disabled={user.status === target} onClick={() => { setStatusTarget(target); setReason(''); }}>
      {label}
    </Button>
  );

  return (
    <>
      <Link to="/users" style={{ fontSize: 13, color: t.textMuted, textDecoration: 'none' }}>← All people</Link>

      <PageHeader
        title={user.name}
        subtitle={user.email ?? undefined}
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {statusAction(AccountStatus.Active, 'Activate', 'primary')}
            {statusAction(AccountStatus.Suspended, 'Suspend', 'ghost')}
            {statusAction(AccountStatus.Blocked, 'Block', 'danger')}
          </div>
        }
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <Pill tone={statusTone(user.status)}>{user.statusName}</Pill>
        <Pill tone={user.userType >= 3 ? 'accent' : 'neutral'}>{user.userTypeName}</Pill>
        {user.hasProviderProfile ? (
          <Pill tone={user.providerVerified ? 'success' : 'info'}>
            {user.providerVerified ? '✓ Verified provider' : 'Provider'}{user.providerBusinessName ? ` · ${user.providerBusinessName}` : ''}
          </Pill>
        ) : null}
        {user.roles.map(role => <Pill key={role} tone="info">{role}</Pill>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        <Card>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text, marginBottom: 10 }}>Account</div>
          {facts.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: `1px solid ${t.border}` }}>
              <div style={{ width: 120, flexShrink: 0, fontSize: 12.5, color: t.textSubtle, fontWeight: 700 }}>{label}</div>
              <div style={{ fontSize: 13, color: t.text }}>{value}</div>
            </div>
          ))}

          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Button
              size="sm"
              tone="subtle"
              disabled={!identity.isSuperAdmin}
              title={identity.isSuperAdmin ? undefined : 'Only a super administrator can change roles'}
              onClick={() => { setDraftRoles(user.roles); setReason(''); setRolesOpen(true); }}
            >
              Manage roles
            </Button>

            {/*
              The password action sits on the person, not in a settings screen — this is
              where you land when someone says they are locked out. It is shown for
              administrators only, and the API refuses anyone else regardless.
            */}
            <Button
              size="sm"
              tone="subtle"
              disabled={!identity.isSuperAdmin || !isConsoleUser || isMe}
              title={
                isMe ? 'Change your own password from Account — it asks for the current one'
                  : !identity.isSuperAdmin ? 'Only a super administrator can set an administrator password'
                  : !isConsoleUser ? 'Only administrators — everyone else resets their own password from the app'
                  : undefined
              }
              onClick={() => setPasswordOpen(true)}
            >
              Set password
            </Button>

            <Button
              size="sm"
              tone="subtle"
              disabled={!identity.isSuperAdmin || isMe}
              title={isMe ? 'You cannot sign yourself out from here — use Sign out on the rail' : undefined}
              onClick={() => { setReason(''); setSignOutOpen(true); }}
            >
              Sign out everywhere
            </Button>

            <Link to={`/audit?entityId=${user.id}`} style={{ fontSize: 12.5, color: t.brand, fontWeight: 700, textDecoration: 'none' }}>
              Full history →
            </Link>
          </div>

          {isConsoleUser ? (
            <div style={{
              marginTop: 12, padding: '9px 12px', borderRadius: 9,
              background: t.surfaceMuted, fontSize: 12, color: t.textSubtle, lineHeight: 1.6,
            }}>
              Console account · {user.openSessions ?? 0} open {(user.openSessions ?? 0) === 1 ? 'session' : 'sessions'}
              {user.lastSignInAt ? ` · last signed in ${timeAgo(user.lastSignInAt)}` : ' · never signed in'}
            </div>
          ) : null}
        </Card>

        <Card>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text, marginBottom: 10 }}>On the platform</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            {activity.map(([label, value]) => (
              <div key={label} style={{ background: t.surfaceMuted, borderRadius: 10, padding: '11px 13px' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: t.text }}>{value}</div>
                <div style={{ fontSize: 11.5, color: t.textSubtle, fontWeight: 600 }}>{label}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* What providers have said about this person as a customer. The only screen in
            the product where those notes are readable, and the only place a customer's
            standing can be appealed. */}
        <CustomerStandingCard userId={user.id} />
      </div>

      {file ? (
        <>
          {/* The sentence support actually needs, with its working shown. "Good standing" is a
              label you have to take on trust; this is the same judgement, arguable. */}
          <div style={{
            background: t.surfaceMuted, border: `1px solid ${t.border}`, borderRadius: 12,
            padding: '13px 16px', marginTop: 14, fontSize: 13.5, color: t.text, lineHeight: 1.7,
          }}>
            {file.standing.summary}
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 14, marginTop: 14,
          }}>
            <ThingList title="Bookings" things={file.bookings} empty="No bookings, either side." />
            <ThingList title="What they posted" things={file.posted} empty="They have posted nothing." />
            <ThingList title="Learning" things={file.learning} empty="No classes, no certificates." />
            <ThingList title="Papers" things={file.documents} empty="Nothing uploaded." />
            <ThingList
              title="Complaints"
              things={file.complaints}
              empty="Nobody has complained about them, and they have complained about nobody."
            />
            <Card>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text, marginBottom: 10 }}>
                Devices
              </div>
              {file.devices.length === 0 ? (
                <div style={{ fontSize: 13, color: t.textSubtle, padding: '8px 0' }}>
                  No devices — which is why they receive no notifications.
                </div>
              ) : (
                file.devices.map((device, index) => (
                  <div
                    key={`${device.name}-${index}`}
                    style={{ padding: '9px 0', borderBottom: `1px solid ${t.border}` }}
                  >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{device.name}</span>
                      <Pill tone={device.canReceiveNotifications ? 'success' : 'neutral'}>
                        {device.canReceiveNotifications ? 'can be notified' : 'no notifications'}
                      </Pill>
                    </div>
                    <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 3 }}>
                      {[device.model, device.operatingSystem, device.appVersion && `app ${device.appVersion}`]
                        .filter(Boolean).join(' · ') || 'no details'}
                      {device.lastSeenAt ? ` · last seen ${timeAgo(device.lastSeenAt)}` : ''}
                    </div>
                  </div>
                ))
              )}
            </Card>
          </div>

          {/* Everything above, merged and in order. This is the shape of the answer to
              "what happened with this customer", and no screen had it before. */}
          <Card style={{ marginTop: 14 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text, marginBottom: 4 }}>
              Everything, in order
            </div>
            <div style={{ fontSize: 12, color: t.textSubtle, marginBottom: 12, lineHeight: 1.6 }}>
              Every list above merged onto one line of time. Newest first.
            </div>
            {file.timeline.map((entry, index) => (
              <div
                key={`${entry.at}-${index}`}
                style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: `1px solid ${t.border}` }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: 4, marginTop: 6, flexShrink: 0,
                  background: toneColour(entry.tone, t),
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: t.text }}>{entry.title}</div>
                  {entry.detail ? (
                    <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>{entry.detail}</div>
                  ) : null}
                </div>
                <div style={{ fontSize: 11.5, color: t.textSubtle, whiteSpace: 'nowrap' }}>
                  {timeAgo(entry.at)}
                </div>
              </div>
            ))}
          </Card>
        </>
      ) : null}

      <Card style={{ marginTop: 14 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text, marginBottom: 4 }}>What administrators did to this account</div>
        {user.recentActivity.length === 0 ? (
          <div style={{ color: t.textSubtle, fontSize: 13, padding: '12px 0' }}>Nothing yet — this account has never been touched from the console.</div>
        ) : (
          user.recentActivity.map(entry => <AuditRowLine key={entry.id} entry={entry} when={timeAgo(entry.at)} />)
        )}
      </Card>

      {statusTarget !== null ? (
        <Modal
          title={statusTarget === AccountStatus.Active ? 'Reactivate this account'
            : statusTarget === AccountStatus.Suspended ? 'Suspend this account' : 'Block this account'}
          onClose={() => setStatusTarget(null)}
        >
          <p style={{ color: t.textMuted, fontSize: 13.5, lineHeight: 1.65, marginTop: 0 }}>
            {statusTarget === AccountStatus.Active
              ? `${user.name} will be able to sign in and use Vacancy normally again.`
              : statusTarget === AccountStatus.Suspended
                ? `${user.name} will not be able to sign in. Their bookings, classes and history stay exactly as they are, and you can lift this at any time.`
                : `${user.name} will be blocked from signing in. Use this for abuse and fraud — suspension is the reversible, softer option.`}
          </p>

          {statusTarget !== AccountStatus.Active ? (
            <Field label="Reason" hint="Required. This is recorded against your name on the audit trail.">
              <Textarea value={reason} onChange={setReason} rows={3} placeholder="e.g. Repeated no-shows reported by three customers" />
            </Field>
          ) : (
            <Field label="Note (optional)">
              <Textarea value={reason} onChange={setReason} rows={2} placeholder="e.g. Appeal upheld — evidence provided" />
            </Field>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
            <Button tone="subtle" onClick={() => setStatusTarget(null)}>Cancel</Button>
            <Button
              tone={statusTarget === AccountStatus.Blocked ? 'danger' : 'primary'}
              disabled={busy || (statusTarget !== AccountStatus.Active && reason.trim().length === 0)}
              onClick={applyStatus}
            >
              {busy ? 'Working…' : statusTarget === AccountStatus.Active ? 'Reactivate' : statusTarget === AccountStatus.Suspended ? 'Suspend' : 'Block'}
            </Button>
          </div>
        </Modal>
      ) : null}

      {rolesOpen ? (
        <Modal title={`Roles for ${user.name}`} onClose={() => setRolesOpen(false)}>
          <p style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.6, marginTop: 0 }}>
            Roles decide what this account can do. Granting ADMIN gives access to this console;
            SUPER_ADMIN additionally allows acting on other administrators.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
            {ROLES.map(role => {
              const on = draftRoles.includes(role);
              return (
                <label
                  key={role}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10,
                    border: `1px solid ${on ? t.brand : t.border}`, background: on ? t.brandSoft : t.surfaceMuted,
                    cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: t.text,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={event => setDraftRoles(list => event.target.checked ? [...list, role] : list.filter(item => item !== role))}
                  />
                  {role}
                  {role === 'SUPER_ADMIN' ? <span style={{ marginLeft: 'auto' }}><Pill tone="danger">full power</Pill></span> : null}
                </label>
              );
            })}
          </div>
          <Field label="Reason (optional)">
            <Input value={reason} onChange={setReason} placeholder="e.g. Promoted to operations lead" />
          </Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button tone="subtle" onClick={() => setRolesOpen(false)}>Cancel</Button>
            <Button tone="primary" disabled={busy} onClick={applyRoles}>{busy ? 'Saving…' : 'Save roles'}</Button>
          </div>
        </Modal>
      ) : null}

      {passwordOpen ? (
        <SetPasswordDialog
          user={{ id: user.id, name: user.name, email: user.email, isConsoleUser }}
          onClose={() => setPasswordOpen(false)}
          onDone={message => { push(message); load(); }}
        />
      ) : null}

      {signOutOpen ? (
        <Modal title={`Sign ${user.name} out everywhere`} onClose={() => setSignOutOpen(false)}>
          <p style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.6, marginTop: 0 }}>
            Ends every session on every device — console, phone, tablet — the moment you
            confirm. They keep their account and their password; they simply have to sign in
            again. Use this when a phone is lost or a laptop is left somewhere.
          </p>
          <Field label="Why" hint="Required. Recorded on the audit trail beside your name.">
            <Input value={reason} onChange={setReason} placeholder="e.g. Reported their phone stolen this morning" onEnter={endSessions} />
          </Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button tone="subtle" onClick={() => setSignOutOpen(false)}>Cancel</Button>
            <Button tone="danger" disabled={busy || reason.trim().length < 6} onClick={endSessions}>
              {busy ? 'Ending…' : 'Sign them out'}
            </Button>
          </div>
        </Modal>
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

/* ---------------- the file ---------------- */

function ThingList({ title, things, empty }: { title: string; things: PersonThing[]; empty: string }) {
  const { t } = useTheme();
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 14.5, fontWeight: 800, color: t.text }}>{title}</span>
        {things.length > 0 ? (
          <span style={{ fontSize: 12, color: t.textSubtle, fontWeight: 700 }}>{things.length}</span>
        ) : null}
      </div>

      {things.length === 0 ? (
        <div style={{ fontSize: 13, color: t.textSubtle, padding: '8px 0', lineHeight: 1.6 }}>{empty}</div>
      ) : (
        things.slice(0, 8).map(thing => (
          <div key={thing.id} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: `1px solid ${t.border}` }}>
            <span style={{
              width: 7, height: 7, borderRadius: 4, marginTop: 6, flexShrink: 0,
              background: toneColour(thing.tone, t),
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: t.text, fontWeight: 600 }}>{thing.title}</div>
              {thing.detail ? (
                <div style={{
                  fontSize: 11.5, color: t.textSubtle, marginTop: 2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {thing.detail}
                </div>
              ) : null}
            </div>
            <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <div style={{ fontSize: 11.5, color: t.textMuted }}>{thing.status}</div>
              <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 2 }}>{timeAgo(thing.at)}</div>
            </div>
          </div>
        ))
      )}

      {things.length > 8 ? (
        <div style={{ fontSize: 11.5, color: t.textSubtle, paddingTop: 9 }}>
          and {things.length - 8} more, on the timeline below
        </div>
      ) : null}
    </Card>
  );
}

/** The four tones the API sends. An unknown one falls back to grey rather than to nothing. */
function toneColour(tone: string, t: { success: string; warning: string; danger: string; textSubtle: string }) {
  return tone === 'green' ? t.success
    : tone === 'amber' ? t.warning
    : tone === 'red' ? t.danger
    : t.textSubtle;
}

/* ---------------- setting somebody up ---------------- */

const ROLE_OPTIONS = [
  { value: 'INDIVIDUAL', label: 'Customer', detail: 'Books work. Nothing else to fill in.' },
  { value: 'PROVIDER', label: 'Provider', detail: 'Offers work. You can build their whole profile here.' },
  { value: 'COMPANY', label: 'Company', detail: 'A business account with an owner.' },
];

/**
 * Build somebody an account without ever holding their password.
 *
 * The dialog has no password field and it never will. An administrator who can set a password
 * can sign in as that person, and from that moment every audit row about them means nothing —
 * the record says the customer cancelled their own booking and nothing can tell that apart
 * from an administrator doing it. So the account is created unusable and an email is the only
 * thing that can change that. The dialog says so, because somebody will otherwise go looking
 * for the field and assume it is a bug.
 */
function CreateAccount({ onClose, onDone }: {
  onClose: () => void;
  onDone: (result: CreatedUser) => void;
}) {
  const { t } = useTheme();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('INDIVIDUAL');
  const [note, setNote] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // provider half
  const [businessName, setBusinessName] = useState('');
  const [title, setTitle] = useState('');
  const [city, setCity] = useState('');
  const [years, setYears] = useState('');
  const [rate, setRate] = useState('');
  const [bio, setBio] = useState('');
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [skills, setSkills] = useState<{ value: string; label: string }[]>([]);

  // company half
  const [companyName, setCompanyName] = useState('');
  const [registration, setRegistration] = useState('');

  useEffect(() => {
    if (role !== 'PROVIDER') return;
    adminApi.skillPage({ pageSize: 200 })
      .then(page => setSkills(page.items.map(skill => ({ value: skill.id, label: skill.name }))))
      .catch(() => setSkills([]));
  }, [role]);

  const ready = firstName.trim().length >= 2 && email.trim().includes('@');

  const submit = () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);

    const draft: CreateUserDraft = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phoneNumber: phone.trim() || null,
      userType: role === 'COMPANY' ? 2 : 1,
      role,
      note: note.trim() || null,
      sendEmail,
      provider: role === 'PROVIDER' ? {
        businessName: businessName.trim() || null,
        professionalTitle: title.trim() || null,
        bio: bio.trim() || null,
        city: city.trim() || null,
        yearsOfExperience: years.trim() ? Number(years) : null,
        hourlyRate: rate.trim() ? Number(rate) : null,
        skillIds,
        available: true,
      } : null,
      company: role === 'COMPANY' ? {
        companyName: companyName.trim() || null,
        registrationNumber: registration.trim() || null,
      } : null,
    };

    adminApi.createUser(draft)
      .then(onDone)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title="Set someone up" onClose={onClose} width={620}>
      <div style={{
        background: t.surfaceMuted, border: `1px solid ${t.border}`, borderRadius: 11,
        padding: '11px 14px', marginBottom: 16, fontSize: 12.5, color: t.textMuted, lineHeight: 1.65,
      }}>
        There is no password field here, on purpose. The account is created unable to sign in, and
        an email goes to them with a link to choose their own — which nobody at this end ever sees.
        That is what keeps everything they later do provably theirs.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="First name">
          <Input value={firstName} onChange={setFirstName} placeholder="Mohamed" autoFocus />
        </Field>
        <Field label="Last name">
          <Input value={lastName} onChange={setLastName} placeholder="Conteh" />
        </Field>
      </div>

      <Field label="Email" hint="Where the setup link goes. It is the only way into the account.">
        <Input value={email} onChange={setEmail} placeholder="mohamed@example.com" />
      </Field>

      <Field label="Phone" hint="Optional.">
        <Input value={phone} onChange={setPhone} placeholder="+232 …" />
      </Field>

      <Field label="What kind of account">
        <Select value={role} onChange={value => setRole(value ?? 'INDIVIDUAL')} options={ROLE_OPTIONS} />
      </Field>

      {role === 'PROVIDER' ? (
        <div style={{
          border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, marginBottom: 14,
        }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: t.text, marginBottom: 3 }}>
            Their profile
          </div>
          <div style={{ fontSize: 11.5, color: t.textSubtle, marginBottom: 12, lineHeight: 1.6 }}>
            Fill this in and they are findable the moment they set their password. Leave it and they
            build it themselves later.
          </div>

          <Field label="Business or trading name">
            <Input value={businessName} onChange={setBusinessName} placeholder="Conteh Welding" />
          </Field>
          <Field label="What they do">
            <Input value={title} onChange={setTitle} placeholder="Welder and fabricator" />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
            <Field label="City"><Input value={city} onChange={setCity} placeholder="Bo" /></Field>
            <Field label="Years"><Input value={years} onChange={setYears} placeholder="12" /></Field>
            <Field label="Hourly rate"><Input value={rate} onChange={setRate} placeholder="45" /></Field>
          </div>

          <Field label="Services they offer" hint="From the catalogue, so nothing is invented here.">
            <MultiSelect
              values={skillIds}
              onChange={setSkillIds}
              options={skills}
              placeholder="Choose their trades"
              summary={values => values.length === 0 ? 'None chosen' : `${values.length} chosen`}
            />
          </Field>

          <Field label="About them" hint="Optional. Shown on their public profile.">
            <Textarea value={bio} onChange={setBio} rows={3} placeholder="Twelve years on gates, grilles and structural work." />
          </Field>
        </div>
      ) : null}

      {role === 'COMPANY' ? (
        <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <Field label="Company name">
            <Input value={companyName} onChange={setCompanyName} placeholder="Freetown Fixers Ltd" />
          </Field>
          <Field label="Registration number" hint="Optional.">
            <Input value={registration} onChange={setRegistration} placeholder="SL-123456" />
          </Field>
        </div>
      ) : null}

      <Field label="A line for their email" hint="Optional. They read this above the button.">
        <Input value={note} onChange={setNote} placeholder="Set up at the Bo office — welcome aboard." />
      </Field>

      <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 14 }}>
        <input
          type="checkbox"
          checked={sendEmail}
          onChange={event => setSendEmail(event.target.checked)}
          style={{ marginTop: 2, accentColor: t.brand, width: 15, height: 15 }}
        />
        <span>
          <span style={{ fontSize: 13, fontWeight: 700, color: t.text, display: 'block' }}>
            Send them the link now
          </span>
          <span style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.5 }}>
            Turn this off to create the account quietly and send the link later from this screen.
          </span>
        </span>
      </label>

      {error ? <div style={{ marginBottom: 12 }}><ErrorNote message={error} /></div> : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={!ready || busy} onClick={submit}>
          {busy ? 'Setting them up…' : 'Create the account'}
        </Button>
      </div>
    </Modal>
  );
}

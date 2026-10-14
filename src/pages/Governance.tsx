/**
 * Who may do what, and what the platform is currently doing.
 *
 * The most dangerous screen in the console. A roles editor is one careless save away from a
 * platform nobody can administer, so the guardrails are stated on the screen rather than
 * only enforced by the API: the roles that hold the console open are marked, and the
 * permission that opens it cannot be taken off them.
 *
 * The other thing this screen has to be honest about is the difference between "nobody has
 * decided" and "somebody decided nothing". Until a role is edited it runs on the defaults it
 * shipped with — showing that as an empty list would read as "this role can do nothing",
 * which is the opposite of true.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, Cell, ErrorNote, Field, Input, Loading, Modal, PageHeader,
  Actions, Pill, Row, Table, Textarea, Toasts, fmtDateTime, useToasts,
} from '../components/ui';
import { adminApi, settingsChanged, type AdminIdentity, type DemoPurgeReport, type FeatureBundleRow, type FeatureRow, type FeaturesResponse, type PermissionRow, type RoleDetail, type RolesResponse, type SettingRow, type SettingsResponse } from '../api/admin';
import { QrCode } from '../components/QrCode';

export function Governance({ identity }: { identity: AdminIdentity }) {
  const { t } = useTheme();
  const [tab, setTab] = useState<'features' | 'roles' | 'settings' | 'live'>('features');

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="What is switched on, what each role may do, and the values that change how Vacancy behaves."
      />

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['features', 'roles', 'settings', 'live'] as const).map(option => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            style={{
              background: tab === option ? t.brand : 'transparent',
              border: `1px solid ${tab === option ? t.brand : t.border}`,
              color: tab === option ? '#FFFFFF' : t.textMuted,
              borderRadius: 10, padding: '8px 15px', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {option === 'features' ? 'What is switched on'
              : option === 'roles' ? 'Roles and permissions'
                : option === 'settings' ? 'Platform settings' : 'Going live'}
          </button>
        ))}
      </div>

      {tab === 'features' ? <Features identity={identity} />
        : tab === 'roles' ? <Roles identity={identity} />
          : tab === 'settings' ? <Settings identity={identity} />
            : <GoingLive />}
    </>
  );
}

/* ---------------- going live ---------------- */

/**
 * Taking the development data back out of a live database.
 *
 * <p>THE SHAPE OF THIS SCREEN IS THE POINT. Preview first, always, and the preview is not an
 * estimate: the server runs the whole deletion inside a transaction and rolls it back, so what
 * is listed below is what actually happened rather than what a count query guessed — including
 * which populations the database would have refused and exactly which tables got touched.</p>
 *
 * <p>Read the table list before committing. The delete order is followed from the database's
 * own foreign keys rather than a list in the source, which is what keeps it correct as the
 * schema grows. A count against a table nobody expected is how a matching rule that caught too
 * much announces itself — and at that point nothing has been kept.</p>
 */
function GoingLive() {
  const { t } = useTheme();
  const { push, toasts } = useToasts();
  const [report, setReport] = useState<DemoPurgeReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);

  const preview = () => {
    setBusy(true);
    setError(null);
    adminApi.demoPurgePreview()
      .then(result => { setReport(result); setDone(false); })
      .catch(caught => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  const purge = () => {
    setBusy(true);
    adminApi.demoPurge()
      .then(result => {
        setReport(result);
        setDone(true);
        setConfirm(false);
        push(`${result.accounts} seeded accounts removed, ${result.rows} rows in total.`);
      })
      .catch(caught => push(caught instanceof Error ? caught.message : 'That did not work.', 'error'))
      .finally(() => setBusy(false));
  };

  const blocked = report?.groups.filter(group => group.blocked) ?? [];

  return (
    <>
      <Toasts toasts={toasts} />

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontWeight: 800, fontSize: 14.5, color: t.text }}>Remove the development data</div>
            <div style={{ color: t.textMuted, fontSize: 13, marginTop: 4, lineHeight: 1.55 }}>
              The demo marketplace providers and companies, the demo health cast, and the HR demo
              employees — everything seeded while building, in one pass. Every rule is anchored on
              an email domain that cannot receive mail, so no real person can match one. The App
              Review accounts and the platform administrator are excluded by name.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button tone="ghost" disabled={busy} onClick={preview}>
              {busy && !confirm ? 'Checking…' : report ? 'Check again' : 'See what would go'}
            </Button>
            {report && !done && report.accounts > 0 ? (
              <Button tone="danger" disabled={busy} onClick={() => setConfirm(true)}>Remove it</Button>
            ) : null}
          </div>
        </div>
      </Card>

      {error ? <ErrorNote message={error} /> : null}

      {report ? (
        <>
          <Card style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Pill tone={done ? 'success' : report.accounts === 0 ? 'success' : 'warning'}>
                {done ? 'removed' : report.accounts === 0 ? 'nothing left to remove' : 'nothing removed yet'}
              </Pill>
              <span style={{ color: t.text, fontSize: 13.5, fontWeight: 700 }}>
                {report.accounts} accounts · {report.rows} rows
              </span>
              {blocked.length > 0 ? <Pill tone="danger">{blocked.length} refused by the database</Pill> : null}
            </div>
            {!done && report.accounts > 0 ? (
              <div style={{ color: t.textMuted, fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>
                This was a real deletion, run and then rolled back — so these are the numbers it
                actually produced, not an estimate. Nothing has changed.
              </div>
            ) : null}
          </Card>

          <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
            {report.groups.map(group => (
              <Card key={group.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: t.text }}>{group.label}</span>
                  <Pill tone={group.blocked ? 'danger' : group.accounts > 0 ? 'warning' : 'success'}>
                    {group.blocked ? 'refused' : `${group.accounts} accounts`}
                  </Pill>
                  {!group.blocked && group.rows > 0 ? (
                    <span style={{ color: t.textMuted, fontSize: 12.5 }}>{group.rows} rows</span>
                  ) : null}
                </div>
                <div style={{ color: t.textMuted, fontSize: 12.5, marginTop: 5, lineHeight: 1.5 }}>{group.rule}</div>
                {group.blocker ? (
                  <div style={{ color: t.danger, fontSize: 12.5, marginTop: 7, lineHeight: 1.5 }}>{group.blocker}</div>
                ) : null}
                {group.sample.length > 0 ? (
                  <div style={{ color: t.textMuted, fontSize: 12.5, marginTop: 7, lineHeight: 1.7 }}>
                    {group.sample.map(one => <div key={one}>{one}</div>)}
                  </div>
                ) : null}
              </Card>
            ))}
          </div>

          {/* Kept, and said out loud. Apple signs in as the review pair on every update, not
              only the first — so "we did not touch these, and here is why" is the half of a
              destructive operation somebody actually needs to read. */}
          {report.protected.length > 0 ? (
            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, color: t.text, marginBottom: 6 }}>Kept on purpose</div>
              <div style={{ color: t.textMuted, fontSize: 12.5, lineHeight: 1.7 }}>
                {report.protected.map(one => <div key={one}>{one}</div>)}
              </div>
            </Card>
          ) : null}

          {Object.keys(report.tables).length > 0 ? (
            <Card>
              <div style={{ fontWeight: 800, fontSize: 13.5, color: t.text, marginBottom: 3 }}>Where it went</div>
              <div style={{ color: t.textMuted, fontSize: 12.5, marginBottom: 9, lineHeight: 1.5 }}>
                Every table the cascade reached. The order is followed from the database's own
                foreign keys, so read this for a table you did not expect.
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                {Object.entries(report.tables).map(([table, count]) => (
                  <div key={table} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: t.textMuted, fontFamily: 'ui-monospace, Menlo, monospace' }}>{table}</span>
                    <span style={{ color: t.text, fontWeight: 700 }}>{count}</span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </>
      ) : null}

      {confirm ? (
        <Modal title="Remove the development data?" onClose={() => setConfirm(false)}>
          <p style={{ color: t.textMuted, fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}>
            This permanently removes {report?.accounts} seeded accounts and {report?.rows} rows,
            across the tables listed behind this dialog. There is no undo. The App Review accounts
            and the platform administrator are excluded and stay.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button tone="ghost" onClick={() => setConfirm(false)}>Keep it</Button>
            <Button tone="danger" disabled={busy} onClick={purge}>
              {busy ? 'Removing…' : 'Remove it'}
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

/* ---------------- roles ---------------- */

function Roles({ identity }: { identity: AdminIdentity }) {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [data, setData] = useState<RolesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RoleDetail | null>(null);

  const load = useCallback(() => {
    adminApi.roles()
      .then(result => { setData(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load roles.'));
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const open = (roleId: string) => {
    adminApi.role(roleId)
      .then(setEditing)
      .catch((caught: unknown) => push(caught instanceof Error ? caught.message : 'Could not open that role.', 'error'));
  };

  const platform = data.roles.filter(role => !role.companyScoped);
  const company = data.roles.filter(role => role.companyScoped);

  return (
    <>
      <div style={{
        background: t.surfaceMuted, borderRadius: 11, padding: '12px 14px', marginBottom: 14,
        fontSize: 12.5, color: t.textMuted, lineHeight: 1.65,
      }}>
        A role that has never been edited runs on the permissions it shipped with — the count
        below is those. Once you save a role, the database is what counts, including when you
        save it with nothing ticked.
      </div>

      {[['Platform roles', platform], ['Company roles', company]] .map(([heading, roles]) => (
        (roles as typeof platform).length === 0 ? null : (
          <div key={heading as string} style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 9px', fontSize: 15, fontWeight: 800, color: t.text }}>{heading as string}</h2>
            <Card pad={0}>
              <Table head={['Role', 'People holding it', 'Can do', 'Decided', '']}>
                {(roles as typeof platform).map(role => (
                  <Row key={role.id}>
                    <Cell>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>{role.name}</span>
                        {role.protected ? <Pill tone="accent">holds the console open</Pill> : null}
                      </div>
                      {role.description ? (
                        <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 3 }}>{role.description}</div>
                      ) : null}
                    </Cell>
                    <Cell>{role.peopleHolding.toLocaleString()}</Cell>
                    <Cell>
                      <div style={{ fontSize: 13, color: t.text }}>
                        {role.permissionCount} {role.permissionCount === 1 ? 'permission' : 'permissions'}
                      </div>
                      {!role.configured ? (
                        <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>as it shipped</div>
                      ) : null}
                    </Cell>
                    <Cell>
                      {role.configured ? (
                        <>
                          <div style={{ fontSize: 12.5, color: t.text }}>{role.configuredBy ?? '—'}</div>
                          <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
                            {role.configuredAt ? fmtDateTime(role.configuredAt) : ''}
                          </div>
                        </>
                      ) : (
                        <span style={{ fontSize: 12.5, color: t.textSubtle }}>Nobody yet</span>
                      )}
                    </Cell>
                    <Cell style={{ textAlign: 'right' }}>
                      <Button size="sm" tone="subtle" onClick={() => open(role.id)}>
                        {data.canEdit && identity.isSuperAdmin ? 'Edit' : 'View'}
                      </Button>
                    </Cell>
                  </Row>
                ))}
              </Table>
            </Card>
          </div>
        )
      ))}

      {editing ? (
        <RoleEditor
          detail={editing}
          canEdit={data.canEdit && identity.isSuperAdmin}
          onClose={() => setEditing(null)}
          onDone={message => { push(message); load(); }}
        />
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

function RoleEditor({ detail, canEdit, onClose, onDone }: {
  detail: RoleDetail;
  canEdit: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useTheme();
  const [granted, setGranted] = useState<string[]>(
    detail.permissions.filter(permission => permission.granted).map(permission => permission.slug));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const areas = [...new Set(detail.permissions.map(permission => permission.area))].sort();
  const changed = granted.length !== detail.permissions.filter(p => p.granted).length
    || granted.some(slug => !detail.permissions.find(p => p.slug === slug)?.granted);
  const ready = canEdit && changed && reason.trim().length >= 6;

  // Stated on the screen, not only enforced by the API: this is the one edit that can leave
  // nobody able to get back in and fix it.
  const doorOpen = !detail.row.protected || granted.includes('permissions.users.manage');

  const toggle = (slug: string) => {
    setGranted(current => current.includes(slug)
      ? current.filter(value => value !== slug)
      : [...current, slug]);
  };

  const save = () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    adminApi.setRolePermissions(detail.row.id, granted, reason.trim())
      .then(result => { onDone(`${result.row.name} updated.`); onClose(); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title={`What ${detail.row.name} may do`} onClose={onClose} width={640}>
      {!detail.row.configured ? (
        <div style={{
          background: t.surfaceMuted, borderRadius: 10, padding: '11px 13px', marginBottom: 14,
          fontSize: 12.5, color: t.textMuted, lineHeight: 1.6,
        }}>
          Nobody has edited this role yet, so what you see is what it shipped with. Saving —
          even without changing anything — makes the database authoritative from then on.
        </div>
      ) : null}

      {detail.row.protected ? (
        <div style={{
          background: doorOpen ? t.surfaceMuted : t.warningSoft,
          border: `1px solid ${doorOpen ? t.border : t.warning}`,
          borderRadius: 10, padding: '11px 13px', marginBottom: 14,
          fontSize: 12.5, color: t.textMuted, lineHeight: 1.6,
        }}>
          <strong style={{ color: t.text }}>{detail.row.name} is what opens this console.</strong>{' '}
          {doorOpen
            ? '“Manage users” has to stay ticked — without it nobody could sign in here to undo a mistake.'
            : 'You have unticked “Manage users”. Saving that would lock every administrator out, so it will be refused.'}
        </div>
      ) : null}

      <div style={{ maxHeight: 340, overflowY: 'auto', margin: '0 -4px 14px', padding: '0 4px' }}>
        {areas.map(area => (
          <div key={area} style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 11, letterSpacing: 1.1, fontWeight: 800, color: t.textSubtle,
              textTransform: 'uppercase', marginBottom: 7,
            }}>
              {area}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 6 }}>
              {detail.permissions.filter(permission => permission.area === area).map(permission => (
                <PermissionTick
                  key={permission.slug}
                  permission={permission}
                  on={granted.includes(permission.slug)}
                  disabled={!canEdit}
                  onToggle={() => toggle(permission.slug)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {canEdit ? (
        <Field label="Why" hint="Required. Recorded on the audit trail with what changed.">
          <Input
            value={reason}
            onChange={setReason}
            placeholder="e.g. Moderators no longer need to suspend accounts"
            onEnter={save}
          />
        </Field>
      ) : (
        <div style={{ fontSize: 12.5, color: t.textSubtle, marginBottom: 14, lineHeight: 1.6 }}>
          Only a super administrator can change what a role may do.
        </div>
      )}

      {error ? <div style={{ marginBottom: 12 }}><ErrorNote message={error} /></div> : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
        <span style={{ marginRight: 'auto', fontSize: 12.5, color: t.textSubtle }}>
          {granted.length} of {detail.permissions.length} ticked
        </span>
        <Button tone="subtle" onClick={onClose}>Close</Button>
        {canEdit ? (
          <Button tone="primary" disabled={!ready || busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}

function PermissionTick({ permission, on, disabled, onToggle }: {
  permission: PermissionRow; on: boolean; disabled: boolean; onToggle: () => void;
}) {
  const { t } = useTheme();
  return (
    <label style={{
      display: 'flex', gap: 9, alignItems: 'flex-start', cursor: disabled ? 'default' : 'pointer',
      border: `1px solid ${on ? t.brand : t.border}`, background: on ? t.brandSoft : 'transparent',
      borderRadius: 10, padding: '9px 11px',
    }}>
      <input
        type="checkbox"
        checked={on}
        disabled={disabled}
        onChange={onToggle}
        style={{ marginTop: 2, accentColor: t.brand, width: 15, height: 15 }}
      />
      <span style={{ minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: t.text, display: 'block' }}>
          {permission.label}
        </span>
        <span style={{ fontSize: 11, color: t.textSubtle, wordBreak: 'break-all' }}>
          {permission.slug}
          {permission.isDefault ? ' · shipped on' : ''}
        </span>
      </span>
    </label>
  );
}

/* ---------------- the control panel ---------------- */

/**
 * What is switched on.
 *
 * <p>THE POINT OF THIS SCREEN IS THAT THE SWITCHES ARE REAL. Every one of them takes the
 * API's own routes away, not a button in the app — the prefixes are listed on each row so
 * that claim can be checked rather than believed. An old build, a cached screen and a curl
 * command all stop together.</p>
 *
 * <p>Two things a flat list of switches cannot say, and this screen must. First, a feature
 * can be switched on and still be off, because something it needs is off — Emergency without
 * Health. The row shows the switch and the live answer separately whenever they disagree.
 * Second, switching one thing off can take others with it; the row says which, before, not
 * after.</p>
 *
 * <p>The moves along the top are not a shortcut for typing. They are decisions somebody made
 * once, in the quiet, with a name on them — so that at two in the morning the operator picks
 * the name instead of remembering which four switches.</p>
 */
function Features({ identity }: { identity: AdminIdentity }) {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [data, setData] = useState<FeaturesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<FeatureRow | null>(null);
  const [move, setMove] = useState<FeatureBundleRow | null>(null);
  const [showing, setShowing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi.features()
      .then(result => { setData(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the control panel.'));
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const canEdit = data.canEdit && identity.isSuperAdmin;
  const off = data.features.filter(feature => !feature.effective);

  return (
    <>
      {/* The one line worth reading before anything else. Green is not decoration here —
          an operator glancing at this screen wants to know whether today is normal. */}
      <Card style={{ marginBottom: 14, borderColor: off.length ? t.warning : t.border }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: off.length ? t.warning : t.success }}>
              {off.length === 0
                ? 'Everything is switched on'
                : `${off.length} ${off.length === 1 ? 'feature is' : 'features are'} switched off`}
            </div>
            <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 5, lineHeight: 1.6, maxWidth: 640 }}>
              {off.length === 0
                ? 'The apps are drawing every door, and the API is answering for all of them.'
                : `The apps stop drawing ${off.length === 1 ? 'it' : 'them'}, and the API refuses ${off.length === 1 ? 'its' : 'their'} routes — ${off.map(feature => feature.label).join(', ')}.`}
            </div>
          </div>
          <div style={{ flexShrink: 0 }}>
            <Button size="sm" tone="subtle" onClick={() => setNotice(data.notice)} disabled={!canEdit}>
              {data.notice ? 'Change what people are told' : 'Add a line for people'}
            </Button>
          </div>
        </div>
        {data.notice ? (
          <div style={{
            marginTop: 12, padding: '9px 12px', borderRadius: 10,
            background: t.warningSoft, border: `1px solid ${t.warning}`,
            fontSize: 12.5, color: t.text, lineHeight: 1.55,
          }}>
            Shown in the apps: “{data.notice}”
          </div>
        ) : null}
      </Card>

      {/* Quick moves. Each says what it would actually change from here, so the one that
          would change nothing says so rather than asking for a reason to do nothing. */}
      <h2 style={{ margin: '0 0 9px', fontSize: 15, fontWeight: 800, color: t.text }}>Quick moves</h2>
      <div style={{
        display: 'grid', gap: 10, marginBottom: 20,
        gridTemplateColumns: 'repeat(auto-fill, minmax(232px, 1fr))',
      }}>
        {data.bundles.map(bundle => (
          <Card key={bundle.code} pad={14} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: t.text }}>{bundle.label}</div>
            <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.55, flex: 1 }}>
              {bundle.description}
            </div>
            <div style={{ fontSize: 11.5, color: t.textSubtle }}>
              {bundle.alreadyThere
                ? 'Nothing to change — already where this leaves things.'
                : `Would move ${bundle.changes.length} switch${bundle.changes.length === 1 ? '' : 'es'}.`}
            </div>
            <Button
              size="sm"
              tone={bundle.alreadyThere ? 'subtle' : 'primary'}
              disabled={!canEdit || bundle.alreadyThere}
              onClick={() => setMove(bundle)}
            >
              {bundle.alreadyThere ? 'Already done' : 'Review and apply'}
            </Button>
          </Card>
        ))}
      </div>

      {data.areas.map(area => (
        <div key={area} style={{ marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 9px', fontSize: 15, fontWeight: 800, color: t.text }}>{area}</h2>
          <Card pad={0}>
            {data.features.filter(feature => feature.area === area).map((feature, index, all) => (
              <div
                key={feature.code}
                // Named, not positioned. Inserting a feature above another must not silently
                // retarget whatever is pointing at this row.
                data-feature={feature.code}
                style={{
                  display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 18px',
                  borderBottom: index === all.length - 1 ? 'none' : `1px solid ${t.border}`,
                  // A hairline in the feature's own state, so the column reads at a glance
                  // without anybody parsing the pills.
                  borderLeft: `3px solid ${feature.effective ? 'transparent' : t.warning}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>{feature.label}</span>
                    <code style={{ fontSize: 11, color: t.textSubtle, fontFamily: 'ui-monospace, monospace' }}>
                      {feature.code}
                    </code>
                    {feature.on !== feature.default ? <Pill tone="info">changed</Pill> : null}
                    {!feature.reachesReads ? <Pill tone="neutral">changes only</Pill> : null}
                    {/* The case worth shouting about: the switch says on, the platform says
                        no. Without this the row is simply wrong. */}
                    {feature.on && !feature.effective ? <Pill tone="warning">held off by what it needs</Pill> : null}
                  </div>

                  <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 4, lineHeight: 1.6, maxWidth: 640 }}>
                    {feature.description}
                  </div>

                  {feature.on && feature.blocking.length > 0 ? (
                    <div style={{ fontSize: 11.5, color: t.warning, marginTop: 6, lineHeight: 1.5, fontWeight: 600 }}>
                      Switching this off also stops: {feature.blocking.join(', ')}
                    </div>
                  ) : null}

                  {feature.changedByName ? (
                    <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 5, lineHeight: 1.5 }}>
                      {feature.changedByName}
                      {feature.changedAt ? ` · ${fmtDateTime(feature.changedAt)}` : ''}
                      {feature.changeReason ? ` — ${feature.changeReason}` : ''}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setShowing(showing === feature.code ? null : feature.code)}
                    style={{
                      background: 'none', border: 'none', padding: '6px 0 0', cursor: 'pointer',
                      color: t.textSubtle, fontSize: 11.5, fontFamily: 'inherit', fontWeight: 600,
                    }}
                  >
                    {showing === feature.code ? 'Hide what it covers' : `What it covers (${feature.paths.length} routes)`}
                  </button>

                  {showing === feature.code ? (
                    <div style={{
                      marginTop: 7, padding: '9px 11px', borderRadius: 9,
                      background: t.brandSoft, border: `1px solid ${t.border}`,
                      fontSize: 11.5, color: t.textMuted, lineHeight: 1.75,
                      fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all',
                    }}>
                      {feature.paths.join('\n')}
                    </div>
                  ) : null}
                </div>

                <div style={{ flexShrink: 0, minWidth: 96, textAlign: 'right' }}>
                  <Button
                    size="sm"
                    tone={feature.on ? 'primary' : 'subtle'}
                    disabled={!canEdit}
                    onClick={() => setAsking(feature)}
                  >
                    {feature.on ? 'On' : 'Off'}
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </div>
      ))}

      {asking ? (
        <FeatureDialog
          feature={asking}
          onClose={() => setAsking(null)}
          onDone={(result, message) => { setData(result); push(message); settingsChanged(); }}
        />
      ) : null}

      {move ? (
        <BundleDialog
          bundle={move}
          onClose={() => setMove(null)}
          onDone={(result, message) => { setData(result); push(message); settingsChanged(); }}
        />
      ) : null}

      {notice !== null ? (
        <NoticeDialog
          value={notice}
          onClose={() => setNotice(null)}
          onDone={message => { push(message); load(); }}
        />
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

/**
 * Throwing one switch.
 *
 * <p>Always a dialog, never an inline flip. Every feature switch changes what somebody can do
 * in an app they are holding right now, and the API refuses to save one without a reason —
 * so a one-tap toggle would only be a way to discover that, twice.</p>
 */
export function FeatureDialog({ feature, onClose, onDone }: {
  feature: FeatureRow;
  onClose: () => void;
  onDone: (result: FeaturesResponse, message: string) => void;
}) {
  const { t } = useTheme();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const going = !feature.on;

  const save = () => {
    setBusy(true);
    setError(null);
    adminApi.setFeature(feature.code, going, reason.trim())
      .then(result => {
        onDone(result, `${feature.label} switched ${going ? 'on' : 'off'}.`);
        onClose();
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title={`Switch ${feature.label} ${going ? 'on' : 'off'}`} onClose={onClose} width={520}>
      <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.65, marginBottom: 12 }}>
        {feature.description}
      </div>

      {/* What actually happens, in the order somebody cares about it: to people first,
          to the API second. */}
      <div style={{
        padding: '11px 13px', borderRadius: 10, marginBottom: 14,
        background: going ? t.successSoft : t.warningSoft,
        border: `1px solid ${going ? t.success : t.warning}`,
        fontSize: 12.5, color: t.text, lineHeight: 1.6,
      }}>
        {going ? (
          <>The apps start drawing it again, and the API answers for its {feature.paths.length} routes.</>
        ) : (
          <>
            The apps stop drawing it. Anyone who asks anyway is told:
            {' '}“{feature.whenOff}”
            {feature.reachesReads
              ? ' Reads stop too — the pages go, not just the buttons.'
              : ' Reads keep working; nothing new can be created or changed.'}
            {feature.blocking.length > 0
              ? ` ${feature.blocking.join(' and ')} stop with it, because they need this.`
              : ''}
          </>
        )}
      </div>

      <Field
        label="Why"
        hint="Recorded against this switch and read back weeks later, when somebody asks why it moved."
      >
        <Textarea value={reason} onChange={setReason} rows={3} placeholder="The model was answering badly all afternoon." />
      </Field>

      {error ? <ErrorNote message={error} /> : null}

      <Actions>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone={going ? 'primary' : 'danger'} disabled={busy || !reason.trim()} onClick={save}>
          {busy ? 'Saving…' : going ? 'Switch it on' : 'Switch it off'}
        </Button>
      </Actions>
    </Modal>
  );
}

/** A named move, with every switch it would throw listed before it throws any of them. */
function BundleDialog({ bundle, onClose, onDone }: {
  bundle: FeatureBundleRow;
  onClose: () => void;
  onDone: (result: FeaturesResponse, message: string) => void;
}) {
  const { t } = useTheme();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setBusy(true);
    setError(null);
    adminApi.applyFeatureBundle(bundle.code, reason.trim())
      .then(result => {
        onDone(result, `${bundle.label} applied.`);
        onClose();
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title={bundle.label} onClose={onClose} width={520}>
      <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.65, marginBottom: 12 }}>
        {bundle.description}
      </div>

      <div style={{ border: `1px solid ${t.border}`, borderRadius: 11, overflow: 'hidden', marginBottom: 14 }}>
        {bundle.changes.map((change, index) => (
          <div
            key={change.code}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '9px 13px', fontSize: 12.5,
              borderBottom: index === bundle.changes.length - 1 ? 'none' : `1px solid ${t.border}`,
            }}
          >
            <span style={{ color: t.text, fontWeight: 600 }}>{change.label}</span>
            <span style={{ color: change.to ? t.success : t.warning, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {change.from ? 'On' : 'Off'} → {change.to ? 'On' : 'Off'}
            </span>
          </div>
        ))}
      </div>

      <Field label="Why" hint="Carried onto every switch this moves, so they read as one decision rather than five.">
        <Textarea value={reason} onChange={setReason} rows={3} placeholder="Costs ran away overnight; quieting everything optional until morning." />
      </Field>

      {error ? <ErrorNote message={error} /> : null}

      <Actions>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={busy || !reason.trim()} onClick={save}>
          {busy ? 'Applying…' : `Move ${bundle.changes.length} switch${bundle.changes.length === 1 ? '' : 'es'}`}
        </Button>
      </Actions>
    </Modal>
  );
}

/**
 * The line the apps show while anything is off.
 *
 * <p>Worth its own dialog because it is the only part of this screen a customer ever reads.
 * Each feature already says its own sentence; this is for the thing only today knows — when
 * you expect to be back.</p>
 */
function NoticeDialog({ value, onClose, onDone }: {
  value: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [text, setText] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setBusy(true);
    setError(null);
    adminApi.setSetting('features.notice', text.trim())
      .then(() => { onDone(text.trim() ? 'Saved.' : 'Removed.'); onClose(); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title="What to tell people" onClose={onClose} width={470}>
      <Field
        label="One line"
        hint="Added to whatever the switched-off feature already says. Leave it empty to say nothing extra."
      >
        <Textarea value={text} onChange={setText} rows={3} placeholder="Back on Monday morning." />
      </Field>

      {error ? <ErrorNote message={error} /> : null}

      <Actions>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
      </Actions>
    </Modal>
  );
}

/* ---------------- settings ---------------- */

function Settings({ identity }: { identity: AdminIdentity }) {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SettingRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi.settings()
      .then(result => { setData(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load settings.'));
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const canEdit = data.canEdit && identity.isSuperAdmin;

  // A switch with no consequences saves on the spot. One that changes what people can do
  // goes through a dialog, because it needs a reason and deserves a second look.
  const flip = (setting: SettingRow) => {
    if (setting.consequential) { setEditing(setting); return; }
    setBusy(setting.key);
    adminApi.setSetting(setting.key, setting.value === 'true' ? 'false' : 'true')
      .then(result => { push(`“${result.label}” saved.`); load(); settingsChanged(); })
      .catch((caught: unknown) => push(caught instanceof Error ? caught.message : 'That did not work.', 'error'))
      .finally(() => setBusy(null));
  };

  return (
    <>
      {data.groups.map(group => (
        <div key={group} style={{ marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 9px', fontSize: 15, fontWeight: 800, color: t.text }}>{group}</h2>
          <Card pad={0}>
            {data.settings.filter(setting => setting.group === group).map((setting, index, all) => (
              <div
                key={setting.key}
                // A stable hook so a test can name the setting it means. Position is not a
                // name: inserting one switch above another would silently retarget the test.
                data-setting={setting.key}
                style={{
                  display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 18px',
                  borderBottom: index === all.length - 1 ? 'none' : `1px solid ${t.border}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>{setting.label}</span>
                    {!setting.isDefault ? <Pill tone="info">changed</Pill> : null}
                    {setting.consequential ? <Pill tone="warning">has consequences</Pill> : null}
                  </div>
                  <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 4, lineHeight: 1.6, maxWidth: 620 }}>
                    {setting.description}
                  </div>
                  {setting.changedByName ? (
                    <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 5, lineHeight: 1.5 }}>
                      {setting.changedByName}
                      {setting.changedAt ? ` · ${fmtDateTime(setting.changedAt)}` : ''}
                      {setting.changeReason ? ` — ${setting.changeReason}` : ''}
                    </div>
                  ) : null}
                </div>

                <div style={{ flexShrink: 0, minWidth: 132, maxWidth: 280, textAlign: 'right' }}>
                  {setting.kind === 1 ? (
                    <Button
                      size="sm"
                      tone={setting.value === 'true' ? 'primary' : 'subtle'}
                      disabled={!canEdit || busy === setting.key}
                      onClick={() => flip(setting)}
                    >
                      {busy === setting.key ? '…' : setting.value === 'true' ? 'On' : 'Off'}
                    </Button>
                  ) : (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 5, wordBreak: 'break-word' }}>
                        {/* An empty setting used to draw as nothing, which put a Change
                            button beside a blank space and read as a bug. Empty is a real
                            answer for an address - it means "we are not on that store yet" -
                            so it says so. */}
                        {setting.value
                          ? (setting.kind === 2 || setting.kind === 4 ? setting.value : `“${setting.value}”`)
                          : <span style={{ color: t.textSubtle, fontWeight: 600 }}>Not set</span>}
                      </div>
                      <Button size="sm" tone="subtle" disabled={!canEdit} onClick={() => setEditing(setting)}>
                        Change
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </Card>
          {group === APP_GROUP ? <AppPreview settings={data.settings} /> : null}
        </div>
      ))}

      {editing ? (
        <SettingDialog
          setting={editing}
          onClose={() => setEditing(null)}
          onDone={message => { push(message); load(); }}
        />
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

/** Matched against the group name the API sends, which comes from the settings catalogue. */
const APP_GROUP = 'The app';

/**
 * What the addresses in this group actually produce.
 *
 * A store link is a string that looks exactly as right when it is wrong. Nothing on the
 * platform can tell the difference — the API checks that it is a well-formed https address and
 * stops there, because "is this the correct listing" is not a question software can answer.
 * A person can answer it in five seconds if they can see it, so here it is: the real code from
 * the real encoder, and both links as things to click.
 */
function AppPreview({ settings }: { settings: SettingRow[] }) {
  const { t } = useTheme();
  const value = (key: string) => settings.find(row => row.key === key)?.value?.trim() ?? '';

  const getUrl = value('app.get.url');
  const android = value('app.android.store.url');
  const ios = value('app.ios.store.url');

  if (!getUrl) return null;

  return (
    <Card style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ background: '#fff', padding: 10, borderRadius: 12, lineHeight: 0 }}>
          <QrCode size={150} title="The code printed on posters" value={getUrl} />
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: t.text, marginBottom: 4 }}>
            This is the code on the poster
          </div>
          <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6, marginBottom: 12 }}>
            Scan it with your own phone before you print anything. It should open your store —
            not this console, and not a page that does not exist. Changing “the address the QR
            code carries” changes this picture, and every poster already printed keeps pointing
            at the old one.
          </div>

          <PreviewLink label="The code goes to" t={t} url={getUrl} />
          <PreviewLink label="Android is sent to" missing="Not set — the QR code will offer nothing to an Android phone." t={t} url={android} />
          <PreviewLink label="iPhone is sent to" missing="Not set — the site shows Android only, which is correct until the App Store listing is live." t={t} url={ios} />
        </div>
      </div>
    </Card>
  );
}

function PreviewLink({ label, url, missing, t }: {
  label: string;
  url: string;
  missing?: string;
  t: ReturnType<typeof useTheme>['t'];
}) {
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3, color: t.textSubtle, textTransform: 'uppercase' }}>
        {label}
      </div>
      {url ? (
        <a
          href={url}
          rel="noreferrer noopener"
          target="_blank"
          style={{ fontSize: 12.5, color: t.brand, wordBreak: 'break-all', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
          {url}
        </a>
      ) : (
        <div style={{ fontSize: 12.5, color: t.textMuted }}>{missing ?? 'Not set.'}</div>
      )}
    </div>
  );
}

export function SettingDialog({ setting, onClose, onDone }: {
  setting: SettingRow;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useTheme();
  const [value, setValue] = useState(setting.kind === 1
    ? (setting.value === 'true' ? 'false' : 'true')
    : setting.value);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = (!setting.consequential || reason.trim().length >= 6)
    && (setting.kind !== 2 || /^\d+$/.test(value.trim()))
    // Empty is allowed: "we are not on the App Store yet" is a real answer and the platform
    // treats a blank address as "do not offer this one".
    && (setting.kind !== 4 || value.trim() === '' || /^https:\/\/[^\s.]+\.[^\s]+/.test(value.trim()));

  const save = () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    adminApi.setSetting(setting.key, value.trim(), reason.trim() || null)
      .then(result => { onDone(`“${result.label}” saved.`); onClose(); settingsChanged(); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title={setting.label} onClose={onClose} width={500}>
      <p style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.65, marginTop: 0 }}>
        {setting.description}
      </p>

      {setting.kind === 1 ? (
        <div style={{
          background: value === 'true' ? t.brandSoft : t.warningSoft,
          border: `1px solid ${value === 'true' ? t.brand : t.warning}`,
          borderRadius: 11, padding: '13px 15px', margin: '0 0 14px',
          fontSize: 13, color: t.text, fontWeight: 700,
        }}>
          Turning this {value === 'true' ? 'ON' : 'OFF'}.
        </div>
      ) : (
        <Field label={setting.kind === 2 ? 'The number' : setting.kind === 4 ? 'The address' : 'The words'}>
          {setting.kind === 2 || setting.kind === 4
            ? <Input value={value} onChange={setValue} placeholder={setting.default} onEnter={save} />
            : <Textarea value={value} onChange={setValue} placeholder={setting.default} rows={3} />}
        </Field>
      )}

      {setting.kind === 2 && !/^\d+$/.test(value.trim()) ? (
        <div style={{ fontSize: 12.5, color: t.warning, margin: '-6px 0 12px' }}>
          That has to be a whole number.
        </div>
      ) : null}

      {/* The API refuses this too. Saying so here saves a round trip and, more to the point,
          says it while the cursor is still in the field. */}
      {setting.kind === 4 && value.trim() && !/^https:\/\/[^\s.]+\.[^\s]+/.test(value.trim()) ? (
        <div style={{ fontSize: 12.5, color: t.warning, margin: '-6px 0 12px' }}>
          That has to be a full address starting with https://
        </div>
      ) : null}

      {setting.consequential ? (
        <Field label="Why" hint="Required — this one changes what people can do.">
          <Input value={reason} onChange={setReason} placeholder="e.g. Verification is three weeks behind" onEnter={save} />
        </Field>
      ) : null}

      <div style={{ fontSize: 11.5, color: t.textSubtle, marginBottom: 14, lineHeight: 1.6 }}>
        It ships as <strong style={{ color: t.textMuted }}>{setting.default}</strong>. Takes effect
        immediately, everywhere.
      </div>

      {error ? <div style={{ marginBottom: 12 }}><ErrorNote message={error} /></div> : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={!ready || busy} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Modal>
  );
}

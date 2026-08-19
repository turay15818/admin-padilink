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
  Pill, Row, Table, Textarea, Toasts, fmtDateTime, useToasts,
} from '../components/ui';
import { adminApi, settingsChanged, type AdminIdentity, type PermissionRow, type RoleDetail, type RolesResponse, type SettingRow, type SettingsResponse } from '../api/admin';
import { QrCode } from '../components/QrCode';

export function Governance({ identity }: { identity: AdminIdentity }) {
  const { t } = useTheme();
  const [tab, setTab] = useState<'roles' | 'settings'>('roles');

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="What each role is allowed to do, and the switches that change how Vacancy behaves."
      />

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['roles', 'settings'] as const).map(option => (
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
            {option === 'roles' ? 'Roles and permissions' : 'Platform settings'}
          </button>
        ))}
      </div>

      {tab === 'roles' ? <Roles identity={identity} /> : <Settings identity={identity} />}
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

function SettingDialog({ setting, onClose, onDone }: {
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

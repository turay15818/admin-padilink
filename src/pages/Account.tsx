/**
 * Your account, and — for a super administrator — other administrators' passwords.
 *
 * The reset half is deliberately narrow. It reaches console users and nobody else: a
 * provider or a customer resets their own password from the app, because an administrator
 * who can set someone's password can sign in as them, and that is not a power a support
 * request should hand over.
 *
 * Both forms post through the platform's encrypted envelope — a password never crosses
 * the wire in plain text, not even to an endpoint only administrators can reach.
 */
import { useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, ErrorNote, Field, Input, PageHeader, Pill, Toasts, useToasts,
} from '../components/ui';
import { Select } from '../components/Select';
import { Strength, strengthComplaint, suggestPassword } from '../components/Password';
import { adminApi, type AdminIdentity, type AdminTeamMember } from '../api/admin';

export function Account({ identity }: { identity: AdminIdentity }) {
  const { t, name: themeName, toggle } = useTheme();
  const { toasts, push } = useToasts();

  return (
    <>
      <PageHeader
        title="Account"
        subtitle="Your sign-in, and — if you are a super administrator — the other administrators'."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))', gap: 14, alignItems: 'start' }}>
        <Card>
          <SectionTitle>Who you are</SectionTitle>
          <Line label="Name" value={identity.name} />
          <Line label="Email" value={identity.email ?? '—'} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {identity.roles.map(role => (
              <Pill key={role} tone={role === 'SUPER_ADMIN' ? 'accent' : 'info'}>{role}</Pill>
            ))}
          </div>
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${t.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>Appearance</div>
                <div style={{ fontSize: 12, color: t.textSubtle }}>Follows your system until you choose.</div>
              </div>
              <Button size="sm" tone="subtle" onClick={toggle}>
                {themeName === 'dark' ? '☀ Light' : '☾ Dark'}
              </Button>
            </div>
          </div>
        </Card>

        <ChangePassword onDone={push} email={identity.email} />
      </div>

      {identity.isSuperAdmin ? (
        <div style={{ marginTop: 14 }}>
          <ResetAnother onDone={push} myUserId={identity.userId} />
        </div>
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

/* ---------- your own password ---------- */

function ChangePassword({ onDone, email }: {
  onDone: (message: string, tone?: 'ok' | 'error') => void;
  /** So the "not your own email address" rule reads the same here as it does on the server. */
  email: string | null;
}) {
  const { t } = useTheme();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complaint = strengthComplaint(next, email);
  const ready = current.length > 0 && next.length > 0 && next === again && !complaint;

  const submit = () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    adminApi.changeMyPassword(current, next)
      .then(result => {
        onDone(result?.message ?? 'Password changed.');
        setCurrent(''); setNext(''); setAgain('');
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Card>
      <SectionTitle>Change your password</SectionTitle>
      <p style={{ fontSize: 12.5, color: t.textMuted, margin: '0 0 14px', lineHeight: 1.6 }}>
        Asks for your current one, even though you are already signed in — a borrowed screen
        should not be enough to lock you out of your own account.
      </p>

      <Field label="Current password">
        <Input type="password" value={current} onChange={setCurrent} placeholder="••••••••••••" />
      </Field>
      <Field label="New password">
        <Input type="password" value={next} onChange={setNext} placeholder="At least 12 characters" onEnter={submit} />
      </Field>
      <Strength password={next} email={email} />
      <Field label="New password again">
        <Input type="password" value={again} onChange={setAgain} placeholder="Type it once more" onEnter={submit} />
      </Field>

      {again.length > 0 && next !== again ? (
        <div style={{ fontSize: 12.5, color: t.warning, marginBottom: 10 }}>Those two do not match.</div>
      ) : null}
      {error ? <div style={{ marginBottom: 12 }}><ErrorNote message={error} /></div> : null}

      <Button tone="primary" disabled={!ready || busy} onClick={submit}>
        {busy ? 'Changing…' : 'Change password'}
      </Button>
    </Card>
  );
}

/* ---------- another administrator's ---------- */

function ResetAnother({ onDone, myUserId }: {
  onDone: (message: string, tone?: 'ok' | 'error') => void;
  myUserId: string;
}) {
  const { t } = useTheme();
  const [admins, setAdmins] = useState<AdminTeamMember[] | null>(null);
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Asked of the API. The console used to filter `userType === 4` here — that is
  // SUPER_ADMIN, not ADMIN — so every ordinary administrator was missing from the one
  // list meant to reach them. The API decides who is a console user from permissions,
  // which is the same rule it enforces when the reset is actually submitted.
  useEffect(() => {
    adminApi.team()
      .then(result => setAdmins(result.members.filter(row => row.id !== myUserId)))
      .catch(() => setAdmins([]));
  }, [myUserId]);

  const chosen = admins?.find(row => row.id === userId) ?? null;
  const complaint = strengthComplaint(password, chosen?.email);
  const ready = Boolean(userId) && !complaint && reason.trim().length >= 6;

  const submit = () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    adminApi.resetPassword(userId, { newPassword: password, reason: reason.trim(), notifyByEmail: notify })
      .then(result => {
        onDone(result?.message ?? 'Password reset.');
        setUserId(''); setPassword(''); setReason(''); setNotify(false);
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Card>
      <SectionTitle>Reset an administrator's password</SectionTitle>
      <p style={{ fontSize: 12.5, color: t.textMuted, margin: '0 0 4px', lineHeight: 1.6 }}>
        Super administrators only, and only for other administrators.
      </p>
      <p style={{ fontSize: 12.5, color: t.textSubtle, margin: '0 0 14px', lineHeight: 1.6 }}>
        Providers and customers are deliberately out of reach here — they reset their own
        password from the app. Anyone who can set a password can sign in as that person.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
        <Field label="Administrator">
          <Select
            value={userId}
            onChange={setUserId}
            placeholder={admins === null ? 'Loading…' : admins.length === 0 ? 'No other administrators' : 'Choose an administrator'}
            options={(admins ?? []).map(admin => ({
              value: admin.id,
              label: admin.name,
              detail: [admin.email, admin.isSuperAdmin ? 'Super administrator' : 'Administrator']
                .filter(Boolean).join(' · '),
            }))}
          />
        </Field>
        <Field label="New password">
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Input type="password" value={password} onChange={setPassword} placeholder="At least 12 characters" />
            </div>
            <Button size="sm" tone="subtle" onClick={() => setPassword(suggestPassword())}>Suggest</Button>
          </div>
        </Field>
      </div>

      <Strength password={password} email={chosen?.email} />

      <Field label="Why" hint="Required. Recorded on the audit trail beside your name.">
        <Input value={reason} onChange={setReason} placeholder="e.g. Lost their phone and the password with it" onEnter={submit} />
      </Field>

      <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 14, maxWidth: 460 }}>
        <input
          type="checkbox"
          checked={notify}
          onChange={event => setNotify(event.target.checked)}
          style={{ marginTop: 2, accentColor: t.brand, width: 15, height: 15 }}
        />
        <span>
          <span style={{ fontSize: 13, fontWeight: 700, color: t.text, display: 'block' }}>Email them the new password</span>
          <span style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.5 }}>
            Off by default — a password sitting in an inbox is a password anyone with that
            inbox has. Leave it off and tell them another way.
          </span>
        </span>
      </label>

      {error ? <div style={{ marginBottom: 12 }}><ErrorNote message={error} /></div> : null}

      <Button tone="danger" disabled={!ready || busy} onClick={submit}>
        {busy ? 'Resetting…' : 'Reset password'}
      </Button>
    </Card>
  );
}

/* ---------- pieces ---------- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <h2 style={{ margin: '0 0 10px', fontSize: 15.5, fontWeight: 800, color: t.text, letterSpacing: -0.2 }}>
      {children}
    </h2>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  const { t } = useTheme();
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 13, marginBottom: 5 }}>
      <span style={{ color: t.textSubtle, minWidth: 60 }}>{label}</span>
      <span style={{ color: t.text, fontWeight: 600, wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

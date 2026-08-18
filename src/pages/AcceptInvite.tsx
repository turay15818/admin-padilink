/**
 * The other end of an invitation.
 *
 * Reached with no session, from a link in an email, by somebody who may not have an account
 * yet — so it is the only screen in the console that renders before the gate. It asks for
 * one thing, a password, and it never shows one: the person inviting them chose an address
 * and a role, not a secret.
 *
 * A wrong, withdrawn, used or expired link all land in the same place with the same
 * sentence. Telling them apart would turn a public URL into a way of asking whether an
 * address was ever invited.
 */
import { useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { Button, ErrorNote, Field, Input, Spinner } from '../components/ui';
import { Strength, strengthComplaint } from '../components/Password';
import { Icon } from '../components/Icon';
import { adminApi, type AdminInviteBrief } from '../api/admin';

export function AcceptInvite({ token }: { token: string }) {
  const { t } = useTheme();
  const [brief, setBrief] = useState<AdminInviteBrief | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    adminApi.inviteBrief(token)
      .then(result => {
        setBrief(result);
        if (result.name) setName(result.name);
      })
      .catch(() => setBrief({
        valid: false, email: null, name: null, invitedByName: null, expiresAt: null,
        needsPassword: false,
        message: 'We could not check that link. Try again in a moment.',
      }));
  }, [token]);

  const complaint = strengthComplaint(password, brief?.email);
  const needsPassword = brief?.needsPassword ?? true;
  const ready = needsPassword ? !complaint && password === again : true;

  const submit = () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    adminApi.acceptInvite(token, name.trim(), password)
      .then(() => setDone(true))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <div style={{
      minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 22,
    }}>
      <div style={{
        width: '100%', maxWidth: 440, background: t.surface, border: `1px solid ${t.border}`,
        borderRadius: 18, padding: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 22 }}>
          <svg width={32} height={32} viewBox="0 0 100 100" aria-label="Vacancy">
            <path d="M17 47 L39 71" stroke={t.text} strokeWidth="15" strokeLinecap="round" fill="none" />
            <path d="M39 71 L85 17" stroke="#FF6B2C" strokeWidth="15" strokeLinecap="round" fill="none" />
          </svg>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: t.text, letterSpacing: -0.3 }}>Vacancy</div>
            <div style={{ fontSize: 9.5, letterSpacing: 2.2, color: t.textSubtle, fontWeight: 700 }}>ADMIN CONSOLE</div>
          </div>
        </div>

        {brief === null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, color: t.textMuted, fontSize: 13.5 }}>
            <Spinner size={18} /> Checking your invitation…
          </div>
        ) : done ? (
          <>
            <Badge tone="success" icon="certificate" label="You are in" />
            <h1 style={{ fontSize: 21, fontWeight: 800, color: t.text, margin: '14px 0 8px', letterSpacing: -0.4 }}>
              Your access is live
            </h1>
            <p style={{ fontSize: 13.5, color: t.textMuted, lineHeight: 1.65, margin: '0 0 20px' }}>
              Sign in with <strong style={{ color: t.text }}>{brief.email}</strong> and the password you
              just chose. You will be asked for a code from your email as well, every time — that is
              normal, and it is the second lock on this door.
            </p>
            <Button tone="primary" onClick={() => { window.location.href = '/'; }}>Go to sign in</Button>
          </>
        ) : !brief.valid ? (
          <>
            <Badge tone="warning" icon="warn" label="Link expired" />
            <h1 style={{ fontSize: 21, fontWeight: 800, color: t.text, margin: '14px 0 8px', letterSpacing: -0.4 }}>
              This link no longer works
            </h1>
            <p style={{ fontSize: 13.5, color: t.textMuted, lineHeight: 1.65, margin: '0 0 20px' }}>
              {brief.message}
            </p>
            <p style={{ fontSize: 12.5, color: t.textSubtle, lineHeight: 1.65, margin: 0 }}>
              Invitations last seven days and work once. If yours has run out, whoever invited you can
              send a fresh one from the Admin team screen — it takes them a moment.
            </p>
          </>
        ) : (
          <>
            <Badge tone="info" icon="mail" label="Invitation" />
            <h1 style={{ fontSize: 21, fontWeight: 800, color: t.text, margin: '14px 0 8px', letterSpacing: -0.4 }}>
              {brief.invitedByName ? `${brief.invitedByName} invited you in` : 'You have been invited in'}
            </h1>
            <p style={{ fontSize: 13.5, color: t.textMuted, lineHeight: 1.65, margin: '0 0 20px' }}>
              {brief.message} The console is where accounts, services, documents and adverts are
              managed — so the password you pick here matters more than most.
            </p>

            <div style={{
              background: t.surfaceMuted, borderRadius: 10, padding: '10px 13px', marginBottom: 18,
              fontSize: 12.5, color: t.textMuted,
            }}>
              Signing in as <strong style={{ color: t.text }}>{brief.email}</strong>
            </div>

            {needsPassword ? (
              <>
                <Field label="Your name">
                  <Input value={name} onChange={setName} placeholder="e.g. Zainab Bah" />
                </Field>
                <Field label="Choose a password">
                  <Input
                    type="password" value={password} onChange={setPassword}
                    placeholder="At least 12 characters"
                  />
                </Field>
                <Strength password={password} email={brief.email} />
                <Field label="Type it once more">
                  <Input type="password" value={again} onChange={setAgain} placeholder="Again" onEnter={submit} />
                </Field>
                {again.length > 0 && password !== again ? (
                  <div style={{ fontSize: 12.5, color: t.warning, marginBottom: 10 }}>Those two do not match.</div>
                ) : null}
              </>
            ) : (
              <p style={{ fontSize: 12.5, color: t.textSubtle, lineHeight: 1.65, margin: '0 0 18px' }}>
                Nothing to fill in — you already have an account, so accepting simply adds the console
                to it. Your existing password stays exactly as it is.
              </p>
            )}

            {error ? <div style={{ marginBottom: 14 }}><ErrorNote message={error} /></div> : null}

            <Button tone="primary" disabled={!ready || busy} onClick={submit}>
              {busy ? 'Setting up…' : needsPassword ? 'Create my account' : 'Accept the invitation'}
            </Button>

            <p style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.6, margin: '16px 0 0' }}>
              Not expecting this? Close the page — nothing happens until you accept, and the link
              expires on its own.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Badge({ tone, icon, label }: {
  tone: 'success' | 'warning' | 'info';
  icon: 'certificate' | 'warn' | 'mail';
  label: string;
}) {
  const { t } = useTheme();
  const colour = tone === 'success' ? t.success : tone === 'warning' ? t.warning : t.info;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 11px', borderRadius: 999,
      background: `${colour}1A`, color: colour, fontSize: 11.5, fontWeight: 800, letterSpacing: 0.4,
      textTransform: 'uppercase',
    }}>
      <Icon name={icon} size={13} />
      {label}
    </div>
  );
}

/**
 * Everything about setting a password, in one place.
 *
 * It lives here rather than on a page because the same rules have to be told the same way
 * in three places — your own account, another administrator's record, and an invitation
 * being accepted. Three copies of "at least 12 characters" is three chances to drift out
 * of step with the server, and the server is the one that actually refuses.
 */
import { useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { Button, ErrorNote, Field, Input, Modal, Pill } from './ui';
import { adminApi } from '../api/admin';

/**
 * Mirrors the server's rules and returns the FIRST complaint only. Six rules listed at
 * once is not advice, it is a wall — and the server answers the same way, so the two
 * never contradict each other.
 *
 * `email` is optional: the server also refuses a password containing the account's own
 * email local part, but only when that part is distinctive enough (5 characters or more)
 * for the rule to mean something. "desk@…" would otherwise ban every password with
 * "desk" anywhere in it.
 */
export function strengthComplaint(password: string, email?: string | null): string | null {
  if (password.length === 0) return 'Enter a password.';
  if (password.length < 12) return 'Use at least 12 characters — this account can suspend people.';
  if (password.length > 128) return 'That is longer than 128 characters.';
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) return 'Mix upper and lower case.';
  if (!/[0-9]/.test(password)) return 'Include at least one number.';
  if (/^[A-Za-z0-9]+$/.test(password)) return 'Include at least one symbol.';

  const local = (email ?? '').split('@')[0];
  if (local.length >= 5 && password.toLowerCase().includes(local.toLowerCase())) {
    return 'Do not put your own email address in your password.';
  }
  return null;
}

export function Strength({ password, email }: { password: string; email?: string | null }) {
  const { t } = useTheme();
  if (!password) return null;
  const complaint = strengthComplaint(password, email);

  // Once the rules are met, length is what still matters. 20 characters is the point where
  // extra length stops being the interesting variable.
  const score = complaint ? 0 : Math.min(1, (password.length - 11) / 9);
  const colour = complaint ? t.warning : score > 0.7 ? t.success : t.info;
  const verdict = complaint ?? (score > 0.7 ? 'Strong.' : 'Good — a few more characters would make it stronger.');

  return (
    <div style={{ margin: '-4px 0 12px' }}>
      <div style={{ height: 3, background: t.border, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${complaint ? 18 : 40 + score * 60}%`, background: colour,
          transition: 'width .25s ease, background .25s ease',
        }} />
      </div>
      <div style={{ fontSize: 11.5, color: colour, marginTop: 5, lineHeight: 1.5 }}>{verdict}</div>
    </div>
  );
}

/**
 * A generator, because the honest way to set someone else's password is to use one neither
 * of you will remember. Avoids the character pairs that get misread when a password is
 * dictated over a phone — no 0/O, no 1/l/I.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const SYMBOLS = '!#$%&*+-=?@';

export function suggestPassword(): string {
  const values = crypto.getRandomValues(new Uint32Array(18));
  let out = '';
  for (let index = 0; index < 16; index++) out += ALPHABET[values[index] % ALPHABET.length];
  // Guaranteed, not hoped for: the rules want a digit and a symbol, so place them.
  return `${out.slice(0, 8)}${SYMBOLS[values[16] % SYMBOLS.length]}${out.slice(8)}${values[17] % 10}`;
}

/* ---------- setting someone else's ---------- */

/**
 * Set an administrator's password from their own record.
 *
 * This lives on the person, not in a settings screen, because that is where an
 * administrator goes looking when someone says "I am locked out" — they open that person,
 * not a list of every administrator.
 */
export function SetPasswordDialog({ user, onClose, onDone }: {
  user: { id: string; name: string; email: string | null; isConsoleUser: boolean };
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useTheme();
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complaint = strengthComplaint(password, user.email);
  const ready = user.isConsoleUser && !complaint && reason.trim().length >= 6;

  const submit = () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    adminApi.resetPassword(user.id, { newPassword: password, reason: reason.trim(), notifyByEmail: notify })
      .then(result => {
        onDone(result?.message ?? `${user.name}'s password is set.`);
        onClose();
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title={`Set a password for ${user.name}`} onClose={onClose} width={520}>
      {!user.isConsoleUser ? (
        <div style={{
          background: t.warningSoft, border: `1px solid ${t.warning}`,
          borderRadius: 10, padding: '11px 13px', marginBottom: 14,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 3 }}>
            This account is not an administrator.
          </div>
          <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6 }}>
            Providers and customers reset their own password from the app. Anyone who can set
            a password can sign in as that person, so this door is closed on purpose — the
            API refuses it too, not just this screen.
          </div>
        </div>
      ) : (
        <p style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.6, margin: '0 0 14px' }}>
          They keep their access; only the password changes. Tell them the new one in
          person or by phone — then ask them to change it themselves once they are in.
        </p>
      )}

      <Field label="New password">
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Input
              type={reveal ? 'text' : 'password'}
              value={password}
              onChange={setPassword}
              placeholder="At least 12 characters"
            />
          </div>
          <Button size="sm" tone="subtle" onClick={() => setReveal(value => !value)}>
            {reveal ? 'Hide' : 'Show'}
          </Button>
          <Button size="sm" tone="subtle" onClick={() => { setPassword(suggestPassword()); setReveal(true); }}>
            Suggest
          </Button>
        </div>
      </Field>
      <Strength password={password} email={user.email} />

      <Field label="Why" hint="Required. Recorded on the audit trail beside your name.">
        <Input value={reason} onChange={setReason} placeholder="e.g. Lost their phone and the password with it" onEnter={submit} />
      </Field>

      <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 14 }}>
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

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
        <span style={{ marginRight: 'auto' }}><Pill tone="danger">Sensitive</Pill></span>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="danger" disabled={!ready || busy} onClick={submit}>
          {busy ? 'Setting…' : 'Set password'}
        </Button>
      </div>
    </Modal>
  );
}

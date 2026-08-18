/**
 * The front door, and the first thing anyone sees.
 *
 * Two steps, one screen: password, then the six-digit code emailed to the address on file.
 * The left half is a living stage that states what the platform is; the right half is the
 * form, which stays completely ordinary to use — the animation never delays a keystroke,
 * and below 1000px the stage steps aside entirely so a phone gets a form, not a poster.
 *
 * A non-administrator who signs in correctly is still turned away, and by the time this
 * screen says so, the attempt is already on the audit trail.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { ErrorNote, Spinner } from '../components/ui';
import { Aurora } from '../components/Aurora';
import { Icon, type IconName } from '../components/Icon';
import { mono } from '../theme/theme';
import { adminApi, type AdminChallenge, type AdminIdentity } from '../api/admin';
import { config } from '../api/client';
import { describeDevice } from '../api/secure';

const ORANGE = '#FF6B2C';

/* ---------- the mark, drawn stroke by stroke on arrival ---------- */

function AnimatedMark({ size = 54, onNavy = true, delay = 0 }: { size?: number; onNavy?: boolean; delay?: number }) {
  const short = onNavy ? '#FFFFFF' : '#2A4E82';
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="Vacancy" style={{ display: 'block' }}>
      <path className="vac-arm" style={{ animationDelay: `${delay}ms` }}
        d="M17 47 L39 71" stroke={short} strokeWidth="15" strokeLinecap="round" fill="none" />
      <path className="vac-arm" style={{ animationDelay: `${delay + 260}ms` }}
        d="M39 71 L85 17" stroke={ORANGE} strokeWidth="15" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/* ---------- six boxes that behave like one field ---------- */

function CodeInput({ value, onChange, onComplete, disabled, length = 6 }: {
  value: string; onChange: (value: string) => void;
  /**
   * Handed the finished code, NOT left to read it from state. The sixth keystroke and the
   * re-render that follows it are two different moments; a parent reading `code` here would
   * still see five digits and quietly do nothing.
   */
  onComplete: (code: string) => void;
  disabled?: boolean; length?: number;
}) {
  const { t } = useTheme();
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  // On arrival, and again whenever a rejected code is wiped, the cursor goes back to box one.
  useEffect(() => { if (!value) refs.current[0]?.focus(); }, [value]);

  const setAt = (index: number, character: string) => {
    const next = (value.padEnd(length, ' ').substring(0, index) + character + value.padEnd(length, ' ').substring(index + 1))
      .replace(/\s/g, '')
      .slice(0, length);
    onChange(next);
    if (character && index < length - 1) refs.current[index + 1]?.focus();
    if (next.length === length) onComplete(next);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${length}, 1fr)`, gap: 10 }}>
      {Array.from({ length }, (_, index) => {
        const filled = Boolean(value[index]);
        const isNext = !filled && value.length === index;
        return (
          <input
            key={index}
            className="vac-code"
            ref={element => { refs.current[index] = element; }}
            value={value[index] ?? ''}
            disabled={disabled}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            aria-label={`Digit ${index + 1} of ${length}`}
            onChange={event => {
              const digits = event.target.value.replace(/\D/g, '');
              if (!digits) return;
              // A pasted code fills every box at once.
              if (digits.length > 1) {
                const pasted = digits.slice(0, length);
                onChange(pasted);
                if (pasted.length === length) onComplete(pasted);
                return;
              }
              setAt(index, digits);
            }}
            onKeyDown={event => {
              if (event.key === 'Backspace') {
                event.preventDefault();
                if (value[index]) setAt(index, '');
                else if (index > 0) { refs.current[index - 1]?.focus(); onChange(value.slice(0, index - 1)); }
              }
              if (event.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
              if (event.key === 'ArrowRight' && index < length - 1) refs.current[index + 1]?.focus();
            }}
            style={{
              width: '100%', boxSizing: 'border-box', height: 62, textAlign: 'center',
              fontSize: 25, fontWeight: 800, fontFamily: mono, color: t.text,
              background: filled ? t.accentSoft : t.surfaceMuted,
              border: `1.5px solid ${filled ? ORANGE : isNext ? t.borderStrong : t.border}`,
              borderRadius: 13, outline: 'none',
              transition: 'border-color .16s ease, transform .16s ease, background .16s ease',
              transform: filled ? 'translateY(-2px)' : 'none',
              animation: isNext && !disabled ? 'vac-await 1.7s ease-in-out infinite' : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

/* ---------- what this place actually does ---------- */

const PROOFS: { icon: IconName; title: string; detail: string }[] = [
  { icon: 'certificate', title: 'Certificates', detail: 'Issued here, checkable by anyone holding the number.' },
  { icon: 'agreement', title: 'Work agreements', detail: 'Terms agreed in writing, verifiable in seconds.' },
  { icon: 'training', title: 'Skills training', detail: 'Taught by the people who already do the work.' },
  { icon: 'audit', title: 'Full audit trail', detail: 'Every action here carries a name and a reason.' },
];

const TRUST: { icon: IconName; label: string }[] = [
  { icon: 'lock', label: 'Credentials sealed in your browser' },
  { icon: 'mail', label: 'Second factor by email' },
  { icon: 'audit', label: 'Every action audited' },
];

export function SignIn({ onSignedIn }: { onSignedIn: (identity: AdminIdentity) => void }) {
  const { t, name: themeName, toggle } = useTheme();
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<AdminChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proof, setProof] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [resendIn, setResendIn] = useState(0);

  const device = useMemo(() => describeDevice(), []);
  const dark = themeName === 'dark';

  // The highlight walks the four cards — a heartbeat, not a carousel demanding attention.
  useEffect(() => {
    const timer = window.setInterval(() => setProof(index => (index + 1) % PROOFS.length), 3200);
    return () => window.clearInterval(timer);
  }, []);

  // Countdowns for the code's life and the resend cool-down.
  useEffect(() => {
    if (!challenge) return;
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.round((new Date(challenge.expiresAt).getTime() - Date.now()) / 1000)));
      setResendIn(Math.max(0, Math.round((new Date(challenge.resendAvailableAt).getTime() - Date.now()) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [challenge]);

  const startSignIn = () => {
    if (busy) return;
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setBusy(true);
    setError(null);
    adminApi.start(email.trim(), password, device)
      .then(result => { setChallenge(result); setStep('code'); setCode(''); setPassword(''); setReveal(false); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Sign-in failed.'))
      .finally(() => setBusy(false));
  };

  const verify = (submitted?: string) => {
    const value = submitted ?? code;
    if (busy || !challenge || value.length < challenge.codeLength) return;
    setBusy(true);
    setError(null);
    adminApi.verify(challenge.challengeId, value, device)
      .then(identity => onSignedIn(identity))
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'That did not work.');
        setCode('');
      })
      .finally(() => setBusy(false));
  };

  const resend = () => {
    if (!challenge || resendIn > 0 || busy) return;
    setBusy(true);
    setError(null);
    adminApi.resend(challenge.challengeId)
      .then(result => { setChallenge(result); setCode(''); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not resend.'))
      .finally(() => setBusy(false));
  };

  const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const field = {
    width: '100%', boxSizing: 'border-box' as const, padding: '14px 44px 14px 42px', borderRadius: 12,
    border: `1.5px solid ${t.border}`, background: t.surfaceMuted, color: t.text,
    fontSize: 14.5, fontFamily: 'inherit', outline: 'none',
  };

  return (
    <div className="vac-signin" style={{ background: t.bg }}>
      <style>{`
        .vac-signin { min-height: 100vh; display: flex; overflow: hidden; }

        /* the stage */
        .vac-stage {
          flex: 1 1 auto; box-sizing: border-box; position: relative; display: flex;
          flex-direction: column; justify-content: space-between; gap: 34px;
          padding: 46px 54px; min-width: 0; color: #FFFFFF;
        }
        /* Guarantees text contrast no matter where the aurora drifts. */
        .vac-stage::after {
          content: ''; position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(180deg, rgba(4,10,20,.45) 0%, rgba(4,10,20,.10) 38%, rgba(4,10,20,.55) 100%);
        }
        .vac-stage > * { position: relative; z-index: 1; }

        /* the form */
        .vac-panel {
          flex: 0 0 clamp(400px, 33%, 540px); box-sizing: border-box; position: relative;
          display: flex; flex-direction: column; justify-content: center;
          padding: 40px 46px; min-width: 0;
        }
        .vac-form { width: 100%; max-width: 396px; margin: 0 auto; }

        .vac-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; max-width: 560px; }
        .vac-card {
          box-sizing: border-box; padding: 15px 16px; border-radius: 15px;
          background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.10);
          transition: background .5s ease, border-color .5s ease, transform .5s ease;
        }
        .vac-card[data-live="1"] {
          background: rgba(255,107,44,.13); border-color: rgba(255,107,44,.55); transform: translateY(-3px);
        }

        .vac-field:focus { border-color: ${ORANGE} !important; box-shadow: 0 0 0 4px rgba(255,107,44,.16); }
        .vac-code:focus { border-color: ${ORANGE} !important; box-shadow: 0 0 0 4px rgba(255,107,44,.16); }

        .vac-cta {
          position: relative; overflow: hidden; width: 100%; height: 50px; border: none;
          border-radius: 13px; cursor: pointer; font-family: inherit; font-size: 15px; font-weight: 800;
          color: #FFFFFF; background: linear-gradient(96deg, #FF7A3D 0%, #FF6B2C 46%, #E85513 100%);
          box-shadow: 0 8px 22px rgba(255,107,44,.32); transition: transform .16s ease, box-shadow .16s ease;
        }
        .vac-cta:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(255,107,44,.42); }
        .vac-cta:active:not(:disabled) { transform: translateY(0); }
        .vac-cta:disabled { opacity: .58; cursor: default; box-shadow: none; }
        .vac-cta::after {
          content: ''; position: absolute; top: 0; left: -60%; width: 38%; height: 100%;
          background: linear-gradient(100deg, transparent, rgba(255,255,255,.34), transparent);
          transform: skewX(-18deg); animation: vac-sheen 3.8s ease-in-out infinite;
        }
        .vac-cta:disabled::after { animation: none; opacity: 0; }

        .vac-link { background: none; border: none; padding: 0; font-family: inherit; cursor: pointer; }

        @keyframes vac-sheen { 0% { left: -60% } 58%, 100% { left: 132% } }
        @keyframes vac-rise { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }
        @keyframes vac-draw { to { stroke-dashoffset: 0 } }
        @keyframes vac-breathe { 0%,100% { opacity: .45 } 50% { opacity: 1 } }
        @keyframes vac-await { 0%,100% { border-color: ${t.borderStrong} } 50% { border-color: ${ORANGE} } }
        .vac-arm { stroke-dasharray: 120; stroke-dashoffset: 120; animation: vac-draw .75s cubic-bezier(.2,.7,.3,1) forwards; }

        /* Only appears once the stage steps aside — otherwise the mark would show twice. */
        .vac-brand-compact { display: none; align-items: center; gap: 11px; margin-bottom: 26px; }

        /* A form beats a poster on a small screen. */
        @media (max-width: 1000px) {
          .vac-stage { display: none; }
          .vac-panel { flex: 1 1 auto; padding: 30px 24px; border-left: none !important; }
          .vac-brand-compact { display: flex; }
        }
        @media (max-height: 720px) {
          .vac-stage { padding: 30px 44px; gap: 20px; }
          .vac-cards { gap: 9px; }
          .vac-card { padding: 11px 13px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .vac-cta::after { animation: none; opacity: 0 }
          .vac-arm { animation: none; stroke-dashoffset: 0 }
          *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
        }
      `}</style>

      {/* ---------- the statement ---------- */}
      {/* The stage is deep navy in BOTH themes, so the aurora always paints at its dark
          weights — driving it from the theme washed it out on the light skin. */}
      <section className="vac-stage" style={{ background: dark ? '#050C16' : '#0A1729' }}>
        <Aurora dark />

        <div style={{ display: 'flex', alignItems: 'center', gap: 13, animation: 'vac-rise .7s cubic-bezier(.2,.8,.3,1) both' }}>
          <AnimatedMark size={44} delay={200} />
          <div>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.3 }}>Vacancy</div>
            <div style={{ fontSize: 10, letterSpacing: 2.4, color: 'rgba(255,255,255,.55)', fontWeight: 700 }}>ADMIN CONSOLE</div>
          </div>
        </div>

        <div style={{ maxWidth: 620, animation: 'vac-rise .7s cubic-bezier(.2,.8,.3,1) 240ms both' }}>
          <h1 style={{
            fontSize: 'clamp(32px, 3.9vw, 54px)', lineHeight: 1.04, fontWeight: 800,
            letterSpacing: -1.5, margin: '0 0 18px',
          }}>
            The controls behind<br />
            <span style={{
              background: `linear-gradient(94deg,#FFFFFF 8%,${ORANGE} 88%)`,
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>
              everyone&rsquo;s livelihood
            </span>
          </h1>

          <p style={{ fontSize: 16, lineHeight: 1.66, color: 'rgba(255,255,255,.70)', margin: '0 0 28px', maxWidth: 490 }}>
            Accounts, services and standing on Vacancy are decided from this screen.
            Nothing here is anonymous — every action carries a name, a reason and a timestamp.
          </p>

          <div className="vac-cards">
            {PROOFS.map((item, index) => (
              <div
                key={item.title}
                className="vac-card"
                data-live={index === proof ? '1' : '0'}
                style={{ animation: `vac-rise .6s cubic-bezier(.2,.8,.3,1) ${420 + index * 90}ms both` }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                  <Icon name={item.icon} size={17} color={index === proof ? ORANGE : 'rgba(255,255,255,.72)'} />
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{item.title}</span>
                </div>
                <div style={{ fontSize: 12.6, lineHeight: 1.55, color: 'rgba(255,255,255,.62)' }}>{item.detail}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12, color: 'rgba(255,255,255,.52)',
          animation: 'vac-rise .7s cubic-bezier(.2,.8,.3,1) 820ms both',
        }}>
          {TRUST.map(item => (
            <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Icon name={item.icon} size={14} width={1.8} />{item.label}
            </span>
          ))}
        </div>
      </section>

      {/* ---------- the form ---------- */}
      <section className="vac-panel" style={{
        background: t.surface,
        borderLeft: `1px solid ${t.border}`,
      }}>
        <button
          className="vac-link"
          onClick={toggle}
          title={dark ? 'Switch to light' : 'Switch to dark'}
          style={{
            position: 'absolute', top: 22, right: 26, background: t.surfaceMuted,
            border: `1px solid ${t.border}`, color: t.textMuted, borderRadius: 9,
            padding: '7px 12px', fontSize: 12.5, fontWeight: 700,
          }}
        >
          {dark ? '☀ Light' : '☾ Dark'}
        </button>

        <div className="vac-form">
          <div className="vac-brand-compact">
            <AnimatedMark size={34} onNavy={themeName === 'dark'} delay={120} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: t.text, letterSpacing: -0.3 }}>Vacancy</div>
              <div style={{ fontSize: 9.5, letterSpacing: 2.2, color: t.textSubtle, fontWeight: 700 }}>ADMIN CONSOLE</div>
            </div>
          </div>

          {/* step rail */}
          <div style={{ display: 'flex', gap: 7, marginBottom: 26 }}>
            {['password', 'code'].map((name, index) => (
              <span key={name} style={{
                height: 3, flex: 1, borderRadius: 2,
                background: (step === 'code' || index === 0) ? ORANGE : t.border,
                transition: 'background .35s ease',
              }} />
            ))}
          </div>

          {step === 'password' ? (
            <div key="password" style={{ animation: 'vac-rise .45s cubic-bezier(.2,.8,.3,1) both' }}>
              <h2 style={{ fontSize: 27, fontWeight: 800, color: t.text, margin: '0 0 7px', letterSpacing: -0.6 }}>Sign in</h2>
              <p style={{ color: t.textMuted, fontSize: 14, margin: '0 0 26px', lineHeight: 1.6 }}>
                Administrator access only. We email a code before letting anyone in.
              </p>

              <label style={{ display: 'block', marginBottom: 14 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: t.text, display: 'block', marginBottom: 7 }}>Work email</span>
                <span style={{ position: 'relative', display: 'block' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: t.textSubtle }}>
                    <Icon name="at" size={17} />
                  </span>
                  <input
                    className="vac-field"
                    type="email"
                    value={email}
                    autoFocus
                    autoComplete="username"
                    disabled={busy}
                    onChange={event => setEmail(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') startSignIn(); }}
                    placeholder="you@x-perttech.com"
                    style={field}
                  />
                </span>
              </label>

              <label style={{ display: 'block', marginBottom: 22 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: t.text, display: 'block', marginBottom: 7 }}>Password</span>
                <span style={{ position: 'relative', display: 'block' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: t.textSubtle }}>
                    <Icon name="lock" size={17} />
                  </span>
                  <input
                    className="vac-field"
                    type={reveal ? 'text' : 'password'}
                    value={password}
                    autoComplete="current-password"
                    disabled={busy}
                    onChange={event => setPassword(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') startSignIn(); }}
                    placeholder="••••••••••••"
                    style={field}
                  />
                  <button
                    className="vac-link"
                    type="button"
                    onClick={() => setReveal(value => !value)}
                    title={reveal ? 'Hide password' : 'Show password'}
                    aria-label={reveal ? 'Hide password' : 'Show password'}
                    style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', color: t.textSubtle }}
                  >
                    <Icon name={reveal ? 'eyeOff' : 'eye'} size={18} />
                  </button>
                </span>
              </label>

              {error ? <div style={{ marginBottom: 16 }}><ErrorNote message={error} /></div> : null}

              <button className="vac-cta" onClick={startSignIn} disabled={busy}>
                {busy
                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Spinner size={15} /> Checking…</span>
                  : 'Continue →'}
              </button>

              <div data-testid="device-panel" style={{ marginTop: 22, padding: '13px 15px', background: t.surfaceMuted, borderRadius: 12, border: `1px solid ${t.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: ORANGE, animation: 'vac-breathe 2.6s ease-in-out infinite' }} />
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.9, color: t.textSubtle }}>THIS DEVICE</span>
                </div>
                <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.65 }}>
                  {device.browser} on {device.operatingSystem} · {device.screenSize}<br />
                  {device.timeZone} · {device.language}
                </div>
                <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 7, lineHeight: 1.5 }}>
                  Sent with your attempt, named in the alert email, and kept on the trail.
                </div>
              </div>
            </div>
          ) : (
            <div key="code" style={{ animation: 'vac-rise .45s cubic-bezier(.2,.8,.3,1) both' }}>
              <button
                className="vac-link"
                onClick={() => { setStep('password'); setError(null); setCode(''); setChallenge(null); }}
                style={{ color: t.textMuted, fontSize: 13, marginBottom: 16 }}
              >
                ← Use a different account
              </button>

              <div style={{
                width: 46, height: 46, borderRadius: 13, display: 'grid', placeItems: 'center',
                background: t.accentSoft, color: ORANGE, marginBottom: 15,
              }}>
                <Icon name="mail" size={22} width={1.8} />
              </div>

              <h2 style={{ fontSize: 27, fontWeight: 800, color: t.text, margin: '0 0 7px', letterSpacing: -0.6 }}>Check your email</h2>
              <p style={{ color: t.textMuted, fontSize: 14, margin: '0 0 10px', lineHeight: 1.6 }}>
                A {challenge?.codeLength}-digit code is on its way to:
              </p>
              {/* On its own line: a masked address is one long unbreakable token, and inline
                  it splits across a line break in the middle of the domain. */}
              <div style={{
                display: 'inline-block', maxWidth: '100%', boxSizing: 'border-box',
                padding: '7px 12px', marginBottom: 18, borderRadius: 9,
                background: t.surfaceMuted, border: `1px solid ${t.border}`,
                fontFamily: mono, fontSize: 13, fontWeight: 700, color: t.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {challenge?.maskedEmail}
              </div>

              {challenge && !challenge.recognisedDevice ? (
                <div style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start', margin: '0 0 18px', padding: '11px 13px',
                  background: t.warningSoft, border: `1px solid ${t.warning}`, borderRadius: 11, color: t.warning,
                }}>
                  <Icon name="warn" size={16} width={1.9} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.55 }}>
                    We have not seen this device before. If that surprises you, stop here.
                  </span>
                </div>
              ) : null}

              <CodeInput
                value={code}
                onChange={setCode}
                onComplete={verify}
                disabled={busy}
                length={challenge?.codeLength ?? 6}
              />

              {error ? <div style={{ marginTop: 16 }}><ErrorNote message={error} /></div> : null}

              <div style={{ marginTop: 18 }}>
                <button className="vac-cta" onClick={() => verify()} disabled={busy || code.length < (challenge?.codeLength ?? 6)}>
                  {busy
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Spinner size={15} /> Verifying…</span>
                    : 'Enter the console'}
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, fontSize: 12.5, color: t.textSubtle }}>
                <span>{secondsLeft > 0 ? `Expires in ${clock(secondsLeft)}` : 'This code has expired'}</span>
                <button
                  className="vac-link"
                  onClick={resend}
                  disabled={resendIn > 0 || busy}
                  style={{
                    fontSize: 12.5, fontWeight: 700,
                    color: resendIn > 0 ? t.textSubtle : ORANGE, cursor: resendIn > 0 ? 'default' : 'pointer',
                  }}
                >
                  {resendIn > 0 ? `Resend in ${resendIn}s` : 'Send another code'}
                </button>
              </div>
            </div>
          )}

          <p style={{ color: t.textSubtle, fontSize: 11, textAlign: 'center', margin: '26px 0 0', fontFamily: mono }}>
            {config.apiBaseUrl}
          </p>
        </div>
      </section>
    </div>
  );
}

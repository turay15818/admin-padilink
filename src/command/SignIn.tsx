/**
 * The front door of the command centre.
 *
 * The same two steps as the console — password, then a six-digit code from the inbox —
 * with the desk's entitlement: the account has to be on an institution's desk. A
 * dispatcher's password opens this door and no other; an administrator's opens this one
 * as a national desk.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AdminChallenge } from '../api/admin';
import { describeDevice } from '../api/secure';
import { authApi, errorWords, type Access } from './api';
import { googleIdToken, GoogleCancelled } from './google';
import { T } from './theme';
import { Btn, ErrorLine, Field, Input, LiveDot } from './ui';

function CodeBoxes({ value, onChange, onComplete, disabled, length = 6 }: { value: string; onChange: (v: string) => void; onComplete: (code: string) => void; disabled?: boolean; length?: number }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { if (!value) refs.current[0]?.focus(); }, [value]);
  const setAt = (index: number, ch: string) => {
    const padded = value.padEnd(length, ' ');
    const next = (padded.substring(0, index) + ch + padded.substring(index + 1)).replace(/\s/g, '').slice(0, length);
    onChange(next);
    if (ch && index < length - 1) refs.current[index + 1]?.focus();
    if (next.length === length) onComplete(next);
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${length}, 1fr)`, gap: 8 }}>
      {Array.from({ length }, (_, i) => (
        <input key={i} ref={el => { refs.current[i] = el; }} value={value[i] ?? ''} disabled={disabled} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={1} aria-label={`Digit ${i + 1}`}
          onChange={e => { const d = e.target.value.replace(/\D/g, ''); if (!d) return; if (d.length > 1) { const p = d.slice(0, length); onChange(p); if (p.length === length) onComplete(p); return; } setAt(i, d); }}
          onKeyDown={e => { if (e.key === 'Backspace') { e.preventDefault(); if (value[i]) setAt(i, ''); else if (i > 0) { refs.current[i - 1]?.focus(); onChange(value.slice(0, i - 1)); } } }}
          style={{ width: '100%', height: 52, textAlign: 'center', fontSize: 22, fontFamily: T.mono, fontWeight: 600, color: T.text, background: value[i] ? T.accentSoft : T.surface3, border: `1.5px solid ${value[i] ? T.accent : T.line2}`, borderRadius: 9, outline: 'none' }} />
      ))}
    </div>
  );
}

export function SignIn({ onSignedIn }: { onSignedIn: (access: Access) => void }) {
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<AdminChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [resendIn, setResendIn] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  const device = useMemo(() => describeDevice(), []);

  useEffect(() => { const h = window.setInterval(() => setClock(new Date()), 1000); return () => window.clearInterval(h); }, []);
  useEffect(() => {
    if (!challenge) return;
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.round((new Date(challenge.expiresAt).getTime() - Date.now()) / 1000)));
      setResendIn(Math.max(0, Math.round((new Date(challenge.resendAvailableAt).getTime() - Date.now()) / 1000)));
    };
    tick();
    const h = window.setInterval(tick, 1000);
    return () => window.clearInterval(h);
  }, [challenge]);

  const start = () => {
    if (busy) return;
    if (!email.trim() || !password) { setError('Enter your e-mail and password.'); return; }
    setBusy(true); setError(null);
    authApi.start(email.trim(), password, device)
      .then(c => { setChallenge(c); setStep('code'); setCode(''); setPassword(''); })
      .catch((caught: unknown) => setError(errorWords(caught, 'Sign-in failed.')))
      .finally(() => setBusy(false));
  };
  const verify = (submitted?: string) => {
    const value = submitted ?? code;
    if (busy || !challenge || value.length < challenge.codeLength) return;
    setBusy(true); setError(null);
    authApi.verify(challenge.challengeId, value, device)
      .then(onSignedIn)
      .catch((caught: unknown) => { setError(errorWords(caught, 'That did not work.')); setCode(''); })
      .finally(() => setBusy(false));
  };
  const withGoogle = () => {
    if (busy) return;
    setBusy(true); setError(null);
    googleIdToken()
      .then(token => authApi.google(token, device))
      .then(onSignedIn)
      .catch((caught: unknown) => { if (!(caught instanceof GoogleCancelled)) setError(errorWords(caught, 'Google sign-in failed.')); })
      .finally(() => setBusy(false));
  };
  const resend = () => {
    if (!challenge || resendIn > 0 || busy) return;
    setBusy(true); setError(null);
    authApi.resend(challenge.challengeId).then(c => { setChallenge(c); setCode(''); }).catch((caught: unknown) => setError(errorWords(caught, 'Could not resend.'))).finally(() => setBusy(false));
  };
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(360px, 460px)', background: T.bg }}>
      <style>{`@media (max-width: 860px) { .cc-stage { display: none !important; } .cc-signin { grid-template-columns: 1fr !important; } }`}</style>
      <div className="cc-stage" style={{ position: 'relative', overflow: 'hidden', padding: 44, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRight: `1px solid ${T.line}` }}>
        <Grid />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Mark />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: 0.2 }}>Vacancy Command</div>
            <div style={{ fontSize: 11, color: T.muted, letterSpacing: 1, textTransform: 'uppercase' }}>Institution command centre</div>
          </div>
        </div>
        <div style={{ position: 'relative', maxWidth: 520 }}>
          <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.15, textWrap: 'balance' }}>Every report, every responder, every minute — on one wall.</div>
          <div style={{ marginTop: 14, color: T.muted, fontSize: 14, lineHeight: 1.6 }}>The live queue, the map, the fleet and the roster of your institution, scoped to your desk and nobody else's. Sealed end to end; every action on the record with a name.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 24, marginTop: 28 }}>
            {[['Sealed', 'Credentials never leave your browser in clear'], ['Second factor', 'A code to your inbox, every sign-in'], ['Audited', 'Every action carries a name and a reason']].map(([h, d]) => (
              <div key={h}><div style={{ fontSize: 12, fontWeight: 600, color: T.accent, letterSpacing: 0.6, textTransform: 'uppercase' }}>{h}</div><div style={{ fontSize: 12, color: T.muted, marginTop: 3, lineHeight: 1.45 }}>{d}</div></div>
            ))}
          </div>
        </div>
        <div style={{ position: 'relative', display: 'flex', gap: 16, alignItems: 'center', fontSize: 11.5, color: T.subtle }}>
          <span className="cc-num">{clock.toISOString().slice(11, 19)} UTC</span>
          <span>·</span>
          <span>Sierra Leone keeps UTC all year</span>
          <span style={{ flex: 1 }} />
          <LiveDot up={false} label="NOT SIGNED IN" />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 36px' }}>
        <div style={{ width: '100%', maxWidth: 380, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
            <Mark size={28} />
            <div style={{ fontSize: 12, color: T.muted, letterSpacing: 1, textTransform: 'uppercase' }}>Sign in to your desk</div>
          </div>
          {step === 'password' ? (
            <form onSubmit={e => { e.preventDefault(); start(); }}>
              <Field label="E-mail"><Input value={email} onChange={setEmail} type="email" autoFocus placeholder="you@institution.gov.sl" /></Field>
              <Field label="Password"><Input value={password} onChange={setPassword} type="password" /></Field>
              {error ? <div style={{ marginBottom: 12 }}><ErrorLine>{error}</ErrorLine></div> : null}
              <Btn type="submit" tone="primary" disabled={busy} style={{ width: '100%', padding: '11px 14px', fontSize: 14 }}>{busy ? 'Checking…' : 'Continue'}</Btn>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0', color: T.subtle, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>
                <span style={{ flex: 1, height: 1, background: T.line }} />or<span style={{ flex: 1, height: 1, background: T.line }} />
              </div>
              <Btn type="button" tone="subtle" disabled={busy} onClick={withGoogle} style={{ width: '100%', padding: '10px 14px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <GoogleMark />Continue with Google
              </Btn>
              <div style={{ fontSize: 11.5, color: T.subtle, marginTop: 14, lineHeight: 1.5 }}>Your desk's supervisor puts you on the desk; Vacancy does not. Signing in with Google works for the address they added — no password, no code. If you have been added and cannot get in, ask them.</div>
            </form>
          ) : (
            <form onSubmit={e => { e.preventDefault(); verify(); }}>
              <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, marginBottom: 14 }}>A {challenge?.codeLength ?? 6}-digit code went to <b style={{ color: T.text }}>{challenge?.maskedEmail}</b>.{challenge && !challenge.recognisedDevice ? <span style={{ color: T.warn }}> This browser is new to us.</span> : null}</div>
              <CodeBoxes value={code} onChange={setCode} onComplete={verify} disabled={busy} length={challenge?.codeLength ?? 6} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 11.5, color: T.subtle }}>
                <span className="cc-num">{secondsLeft > 0 ? `expires in ${mmss(secondsLeft)}` : 'expired'}</span>
                <span style={{ flex: 1 }} />
                <Btn size="xs" tone="ghost" disabled={resendIn > 0 || busy} onClick={resend}>{resendIn > 0 ? `resend in ${resendIn}s` : 'Send again'}</Btn>
                <Btn size="xs" tone="ghost" onClick={() => { setStep('password'); setChallenge(null); setError(null); }}>Start over</Btn>
              </div>
              {error ? <div style={{ marginTop: 12 }}><ErrorLine>{error}</ErrorLine></div> : null}
              <div style={{ marginTop: 14 }}><Btn type="submit" tone="primary" disabled={busy || code.length < (challenge?.codeLength ?? 6)} style={{ width: '100%', padding: '11px 14px', fontSize: 14 }}>{busy ? 'Opening…' : 'Open the desk'}</Btn></div>
            </form>
          )}
          <div style={{ marginTop: 26, fontSize: 11, color: T.subtle, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>{device.browser} on {device.operatingSystem}</span><span>·</span><span>{authApi.apiHost().replace(/^https?:\/\//, '')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" style={{ display: 'block' }}>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function Mark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="Vacancy" style={{ display: 'block' }}>
      <path d="M17 47 L39 71" stroke="#FFFFFF" strokeWidth="15" strokeLinecap="round" fill="none" />
      <path d="M39 71 L85 17" stroke={T.brand} strokeWidth="15" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** A faint grid with a slow sweep — the wall before it is switched on. */
function Grid() {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${T.line} 1px, transparent 1px), linear-gradient(90deg, ${T.line} 1px, transparent 1px)`, backgroundSize: '44px 44px', opacity: 0.55, maskImage: 'radial-gradient(ellipse at 30% 50%, black 20%, transparent 75%)', WebkitMaskImage: 'radial-gradient(ellipse at 30% 50%, black 20%, transparent 75%)' }} />
  );
}

/**
 * The console's parts. Everything reads its colours from the active theme at render time,
 * so light and dark are one component tree rather than two.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { mono } from '../theme/theme';

export function Card({ children, style, pad = 18 }: { children: ReactNode; style?: CSSProperties; pad?: number }) {
  const { t } = useTheme();
  return (
    <div style={{
      background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14,
      padding: pad, boxShadow: t.shadow, ...style,
    }}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const { t } = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: t.text, letterSpacing: -0.2 }}>{title}</h1>
        {subtitle ? <p style={{ margin: '5px 0 0', color: t.textMuted, fontSize: 13.5, lineHeight: 1.55 }}>{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

type ButtonTone = 'primary' | 'ghost' | 'danger' | 'subtle';

export function Button({
  children, onClick, tone = 'ghost', disabled, type = 'button', size = 'md', style, title,
}: {
  children: ReactNode; onClick?: () => void; tone?: ButtonTone; disabled?: boolean;
  type?: 'button' | 'submit'; size?: 'sm' | 'md'; style?: CSSProperties; title?: string;
}) {
  const { t } = useTheme();
  const palette: Record<ButtonTone, CSSProperties> = {
    primary: { background: t.brand, color: t.brandText, border: `1px solid ${t.brand}` },
    ghost: { background: t.surface, color: t.text, border: `1px solid ${t.borderStrong}` },
    subtle: { background: t.surfaceMuted, color: t.textMuted, border: `1px solid ${t.border}` },
    danger: { background: t.dangerSoft, color: t.danger, border: `1px solid ${t.danger}` },
  };
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...palette[tone],
        padding: size === 'sm' ? '6px 12px' : '9px 16px',
        borderRadius: 10,
        fontSize: size === 'sm' ? 12.5 : 13.5,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        transition: 'filter .15s ease',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Input({
  value, onChange, placeholder, type = 'text', onEnter, autoFocus, style, disabled,
}: {
  value: string; onChange: (value: string) => void; placeholder?: string; type?: string;
  onEnter?: () => void; autoFocus?: boolean; style?: CSSProperties; disabled?: boolean;
}) {
  const { t } = useTheme();
  return (
    <input
      type={type}
      value={value}
      autoFocus={autoFocus}
      disabled={disabled}
      placeholder={placeholder}
      onChange={event => onChange(event.target.value)}
      onKeyDown={event => { if (event.key === 'Enter' && onEnter) onEnter(); }}
      style={{
        width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
        border: `1px solid ${t.borderStrong}`, background: t.surfaceMuted, color: t.text,
        fontSize: 13.5, fontFamily: 'inherit', outline: 'none', ...style,
      }}
    />
  );
}

export function Textarea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (value: string) => void; placeholder?: string; rows?: number;
}) {
  const { t } = useTheme();
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={event => onChange(event.target.value)}
      style={{
        width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
        border: `1px solid ${t.borderStrong}`, background: t.surfaceMuted, color: t.text,
        fontSize: 13.5, fontFamily: 'inherit', outline: 'none', resize: 'vertical',
      }}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const { t } = useTheme();
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: t.text, marginBottom: 5 }}>{label}</div>
      {hint ? <div style={{ fontSize: 11.5, color: t.textSubtle, marginBottom: 6, lineHeight: 1.5 }}>{hint}</div> : null}
      {children}
    </label>
  );
}

type PillTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: PillTone }) {
  const { t } = useTheme();
  const map: Record<PillTone, [string, string]> = {
    success: [t.success, t.successSoft],
    warning: [t.warning, t.warningSoft],
    danger: [t.danger, t.dangerSoft],
    info: [t.info, t.infoSoft],
    accent: [t.accent, t.accentSoft],
    neutral: [t.textMuted, t.surfaceMuted],
  };
  const [color, background] = map[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999,
      background, color, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

/** Account status → colour, in one place so every screen agrees. */
export function statusTone(status: number): PillTone {
  return status === 2 ? 'success' : status === 3 ? 'warning' : status === 4 ? 'danger' : 'neutral';
}

export function Spinner({ size = 22 }: { size?: number }) {
  const { t } = useTheme();
  return (
    <>
      <style>{'@keyframes vac-spin{to{transform:rotate(360deg)}}'}</style>
      <span style={{
        display: 'inline-block', width: size, height: size, borderRadius: '50%',
        border: `2px solid ${t.border}`, borderTopColor: t.brand, animation: 'vac-spin .7s linear infinite',
      }} />
    </>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  const { t } = useTheme();
  return (
    <div style={{ display: 'grid', placeItems: 'center', gap: 10, padding: 50, color: t.textMuted, fontSize: 13.5 }}>
      <Spinner />
      {label}
    </div>
  );
}

export function EmptyState({ icon, title, message }: { icon: string; title: string; message?: string }) {
  const { t } = useTheme();
  return (
    <div style={{ textAlign: 'center', padding: '46px 24px' }}>
      <div style={{ fontSize: 34, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 15.5, fontWeight: 800, color: t.text }}>{title}</div>
      {message ? <p style={{ color: t.textMuted, fontSize: 13.5, margin: '7px auto 0', maxWidth: 420, lineHeight: 1.6 }}>{message}</p> : null}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  const { t } = useTheme();
  return (
    <div style={{
      background: t.dangerSoft, border: `1px solid ${t.danger}`, color: t.danger,
      borderRadius: 10, padding: '11px 14px', fontSize: 13, fontWeight: 600, lineHeight: 1.5,
    }}>
      {message}
    </div>
  );
}

/* ---------- table ---------- */

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  const { t } = useTheme();
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead>
          <tr>
            {head.map((cell, index) => (
              <th key={index} style={{
                textAlign: 'left', padding: '10px 12px', color: t.textSubtle, fontSize: 11.5,
                fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase',
                borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap',
              }}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  const { t } = useTheme();
  const [hover, setHover] = useState(false);
  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        background: hover && onClick ? t.surfaceHover : 'transparent',
        transition: 'background .12s ease',
      }}
    >
      {children}
    </tr>
  );
}

export function Cell({ children, mono: isMono, style }: { children: ReactNode; mono?: boolean; style?: CSSProperties }) {
  const { t } = useTheme();
  return (
    <td style={{
      padding: '11px 12px', borderBottom: `1px solid ${t.border}`, color: t.text,
      fontFamily: isMono ? mono : 'inherit', verticalAlign: 'middle', ...style,
    }}>
      {children}
    </td>
  );
}

/* ---------- modal ---------- */

export function Modal({ title, children, onClose, width = 460 }: {
  title: string; children: ReactNode; onClose: () => void; width?: number;
}) {
  const { t } = useTheme();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(2,6,23,.55)', backdropFilter: 'blur(2px)',
        display: 'grid', placeItems: 'center', padding: 20, zIndex: 60,
      }}
    >
      {/* role=dialog so a check can scope to what is inside it. Without this, "the first
          input on the page" is the screen's own search box sitting behind the overlay, which
          is exactly the mistake a test makes once and then reports as a passing check. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={event => event.stopPropagation()}
        style={{
          background: t.surface, border: `1px solid ${t.border}`, borderRadius: 16,
          width: '100%', maxWidth: width, boxShadow: t.shadow, maxHeight: '86vh', overflowY: 'auto',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 800, color: t.text }}>{title}</div>
          <Button size="sm" tone="subtle" onClick={onClose}>Close</Button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

/* ---------- toast ---------- */

export type Toast = { id: number; message: string; tone: 'ok' | 'error' };

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useMemo(() => (message: string, tone: 'ok' | 'error' = 'ok') => {
    const id = ++seq.current;
    setToasts(list => [...list, { id, message, tone }]);
    window.setTimeout(() => setToasts(list => list.filter(item => item.id !== id)), 5200);
  }, []);
  return { toasts, push };
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  const { t } = useTheme();
  return (
    <div style={{ position: 'fixed', right: 18, bottom: 18, display: 'flex', flexDirection: 'column', gap: 9, zIndex: 80 }}>
      {toasts.map(toast => (
        <div key={toast.id} style={{
          background: toast.tone === 'ok' ? t.surface : t.dangerSoft,
          border: `1px solid ${toast.tone === 'ok' ? t.borderStrong : t.danger}`,
          color: toast.tone === 'ok' ? t.text : t.danger,
          padding: '11px 15px', borderRadius: 11, fontSize: 13, fontWeight: 600,
          boxShadow: t.shadow, maxWidth: 380, lineHeight: 1.5,
        }}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

/* ---------- misc ---------- */

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** "3 minutes ago" — the audit log is read by time, not by date. */
export function timeAgo(iso: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(iso);
}

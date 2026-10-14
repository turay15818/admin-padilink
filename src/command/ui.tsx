/**
 * The command centre's furniture.
 *
 * Dense, flat, operated rather than read. A panel is a line, not a shadow; a tile is a
 * number you can read from across the room; a pill encodes state in form as well as
 * colour. Everything paints from the one skin in theme.ts.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { T } from './theme';

/* ---------- text ---------- */

export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 1.1, textTransform: 'uppercase', color: T.subtle, ...style }}>{children}</div>;
}

export function Num({ children, size = 13, color, weight = 500 }: { children: ReactNode; size?: number; color?: string; weight?: number }) {
  return <span className="cc-num" style={{ fontSize: size, color, fontWeight: weight }}>{children}</span>;
}

/* ---------- buttons ---------- */

export type Tone = 'primary' | 'subtle' | 'danger' | 'ghost' | 'accent';

export function Btn({ tone = 'subtle', size = 'md', disabled, onClick, children, title, type = 'button', style }: {
  tone?: Tone; size?: 'xs' | 'sm' | 'md'; disabled?: boolean; onClick?: () => void; children: ReactNode; title?: string; type?: 'button' | 'submit'; style?: CSSProperties;
}) {
  const pad = size === 'xs' ? '3px 8px' : size === 'sm' ? '5px 10px' : '8px 14px';
  const fontSize = size === 'xs' ? 11 : size === 'sm' ? 12 : 13;
  const background = tone === 'primary' ? T.brand : tone === 'accent' ? T.accent : tone === 'danger' ? T.badSoft : tone === 'ghost' ? 'transparent' : T.surface2;
  const color = tone === 'primary' ? '#1A0C05' : tone === 'accent' ? '#04151A' : tone === 'danger' ? T.bad : tone === 'ghost' ? T.muted : T.text;
  const border = tone === 'primary' || tone === 'accent' || tone === 'ghost' ? 'transparent' : tone === 'danger' ? 'rgba(255,77,94,.35)' : T.line2;
  return (
    <button type={type} className="cc-btn" disabled={disabled} onClick={onClick} title={title}
      style={{ fontWeight: 600, fontSize, padding: pad, borderRadius: 7, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, border: `1px solid ${border}`, background, color, whiteSpace: 'nowrap', lineHeight: 1.3, transition: 'filter .12s', ...style }}>
      {children}
    </button>
  );
}

/** A crest: the institution's letters in its sector's tone, where a logo would go. */
export function Crest({ text, tone, size, logo }: { text: string; tone: string; size: number; logo?: string | null }) {
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size / 3.6), background: `linear-gradient(135deg, ${tone}38, ${tone}10)`, border: `1px solid ${tone}66`, display: 'grid', placeItems: 'center', color: tone, fontWeight: 700, fontSize: Math.max(10, size / 3.3), letterSpacing: 0.4, flexShrink: 0, fontFamily: T.mono, overflow: 'hidden' }}>
      {logo ? <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 5 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : text}
    </div>
  );
}

export function crestText(name: string) {
  const clean = name.replace(/[^A-Za-z0-9 ]/g, '').trim();
  if (clean.length <= 4) return clean.toUpperCase();
  const words = clean.split(/\s+/).filter(w => !/^(of|the|and|for|de)$/i.test(w));
  return words.length === 1 ? words[0].slice(0, 3).toUpperCase() : words.map(w => w[0]).join('').slice(0, 3).toUpperCase();
}

export const SECTOR_TONES: Record<string, string> = { navy: '#3B82F6', red: '#FF4D5E', orange: '#FF6B2C', teal: '#2DD4A0', blue: '#38BDF8', amber: '#FFB020', green: '#22C55E', purple: '#A78BFA', grey: '#8A9BB3' };

/* ---------- state ---------- */

export type PillTone = 'neutral' | 'warn' | 'bad' | 'good' | 'info' | 'accent';

export function Pill({ tone = 'neutral', children, dot, mono }: { tone?: PillTone; children: ReactNode; dot?: boolean; mono?: boolean }) {
  const colour = tone === 'warn' ? T.warn : tone === 'bad' ? T.bad : tone === 'good' ? T.good : tone === 'info' ? T.info : tone === 'accent' ? T.accent : T.muted;
  const wash = tone === 'warn' ? T.warnSoft : tone === 'bad' ? T.badSoft : tone === 'good' ? T.goodSoft : tone === 'info' ? T.infoSoft : tone === 'accent' ? T.accentSoft : T.surface2;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3, padding: '2px 7px', borderRadius: 5, color: colour, background: wash, whiteSpace: 'nowrap', fontFamily: mono ? T.mono : undefined, lineHeight: 1.5 }}>
      {dot ? <span style={{ width: 6, height: 6, borderRadius: 3, background: colour }} /> : null}{children}
    </span>
  );
}

export function SeverityMark({ severity, size = 10 }: { severity: number; size?: number }) {
  const colour = T.severity[Math.min(Math.max(severity, 1), 5) - 1];
  return <span aria-label={`P${severity}`} style={{ display: 'inline-block', width: size, height: size, borderRadius: severity === 1 ? 2 : size, background: colour, boxShadow: severity === 1 ? `0 0 0 3px ${T.badSoft}` : undefined, flexShrink: 0 }} />;
}

export function LiveDot({ up, label }: { up: boolean; label?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: up ? T.accent : T.subtle, letterSpacing: 0.4 }}>
      <span className={up ? 'cc-pulse' : undefined} style={{ width: 7, height: 7, borderRadius: 4, background: up ? T.accent : T.subtle }} />
      {label ?? (up ? 'LIVE' : 'POLLING')}
    </span>
  );
}

/* ---------- containers ---------- */

export function Panel({ title, note, action, children, pad = 12, style, flush }: { title?: ReactNode; note?: string; action?: ReactNode; children: ReactNode; pad?: number; style?: CSSProperties; flush?: boolean }) {
  return (
    <section style={{ border: `1px solid ${T.line}`, borderRadius: T.radius, background: T.surface, minWidth: 0, display: 'flex', flexDirection: 'column', ...style }}>
      {title !== undefined ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: `${pad - 2}px ${pad}px`, borderBottom: `1px solid ${T.line}` }}>
          <Eyebrow style={{ flexShrink: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{title}</Eyebrow>
          <span title={note} style={{ fontSize: 11, color: T.subtle, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note}</span>
          {action}
        </div>
      ) : null}
      <div style={{ padding: flush ? 0 : pad, minHeight: 0, flex: 1 }}>{children}</div>
    </section>
  );
}

export function Tile({ label, value, note, tone, spark, onClick, active }: { label: string; value: ReactNode; note?: ReactNode; tone?: string; spark?: ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <div onClick={onClick} role={onClick ? 'button' : undefined} style={{ border: `1px solid ${active ? T.accent : T.line}`, borderRadius: T.radius, padding: '10px 12px', background: active ? T.accentSoft : T.surface, minWidth: 0, cursor: onClick ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="cc-num" style={{ fontSize: 26, fontWeight: 600, color: tone ?? T.text, lineHeight: 1.1 }}>{value}</span>
        {spark}
      </div>
      {note ? <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.35 }}>{note}</div> : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ padding: '18px 12px', fontSize: 12.5, color: T.subtle, textAlign: 'center' }}>{children}</div>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div style={{ padding: 20, fontSize: 12.5, color: T.subtle, display: 'flex', alignItems: 'center', gap: 8 }}><span className="cc-pulse" style={{ width: 8, height: 8, borderRadius: 4, background: T.accent }} />{label}</div>;
}

export function ErrorLine({ children }: { children: ReactNode }) {
  return <div role="alert" style={{ fontSize: 12.5, color: T.bad, padding: '8px 10px', borderRadius: 7, background: T.badSoft, border: '1px solid rgba(255,77,94,.3)' }}>{children}</div>;
}

/* ---------- forms ---------- */

export const inputStyle: CSSProperties = { width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 7, border: `1px solid ${T.line2}`, background: T.surface3, color: T.text, outline: 'none' };

export function Field({ label, hint, children, span }: { label: string; hint?: string; children: ReactNode; span?: number }) {
  return (
    <label style={{ display: 'block', marginBottom: 10, gridColumn: span ? `span ${span}` : undefined, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: T.muted, marginBottom: 4, letterSpacing: 0.3 }}>{label}</div>
      {children}
      {hint ? <div style={{ fontSize: 11, color: T.subtle, marginTop: 4, lineHeight: 1.45 }}>{hint}</div> : null}
    </label>
  );
}

export function Input({ value, onChange, placeholder, type = 'text', disabled, autoFocus, mono }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; disabled?: boolean; autoFocus?: boolean; mono?: boolean }) {
  return <input type={type} value={value} disabled={disabled} autoFocus={autoFocus} placeholder={placeholder} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, fontFamily: mono ? T.mono : undefined, opacity: disabled ? 0.6 : 1 }} />;
}

export function Textarea({ value, onChange, rows = 3, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.45 }} />;
}

export function Select({ value, onChange, children, disabled }: { value: string; onChange: (v: string) => void; children: ReactNode; disabled?: boolean }) {
  return <select value={value} disabled={disabled} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, appearance: 'auto' }}>{children}</select>;
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, cursor: 'pointer', marginBottom: 8 }}><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ accentColor: T.accent }} /> {children}</label>;
}

/** A row of choices that reads like a switch. */
export function Segmented<V extends string | number>({ value, options, onChange, size = 'sm' }: { value: V; options: [V, ReactNode][]; onChange: (v: V) => void; size?: 'xs' | 'sm' }) {
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${T.line2}`, borderRadius: 7, overflow: 'hidden', background: T.surface2 }}>
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" onClick={() => onChange(v)} style={{ border: 'none', borderRight: `1px solid ${T.line}`, padding: size === 'xs' ? '3px 8px' : '5px 10px', fontSize: size === 'xs' ? 11 : 12, fontWeight: 600, cursor: 'pointer', background: value === v ? T.accentSoft : 'transparent', color: value === v ? T.accent : T.muted }}>{label}</button>
      ))}
    </div>
  );
}

export function Actions({ children, left }: { children: ReactNode; left?: ReactNode }) {
  return <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>{left}<span style={{ flex: 1 }} />{children}</div>;
}

/* ---------- overlays ---------- */

export function Modal({ title, onClose, width = 520, children }: { title: string; onClose: () => void; width?: number; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal aria-label={title} onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(3,6,12,.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 12px', overflowY: 'auto', backdropFilter: 'blur(2px)' }}>
      <div className="cc-in" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: width, background: T.surface, borderRadius: 12, border: `1px solid ${T.line2}`, boxShadow: '0 30px 80px rgba(0,0,0,.6)', padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, flex: 1, minWidth: 0 }}>{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} style={{ border: 'none', background: 'transparent', color: T.muted, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A side drawer, for the incident that stays beside the queue. */
export function Drawer({ title, onClose, width = 640, children, header }: { title: ReactNode; onClose: () => void; width?: number; children: ReactNode; header?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(3,6,12,.45)' }} />
      <aside className="cc-drawer" style={{ width, maxWidth: '100vw', background: T.surface, borderLeft: `1px solid ${T.line2}`, display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 60px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${T.line}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>{title}</div>
          {header}
          <button type="button" aria-label="Close" onClick={onClose} style={{ border: 'none', background: 'transparent', color: T.muted, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>{children}</div>
      </aside>
    </div>
  );
}

/* ---------- tables ---------- */

export function Table({ children, minWidth }: { children: ReactNode; minWidth?: number }) {
  return <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth, borderCollapse: 'collapse', fontSize: 12.5 }}>{children}</table></div>;
}
export function Th({ children, right, width }: { children?: ReactNode; right?: boolean; width?: number | string }) {
  return <th style={{ textAlign: right ? 'right' : 'left', fontSize: 10.5, fontWeight: 600, letterSpacing: 0.9, textTransform: 'uppercase', color: T.subtle, padding: '6px 10px', borderBottom: `1px solid ${T.line}`, whiteSpace: 'nowrap', width }}>{children}</th>;
}
export function Td({ children, right, mono, muted, colSpan, style }: { children?: ReactNode; right?: boolean; mono?: boolean; muted?: boolean; colSpan?: number; style?: CSSProperties }) {
  return <td colSpan={colSpan} className={mono ? 'cc-num' : undefined} style={{ textAlign: right ? 'right' : 'left', padding: '7px 10px', borderBottom: `1px solid ${T.line}`, color: muted ? T.muted : undefined, verticalAlign: 'top', ...style }}>{children}</td>;
}

/* ---------- toasts ---------- */

export function useToasts() {
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: 'ok' | 'error' }[]>([]);
  const push = (message: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts(list => [...list, { id, message, tone }]);
    window.setTimeout(() => setToasts(list => list.filter(x => x.id !== id)), tone === 'error' ? 7000 : 3200);
  };
  return { toasts, push };
}
export function Toasts({ toasts }: { toasts: { id: number; message: string; tone: 'ok' | 'error' }[] }) {
  if (toasts.length === 0) return null;
  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 90, display: 'grid', gap: 6 }}>
      {toasts.map(x => (
        <div key={x.id} className="cc-in" style={{ padding: '9px 13px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, background: x.tone === 'error' ? T.bad : T.surface3, color: x.tone === 'error' ? '#2A0509' : T.text, border: `1px solid ${x.tone === 'error' ? T.bad : T.line2}`, boxShadow: '0 10px 30px rgba(0,0,0,.5)', maxWidth: 420 }}>{x.message}</div>
      ))}
    </div>
  );
}

/* ---------- words ---------- */

export const fmtTime = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(11, 16) : '—');
export const fmtDateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '—');
export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
export const age = (minutes: number) => (minutes < 1 ? 'now' : minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${Math.floor(minutes / 1440)}d`);
export const minutesWord = (m: number | null | undefined) => (m === null || m === undefined ? '—' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);
export const titleCase = (slug: string | null | undefined) => (slug ? slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '—');
export const pct = (part: number, whole: number) => (whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`);
export const delta = (now: number | null, before: number | null) => (now === null || before === null || before === 0 ? null : Math.round(((now - before) / before) * 100));

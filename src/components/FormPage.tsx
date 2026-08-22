/**
 * A form that is a page, not a box.
 *
 * The console's long forms — writing an announcement, defining an audience — were modals.
 * A modal is right for a question with one answer; it is wrong for work. At 560px wide with
 * an 86vh cap, the announcement composer put eleven fields, a reach counter, two channel
 * toggles, a date picker and two phone previews into a scrolling column, and the previews
 * were below the fold of the box that contained them — so the thing that shows you what you
 * are about to send to thousands of people was the part you had to hunt for.
 *
 * A page gives the same content the width it needs and a second column to put the reference
 * material in, where it can sit still and be looked at while the form is filled in.
 *
 * The layout collapses to one column under 980px, which is where a two-column form stops
 * being two columns and starts being two narrow ones.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import { useIsNarrow } from '../lib/useViewport';

export function FormPage({ backTo, backLabel, title, subtitle, aside, footer, children }: {
  backTo: string;
  backLabel: string;
  title: string;
  subtitle?: string;
  /**
   * The right-hand column: a preview, a count, whatever the form is about to produce.
   * Sticky on a wide screen so it stays in view while the fields below scroll past it.
   */
  aside?: ReactNode;
  /** The action bar. Pinned to the bottom of the viewport so Send is never scrolled away. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTheme();
  const narrow = useIsNarrow(980);

  return (
    <div style={{ paddingBottom: footer ? 84 : 0 }}>
      <Link
        to={backTo}
        style={{ fontSize: 12.5, color: t.textMuted, textDecoration: 'none', fontWeight: 700 }}
      >
        ‹ {backLabel}
      </Link>

      <h1 style={{ fontSize: 25, fontWeight: 800, color: t.text, margin: '10px 0 4px', letterSpacing: -0.3 }}>
        {title}
      </h1>
      {subtitle ? (
        <p style={{ fontSize: 13, color: t.textMuted, margin: '0 0 22px', lineHeight: 1.6, maxWidth: 620 }}>
          {subtitle}
        </p>
      ) : <div style={{ height: 18 }} />}

      <div style={{
        display: 'grid',
        gridTemplateColumns: narrow || !aside ? '1fr' : 'minmax(0, 1fr) 340px',
        gap: 26,
        alignItems: 'start',
      }}>
        <div style={{ minWidth: 0 }}>{children}</div>
        {aside ? (
          <aside style={{
            minWidth: 0,
            // Sticky only when it has a column of its own. Stuck to the top of a single
            // column, it would cover the fields it is supposed to be explaining.
            position: narrow ? 'static' : 'sticky',
            top: 18,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            {aside}
          </aside>
        ) : null}
      </div>

      {footer ? (
        <div style={{
          position: 'fixed', left: 232, right: 0, bottom: 0, zIndex: 20,
          background: t.surface, borderTop: `1px solid ${t.border}`,
          padding: '13px 26px',
          display: 'flex', gap: 9, alignItems: 'center', justifyContent: 'flex-end',
          boxShadow: t.shadow,
        }}>
          {footer}
        </div>
      ) : null}
    </div>
  );
}

/** A titled block for the aside, so the right-hand column reads as sections rather than a pile. */
export function AsidePanel({ label, children, style }: {
  label: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const { t } = useTheme();
  return (
    <div style={{
      border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface,
      padding: 15, ...style,
    }}>
      <div style={{
        fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, color: t.textSubtle,
        textTransform: 'uppercase', marginBottom: 11,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

/** One group of fields, with a heading that says what the group is for. */
export function FormSection({ title, hint, children }: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  const { t } = useTheme();
  return (
    <section style={{
      border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface,
      padding: '16px 18px', marginBottom: 14,
    }}>
      <h2 style={{ fontSize: 14, fontWeight: 800, color: t.text, margin: '0 0 2px' }}>{title}</h2>
      {hint ? (
        <p style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.55, margin: '0 0 13px' }}>{hint}</p>
      ) : <div style={{ height: 11 }} />}
      {children}
    </section>
  );
}

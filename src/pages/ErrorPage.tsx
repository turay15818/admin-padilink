/**
 * The two pages every console needs and this one did not have.
 *
 * Both say the same three things in the same order, because that is what somebody who has hit
 * one actually needs: what happened, what it means for them, and the way out. What neither of
 * them does is apologise or make a joke - somebody reading this is already mildly annoyed and
 * a cartoon does not help.
 *
 * The URL is printed on the 404 on purpose. Half of these are a typo or a truncated link in an
 * e-mail, and seeing the address is what makes that obvious.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from '../components/Icon';

function ErrorPage({ code, icon, title, children, tone }: {
  code: string;
  icon: IconName;
  title: string;
  children: ReactNode;
  tone: 'muted' | 'warning';
}) {
  const { t } = useTheme();
  const accent = tone === 'warning' ? t.warning : t.textSubtle;

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '62vh', padding: 24 }}>
      <div style={{ maxWidth: 520, textAlign: 'center' }}>
        <div style={{
          width: 62, height: 62, borderRadius: 18, margin: '0 auto 18px',
          display: 'grid', placeItems: 'center',
          // surfaceMuted is four points of lightness away from the page behind it, so a tile
          // drawn in it disappears in the light theme. The quiet tone gets the surface colour
          // and a border instead - the same way every other raised chip here is drawn.
          background: tone === 'warning' ? t.warningSoft : t.surface,
          border: tone === 'warning' ? 'none' : `1px solid ${t.border}`,
        }}>
          <Icon name={icon} size={28} color={accent} />
        </div>

        <div style={{
          fontSize: 13, fontWeight: 800, letterSpacing: 1.4, color: accent, marginBottom: 8,
        }}>
          {code}
        </div>

        <h1 style={{ margin: '0 0 10px', fontSize: 23, fontWeight: 800, color: t.text }}>{title}</h1>

        <div style={{ fontSize: 14, lineHeight: 1.65, color: t.textMuted }}>{children}</div>

        <div style={{ marginTop: 22, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            to="/"
            style={{
              textDecoration: 'none', background: t.brand, color: t.brandText,
              borderRadius: 10, padding: '9px 18px', fontSize: 13.5, fontWeight: 700,
            }}>
            Back to overview
          </Link>
          <button
            onClick={() => window.history.back()}
            style={{
              border: `1px solid ${t.borderStrong}`, background: t.surface, color: t.text,
              borderRadius: 10, padding: '9px 18px', fontSize: 13.5, fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer',
            }}>
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}

export function NotFound() {
  const { t } = useTheme();
  return (
    <ErrorPage code="404 — NOT FOUND" icon="search" title="There is no screen at this address" tone="muted">
      <p style={{ margin: 0 }}>
        Nothing in the console lives here. If you followed a link from an e-mail or a message, it may
        have been cut short — those two things account for most of these.
      </p>
      <p style={{ margin: '10px 0 0', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, color: t.textSubtle, wordBreak: 'break-all' }}>
        {window.location.pathname}
      </p>
    </ErrorPage>
  );
}

export function Forbidden({ path }: { path?: string }) {
  const { t } = useTheme();
  return (
    <ErrorPage code="403 — NOT ALLOWED" icon="lock" title="Your account cannot open this" tone="warning">
      <p style={{ margin: 0 }}>
        You are signed in, and the platform is working — this screen just needs a permission your
        role does not have. Nothing has gone wrong and nothing was changed.
      </p>
      <p style={{ margin: '10px 0 0' }}>
        If you need it, ask a super administrator to add the permission to your role under
        <strong style={{ color: t.text }}> Settings → Roles and permissions</strong>.
      </p>
      {path ? (
        <p style={{ margin: '10px 0 0', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, color: t.textSubtle, wordBreak: 'break-all' }}>
          {path}
        </p>
      ) : null}
    </ErrorPage>
  );
}

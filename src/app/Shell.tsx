/**
 * The console frame: navy rail on the left in both themes, content on the right.
 * The rail carries the brand mark drawn as SVG so it needs no asset pipeline and stays
 * crisp at any zoom.
 */
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { setSession } from '../api/client';
import { adminApi, SETTINGS_CHANGED, type AdminIdentity, type PlatformStatus } from '../api/admin';

export function VacancyMark({ size = 30, onNavy = true }: { size?: number; onNavy?: boolean }) {
  const short = onNavy ? '#FFFFFF' : '#2A4E82';
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="Vacancy">
      <path d="M17.00 47.00 L39.00 71.00" stroke={short} strokeWidth="15" strokeLinecap="round" fill="none" />
      <path d="M39.00 71.00 L85.00 17.00" stroke="#FF6B2C" strokeWidth="15" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// Drawn icons, not emoji: the rail has to match the front door, and an emoji font
// renders differently on every operating system the console is opened from.
const NAV: { to: string; label: string; icon: IconName; superOnly?: boolean }[] = [
  { to: '/', label: 'Overview', icon: 'overview' },
  // Second, under Overview. Overview says what is waiting; this says what somebody who read
  // everything would tell you about it — which is the first thing to look at, not the last.
  { to: '/assistant', label: 'This morning', icon: 'spark' },
  // Directly under Overview, and deliberately: Overview says what needs doing today, these
  // two say whether today is going anywhere. Buried at the bottom they would be opened once.
  { to: '/growth', label: 'Growth', icon: 'insights' },
  { to: '/demand', label: 'What people wanted', icon: 'search' },
  { to: '/ambassadors', label: 'Ambassadors', icon: 'people' },
  { to: '/users', label: 'People', icon: 'people' },
  { to: '/catalog', label: 'Services', icon: 'services' },
  { to: '/bookings', label: 'Bookings', icon: 'booking' },
  { to: '/complaints', label: 'Complaints', icon: 'flag' },
  { to: '/support', label: 'Support chat', icon: 'people' },
  { to: '/messages', label: 'Messages', icon: 'mail' },
  { to: '/content', label: 'Posted content', icon: 'content' },
  { to: '/learn', label: 'Learn', icon: 'training' },
  { to: '/broadcasts', label: 'Announcements', icon: 'advert' },
  { to: '/documents', label: 'Documents', icon: 'certificate' },
  { to: '/adverts', label: 'Adverts', icon: 'advert' },
  { to: '/spotlight', label: 'Spotlight', icon: 'spark' },
  { to: '/team', label: 'Admin team', icon: 'shield' },
  // Under Bookings rather than beside Reports: it is a working screen an operator uses to
  // decide who to ring, not a thing you export once a quarter.
  { to: '/payments', label: 'Payments', icon: 'agreement' },
  { to: '/ledger', label: 'Money owed', icon: 'agreement' },
  { to: '/reports', label: 'Reports', icon: 'agreement' },
  { to: '/audit', label: 'Audit trail', icon: 'audit' },
  { to: '/settings', label: 'Settings', icon: 'lock' },
  // Also reachable by clicking your own name below — but passwords live here, and people
  // look for them in the nav before they look in a footer.
  { to: '/account', label: 'Account & passwords', icon: 'account' },
];

export function Shell({ identity }: { identity: AdminIdentity }) {
  const { t, name, toggle } = useTheme();
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: t.bg }}>
      {/* rail */}
      <aside style={{
        width: 232, flexShrink: 0, background: t.railBg, color: t.railText,
        display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh',
      }}>
        <div style={{ padding: '20px 18px', display: 'flex', alignItems: 'center', gap: 11 }}>
          <VacancyMark />
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.2 }}>Vacancy</div>
            <div style={{ fontSize: 10.5, letterSpacing: 1.6, color: t.railMuted, fontWeight: 700 }}>ADMIN</div>
          </div>
        </div>

        <nav style={{ padding: '6px 12px', display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 10,
                textDecoration: 'none', fontSize: 13.5, fontWeight: 700,
                color: isActive ? t.railText : t.railMuted,
                background: isActive ? t.railActive : 'transparent',
              })}
            >
              <Icon name={item.icon} size={17} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: 14, borderTop: '1px solid rgba(255,255,255,.10)' }}>
          {/* Your own name is the way into your own settings — where people look for it. */}
          <NavLink
            to="/account"
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10,
              textDecoration: 'none', marginBottom: 10,
              background: isActive ? t.railActive : 'transparent',
            })}
          >
            <Icon name="account" size={17} color={t.railMuted} />
            <span style={{ minWidth: 0 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: t.railText, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {identity.name}
              </span>
              <span style={{ fontSize: 11, color: t.railMuted }}>
                {identity.isSuperAdmin ? 'Super administrator' : 'Administrator'}
              </span>
            </span>
          </NavLink>
          <button
            onClick={() => { setSession(null); navigate('/'); }}
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 9, cursor: 'pointer',
              background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.16)',
              color: t.railText, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{
          height: 58, borderBottom: `1px solid ${t.border}`, background: t.surface,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
          padding: '0 22px', position: 'sticky', top: 0, zIndex: 30,
        }}>
          <Button
            size="sm"
            tone="subtle"
            onClick={toggle}
            title={name === 'dark' ? 'Switch to light' : 'Switch to dark'}
          >
            {name === 'dark' ? '☀ Light' : '☾ Dark'}
          </Button>
        </header>
        <ClosedBanner />
        <main style={{ padding: 22, flex: 1 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * A band across every screen while the platform is shut.
 *
 * Maintenance mode is the one setting whose danger is forgetting it. Somebody switches it on
 * at eleven at night, the migration finishes, everybody goes to bed, and the platform is
 * closed until a customer complains — which is not a monitoring system, it is luck. So it is
 * impossible to be anywhere in this console and not see it, and the way out is in the banner.
 */
function ClosedBanner() {
  const { t } = useTheme();
  const [status, setStatus] = useState<PlatformStatus | null>(null);

  useEffect(() => {
    const read = () => { void adminApi.platformStatus().then(setStatus).catch(() => {}); };
    read();
    // Polled, so somebody else closing the platform still shows up here within the minute —
    // and nudged, so the person who just closed it does not sit looking at a screen that has
    // not caught up at the exact moment they need to see that it worked.
    const timer = setInterval(read, 60_000);
    window.addEventListener(SETTINGS_CHANGED, read);
    return () => { clearInterval(timer); window.removeEventListener(SETTINGS_CHANGED, read); };
  }, []);

  if (!status?.maintenance) return null;

  return (
    <div
      data-maintenance
      style={{
        background: t.danger, color: '#fff', padding: '10px 22px',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        fontSize: 13, fontWeight: 600, position: 'sticky', top: 58, zIndex: 29,
      }}
    >
      <span>The platform is closed. Nothing can be booked, posted or applied for.</span>
      {status.message ? (
        <span style={{ fontWeight: 400, opacity: .9 }}>People are being told: “{status.message}”</span>
      ) : null}
      <Link
        to="/settings"
        style={{
          marginLeft: 'auto', color: '#fff', fontWeight: 800, fontSize: 12.5,
          textDecoration: 'underline', whiteSpace: 'nowrap',
        }}
      >
        Open it again
      </Link>
    </div>
  );
}

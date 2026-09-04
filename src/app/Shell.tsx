/**
 * The console frame: navy rail on the left in both themes, content on the right.
 * The rail carries the brand mark drawn as SVG so it needs no asset pipeline and stays
 * crisp at any zoom.
 */
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { setSession } from '../api/client';
import { Forbidden } from '../pages/ErrorPage';
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
/**
 * The rail, in groups.
 *
 * It was twenty-eight flat links, which is past the point where anybody reads a list — you
 * scan for the word you remember and give up if it is not in the first ten. Grouping does not
 * make the console smaller; it makes the SHAPE of it visible, so somebody looking for
 * "audiences" knows to look under Reach before they start reading.
 *
 * The order is by how often a working day touches them: what is happening now, then the
 * business, then the things you do TO people, then the things people do to you.
 */
type NavItem = { to: string; label: string; icon: IconName; superOnly?: boolean };
type NavGroup = { title: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    // Overview says what is waiting; This morning says what somebody who read everything
    // would tell you about it; Mission Control says whether the machine is well. First,
    // because they are the screens a day starts on.
    title: 'Today',
    items: [
      { to: '/', label: 'Overview', icon: 'overview' },
      { to: '/assistant', label: 'This morning', icon: 'spark' },
      { to: '/mission-control', label: 'Mission Control', icon: 'pulse' },
    ],
  },
  {
    title: 'Grow',
    items: [
      { to: '/growth', label: 'Growth', icon: 'insights' },
      { to: '/demand', label: 'What people wanted', icon: 'search' },
      { to: '/ambassadors', label: 'Ambassadors', icon: 'people' },
    ],
  },
  {
    // Its own group, and named the thing it is. This started life as one renamed link inside
    // a group called Reach, which was defensible on the grounds that Broadcasts already did
    // compose, audience and history — and wrong, because the first thing anybody said about
    // the engine was that they could not find it. A module nobody can see is not shipped.
    title: 'Notification engine',
    items: [
      { to: '/notifications', label: 'Engine home', icon: 'pulse' },
      { to: '/broadcasts', label: 'Compose & send', icon: 'advert' },
      { to: '/audiences', label: 'Audiences', icon: 'people' },
      { to: '/promos', label: 'Paid promos', icon: 'agreement' },
    ],
  },
  {
    // What is left of Reach: the placements that sit and wait to be scrolled past, as
    // opposed to the engine above, which interrupts.
    title: 'Reach',
    items: [
      { to: '/adverts', label: 'Adverts', icon: 'advert' },
      { to: '/spotlight', label: 'Spotlight', icon: 'spark' },
    ],
  },
  {
    title: 'Inbox',
    items: [
      { to: '/support', label: 'Support chat', icon: 'people' },
      { to: '/messages', label: 'Messages', icon: 'mail' },
    ],
  },
  {
    title: 'Marketplace',
    items: [
      { to: '/users', label: 'People', icon: 'people' },
      { to: '/catalog', label: 'Services', icon: 'services' },
      { to: '/bookings', label: 'Bookings', icon: 'booking' },
      { to: '/content', label: 'Posted content', icon: 'content' },
      { to: '/learn', label: 'Learn', icon: 'training' },
      { to: '/documents', label: 'Documents', icon: 'certificate' },
      { to: '/identity', label: 'Identity', icon: 'certificate' },
      { to: '/vouches', label: 'Vouches', icon: 'certificate' },
      { to: '/medical', label: 'Medical verification', icon: 'certificate' },
      // The same job as the licence desk above, on places rather than people.
      { to: '/facilities', label: 'Health facilities', icon: 'certificate' },
      // Where those places come from: codes issued to people who walk to the gate, and the
      // town-and-section tree they pick from when they get there.
      { to: '/field', label: 'Field work', icon: 'certificate' },
    ],
  },
  {
    title: 'Money',
    items: [
      { to: '/payments', label: 'Payments', icon: 'agreement' },
      { to: '/ledger', label: 'Money owed', icon: 'agreement' },
      { to: '/reports', label: 'Reports', icon: 'agreement' },
    ],
  },
  {
    // Four screens answering neighbouring questions: what people complained about, what was
    // done TO the platform, who changed what, and what the software itself did.
    title: 'Safety',
    items: [
      { to: '/complaints', label: 'Complaints', icon: 'flag' },
      { to: '/threats', label: 'Threat centre', icon: 'shield' },
      // What the nightly sweep noticed in the marketplace itself: shared IDs, one phone on
      // many accounts, clustered reviews, unlicensed medical claims, prices far from everyone's.
      { to: '/signals', label: 'Signals', icon: 'eye' },
      { to: '/audit', label: 'Audit trail', icon: 'audit' },
      { to: '/logs', label: 'Logs', icon: 'logs' },
    ],
  },
  {
    title: 'Setup',
    items: [
      { to: '/team', label: 'Admin team', icon: 'shield' },
      { to: '/languages', label: 'Languages', icon: 'speech' },
      { to: '/settings', label: 'Settings', icon: 'lock' },
      // Also reachable by clicking your own name below — but passwords live here, and
      // people look for them in the nav before they look in a footer.
      { to: '/account', label: 'Account & passwords', icon: 'account' },
    ],
  },
];

export function Shell({ identity }: { identity: AdminIdentity }) {
  const { t, name, toggle } = useTheme();

  // A refusal from the API replaces the page, and navigating anywhere clears it. Held here
  // rather than in each screen because every screen would otherwise need the same twelve lines,
  // and the ones that forgot would be the ones somebody hit.
  const location = useLocation();
  const [forbidden, setForbidden] = useState<string | null>(null);

  useEffect(() => {
    const onForbidden = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setForbidden(typeof detail === 'string' ? detail : '');
    };
    window.addEventListener('vacancy:forbidden', onForbidden);
    return () => window.removeEventListener('vacancy:forbidden', onForbidden);
  }, []);

  useEffect(() => { setForbidden(null); }, [location.pathname]);
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: t.bg }}>
      {/* rail */}
      {/* 100dvh rather than 100vh: on a laptop they are the same, but a console opened on a
          tablet or a phone browser measures 100vh against the viewport WITHOUT the address
          bar, which puts Sign out underneath it. overflow: hidden keeps the header and the
          footer pinned while the middle scrolls. */}
      <aside style={{
        width: 232, flexShrink: 0, background: t.railBg, color: t.railText,
        display: 'flex', flexDirection: 'column', position: 'sticky', top: 0,
        height: '100dvh', overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 18px', display: 'flex', alignItems: 'center', gap: 11 }}>
          <VacancyMark />
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.2 }}>Vacancy</div>
            <div style={{ fontSize: 10.5, letterSpacing: 1.6, color: t.railMuted, fontWeight: 700 }}>ADMIN</div>
          </div>
        </div>

        {/* minHeight: 0 and overflowY are a pair, and neither works alone. A flex child
            defaults to min-height: auto, so it refuses to shrink below its own content and
            grows straight past the bottom of the rail — which is why the last few sections
            and the Sign out button below them could not be reached at all. minHeight: 0 lets
            it shrink to the space it has; overflowY gives it somewhere to put the rest. */}
        <nav style={{
          padding: '6px 12px', display: 'flex', flexDirection: 'column', gap: 3, flex: 1,
          minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
        }}>
          {NAV_GROUPS.map((group, index) => (
            <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* A heading, not a divider. A line between groups says "these are apart";
                  a word says what they have in common, which is the thing being looked for. */}
              <div style={{
                fontSize: 10, letterSpacing: 1.3, fontWeight: 800, textTransform: 'uppercase',
                color: t.railMuted, opacity: 0.72,
                padding: index === 0 ? '2px 12px 4px' : '14px 12px 4px',
              }}>
                {group.title}
              </div>
              {group.items.map(item => (
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
            </div>
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
          {forbidden !== null ? <Forbidden path={forbidden || undefined} /> : <Outlet />}
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

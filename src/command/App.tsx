/**
 * The command centre's root: the session gate, the shell, the routes.
 *
 * Nothing renders until the API confirms this token belongs to somebody on a desk — the
 * app never decides that from a stored flag. The shell is a rail on the left and a status
 * strip on top. The rail is the room's spine: who is standing at which institution, the
 * screens grouped by what they are for (the live picture, the resources, the institution
 * itself), with the one or two numbers on each that mean "look here now", and the shift
 * clock at the bottom so nobody is surprised when the session ends. The strip carries the
 * vital signs (open, unowned, P1, live) on every screen, because the person at a desk
 * should never have to go back to the overview to know whether something has just come in.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { loadSession, onSessionChange } from '../api/client';
import { Icon, type IconName } from './icons';
import { authApi, commandApi, deskRoleWords, LEVEL_WORDS, ROLE_WORDS, type Access, type DeskDirectory, type DispatchQueue, type FleetSummary, type HierarchyOverview } from './api';
import { SignIn } from './SignIn';
import { T } from './theme';
import { Btn, Crest, LiveDot, Loading, Num, SECTOR_TONES, crestText } from './ui';
import { CommandProvider, useCommand } from './useCommand';
import { AlarmLayer, AlarmProvider, SoundToggle } from './Alarm';
import { Overview } from './pages/Overview';
import { MapPage } from './pages/MapPage';
import { Queue } from './pages/Queue';
import { IncidentPage } from './pages/Incident';
import { Fleet } from './pages/Fleet';
import { Roster } from './pages/Roster';
import { Institution } from './pages/Institution';
import { People } from './pages/People';
import { Analytics } from './pages/Analytics';
import { Report } from './pages/Report';
import { Settings } from './pages/Settings';
import { AlarmRules } from './pages/AlarmRules';
import { AlarmHistoryPage } from './pages/AlarmHistory';
import { Districts } from './pages/Districts';
import { District } from './pages/District';
import { StationPage } from './pages/StationPage';

/**
 * Where the app lives. On its own host (command.vacancysl.com) it is the root; served from
 * the console's host as `/command.html` it routes under that path, so a quick look works
 * before a subdomain exists. Either way the server must send unknown paths under the base
 * back to command.html.
 */
const BASENAME = /^\/command\.html/i.test(window.location.pathname) ? '/command.html' : undefined;

export function App() {
  const [access, setAccess] = useState<Access | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const verify = () => {
      if (!loadSession()) { setAccess(null); setChecking(false); return; }
      commandApi.access()
        .then(a => setAccess(a.isDispatcher ? a : null))
        .catch(() => setAccess(null))
        .finally(() => setChecking(false));
    };
    verify();
    return onSessionChange(session => { if (!session) setAccess(null); });
  }, []);

  const signOut = useCallback(() => { authApi.signOut(); setAccess(null); }, []);

  if (checking) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><Loading label="Opening the desk…" /></div>;
  if (!access) return <SignIn onSignedIn={setAccess} />;

  return (
    <CommandProvider access={access} onSignOut={signOut}>
      <BrowserRouter basename={BASENAME}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<Overview />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/incidents/:id" element={<IncidentPage />} />
            <Route path="/fleet" element={<Fleet />} />
            <Route path="/roster" element={<Roster />} />
            <Route path="/institution" element={<Institution />} />
            <Route path="/institution/:tab" element={<Institution />} />
            <Route path="/stations" element={<Navigate to="/institution/offices" replace />} />
            <Route path="/stations/:id" element={<StationPage />} />
            <Route path="/districts" element={<Districts />} />
            <Route path="/districts/:slug" element={<District />} />
            <Route path="/people" element={<People />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/analytics/report" element={<Report />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/alarm" element={<AlarmRules />} />
            <Route path="/settings/alarm/history" element={<AlarmHistoryPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </CommandProvider>
  );
}

/* ================================ the rail ================================ */

type NavItem = { to: string; label: string; icon: IconName; end?: boolean; key: string; hint: string };
type NavGroup = { title: string; items: NavItem[] };

const BASE_GROUPS: NavGroup[] = [
  { title: 'Live', items: [
    { to: '/', label: 'Overview', icon: 'home', end: true, key: 'o', hint: 'The wall at a glance' },
    { to: '/map', label: 'Live map', icon: 'map', key: 'm', hint: 'Every open incident and responder' },
    { to: '/queue', label: 'Queue', icon: 'inbox', key: 'q', hint: 'What needs a dispatcher' },
  ] },
  { title: 'Resources', items: [
    { to: '/fleet', label: 'Fleet', icon: 'truck', key: 'f', hint: 'Responders and vehicles' },
    { to: '/roster', label: 'Roster', icon: 'calendar', key: 'r', hint: 'Who is on when' },
    { to: '/people', label: 'People', icon: 'team', key: 'p', hint: 'Who signs in to this desk' },
  ] },
  { title: 'Institution', items: [
    { to: '/institution', label: 'Institution', icon: 'building', key: 'i', hint: 'Profile, offices, departments, numbers' },
    { to: '/analytics', label: 'Analytics', icon: 'chart', key: 'a', hint: 'The report, every breakdown' },
  ] },
];

/** The rung this person stands on decides the ladder's one entry: their station, their district, or the country. */
function ladderGroup(access: Access, overview: HierarchyOverview | null): NavGroup | null {
  const level = overview?.level ?? access.level;
  if (level === 1) {
    const to = overview?.homeStationId ? `/stations/${overview.homeStationId}` : null;
    return to ? { title: 'Command', items: [{ to, label: 'My station', icon: 'facility', key: 'd', hint: 'What is going on at your station' }] } : null;
  }
  if (level === 2) {
    const slug = overview?.homeDistrictSlug ?? access.districtSlug;
    return slug ? { title: 'Command', items: [{ to: `/districts/${slug}`, label: 'My district', icon: 'sitemap', key: 'd', hint: 'Every station in your district' }] } : null;
  }
  if (level >= 3) return { title: 'Command', items: [{ to: '/districts', label: 'Districts', icon: 'sitemap', key: 'd', hint: 'All sixteen districts and their stations' }] };
  return null;
}

const RAIL_KEY = 'vacancy.command.rail';

function Shell() {
  const { access, socket, clock, tick, signOut, institutions, institutionId, institutionName, setInstitution } = useCommand();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => { try { return window.localStorage.getItem(RAIL_KEY) === 'narrow'; } catch { return false; } });
  const [vitals, setVitals] = useState<DispatchQueue | null>(null);
  const [fleet, setFleet] = useState<FleetSummary | null>(null);
  const [directory, setDirectory] = useState<DeskDirectory | null>(null);
  const [ladder, setLadder] = useState<HierarchyOverview | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const fullBleed = location.pathname === '/map' || location.pathname === '/analytics/report';

  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    commandApi.queue({ take: 200 }).then(setVitals).catch(() => { /* the strip goes quiet */ });
    commandApi.fleet().then(setFleet).catch(() => { /* the badge goes quiet */ });
  }, [tick]);
  // The directory's "needs a hand" count moves slowly; every tenth tick, and on every visit to the institution page.
  useEffect(() => {
    if (tick % 10 !== 0 && !location.pathname.startsWith('/institution')) return;
    commandApi.directory(institutionId).then(setDirectory).catch(() => setDirectory(null));
  }, [tick, institutionId, location.pathname]);
  // The ladder's own numbers move slowly too. A national desk with no institution chosen has no ladder to read.
  useEffect(() => {
    if (access.national && !institutionId) { setLadder(null); return; }
    if (tick % 10 !== 0 && !location.pathname.startsWith('/districts') && !location.pathname.startsWith('/stations')) return;
    commandApi.hierarchy(7, institutionId).then(setLadder).catch(() => { /* the entry goes quiet */ });
  }, [tick, institutionId, access.national, location.pathname]);
  const groups = useMemo(() => {
    const rung = ladderGroup(access, ladder);
    return rung ? [BASE_GROUPS[0], rung, ...BASE_GROUPS.slice(1)] : BASE_GROUPS;
  }, [access, ladder]);
  useEffect(() => { try { window.localStorage.setItem(RAIL_KEY, collapsed ? 'narrow' : 'wide'); } catch { /* fine */ } }, [collapsed]);

  // "g" then a letter jumps between screens; "[" folds the rail. Never while typing.
  const chord = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable))) return;
      if (e.key === '[') { setCollapsed(c => !c); return; }
      if (chord.current) {
        window.clearTimeout(chord.current); chord.current = null;
        const hit = groups.flatMap(g => g.items).find(i => i.key === e.key.toLowerCase());
        if (hit) { e.preventDefault(); navigate(hit.to); }
        else if (e.key.toLowerCase() === 's') navigate('/settings');
        return;
      }
      if (e.key.toLowerCase() === 'g') chord.current = window.setTimeout(() => { chord.current = null; }, 1200);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, groups]);

  const openNow = vitals?.cards.length ?? 0;
  const p1 = vitals?.p1Open ?? 0;
  const unowned = vitals?.unowned ?? 0;
  const urgent = directory?.attention.filter(a => a.severity === 3).length ?? 0;
  const readiness = directory?.readiness.score ?? null;
  const session = authApi.session();
  const endsAt = session?.expiresAt ? new Date(session.expiresAt) : null;
  const minutesLeft = endsAt ? Math.max(0, Math.round((endsAt.getTime() - clock.getTime()) / 60000)) : null;
  const institution = institutions.find(i => i.id === institutionId) ?? null;
  const tone = SECTOR_TONES[(institution ? sectorToneGuess(institution.sectorCode) : sectorToneGuess(access.sectorCode)) ?? 'navy'];
  const roleWords = access.title ?? (access.national ? 'National desk' : access.role === 2 ? deskRoleWords(2, access.facilityName, access.level || null) : ROLE_WORDS[access.role] ?? 'Desk');
  const scopeLine = access.national ? null : access.level === 1 ? access.facilityName : access.level === 2 ? `${access.districtName ?? 'District'} district` : access.level === 3 ? 'Nationwide' : null;
  const attentionNow = ladder?.attention.filter(a => a.weight === 'high').length ?? 0;
  const width = collapsed ? 68 : 240;

  const badges: Record<string, ReactNode> = useMemo(() => ({
    '/queue': unowned > 0 ? <Badge tone={p1 > 0 ? 'bad' : 'warn'} pulse={p1 > 0} title={`${unowned} unowned${p1 > 0 ? ` · ${p1} P1 open` : ''}`}>{unowned}</Badge> : p1 > 0 ? <Badge tone="bad" pulse title={`${p1} P1 open`}>{p1}</Badge> : null,
    '/map': openNow > 0 ? <Badge tone="neutral" title={`${openNow} open`}>{openNow}</Badge> : null,
    '/fleet': fleet && fleet.onDuty > 0 ? <Badge tone="good" title={`${fleet.onDuty} on duty · ${fleet.free} free`}>{fleet.onDuty}</Badge> : null,
    '/roster': fleet && fleet.rosteredNotOn > 0 ? <Badge tone="warn" title={`${fleet.rosteredNotOn} rostered but not on`}>{fleet.rosteredNotOn}</Badge> : null,
    '/districts': attentionNow > 0 ? <Badge tone="bad" title={`${attentionNow} to deal with now`}>{attentionNow}</Badge> : null,
    ...(ladder?.homeStationId ? { [`/stations/${ladder.homeStationId}`]: attentionNow > 0 ? <Badge tone="bad" title={`${attentionNow} to deal with now`}>{attentionNow}</Badge> : null } : {}),
    ...(ladder?.homeDistrictSlug && ladder.level === 2 ? { [`/districts/${ladder.homeDistrictSlug}`]: attentionNow > 0 ? <Badge tone="bad" title={`${attentionNow} to deal with now`}>{attentionNow}</Badge> : null } : {}),
    '/institution': urgent > 0 ? <Badge tone="bad" title={`${urgent} to fix today`}>{urgent}</Badge> : readiness !== null && readiness < 85 ? <Badge tone="warn" title={`Readiness ${readiness} of 100`}>{readiness}</Badge> : null,
  }), [unowned, p1, openNow, fleet, urgent, readiness, attentionNow, ladder]);

  return (
    <AlarmProvider queue={vitals}>
    <div style={{ display: 'flex', minHeight: '100vh', background: T.bg }}>
      <AlarmLayer />
      <nav className={open ? 'cc-rail cc-rail-open' : 'cc-rail'} aria-label="Command centre" data-narrow={collapsed ? '1' : '0'}
        style={{ width, flexShrink: 0, background: `linear-gradient(180deg, ${T.surface} 0%, ${T.bg} 100%)`, borderRight: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', transition: 'width .18s ease', overflow: 'hidden' }}>
        {/* brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '14px 0 12px' : '14px 14px 12px', justifyContent: collapsed ? 'center' : 'flex-start', height: 58 }}>
          <svg width={26} height={26} viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M17 47 L39 71" stroke="#fff" strokeWidth="15" strokeLinecap="round" fill="none" /><path d="M39 71 L85 17" stroke={T.brand} strokeWidth="15" strokeLinecap="round" fill="none" /></svg>
          {collapsed ? null : <>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: 0.3, lineHeight: 1.1 }}>Command</div>
              <div style={{ fontSize: 9.5, color: T.subtle, letterSpacing: 1.6, textTransform: 'uppercase', marginTop: 2, whiteSpace: 'nowrap' }}>Operations centre</div>
            </div>
            <button type="button" onClick={() => setCollapsed(true)} title="Fold the rail  [" aria-label="Fold the rail" style={{ border: 'none', background: 'transparent', color: T.subtle, cursor: 'pointer', padding: 4, borderRadius: 6 }} className="cc-nav"><Icon name="chevronLeft" size={14} /></button>
          </>}
        </div>

        {/* who we are standing for */}
        <div style={{ padding: collapsed ? '6px 0 10px' : '4px 12px 12px', borderBottom: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column', alignItems: collapsed ? 'center' : 'stretch', gap: 8 }}>
          {collapsed ? (
            <button type="button" onClick={() => setCollapsed(false)} title={institutionName ?? access.institutionName ?? 'Every institution'} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}>
              <Crest text={crestText(institution?.shortName ?? institutionName ?? access.institutionName ?? (access.national ? 'ALL' : 'Desk'))} tone={tone} size={36} />
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 8px', borderRadius: 10, background: T.surface2, border: `1px solid ${T.line}` }}>
              <Crest text={crestText(institution?.shortName ?? institutionName ?? access.institutionName ?? (access.national ? 'ALL' : 'Desk'))} tone={tone} size={38} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 9.5, color: T.subtle, letterSpacing: 1.3, textTransform: 'uppercase' }}>{access.national ? 'Standing at' : institution?.sectorName ?? access.sectorName ?? 'Desk'}</div>
                {access.national || institutions.length > 1 ? (
                  <select aria-label="Institution" value={institutionId ?? ''} onChange={e => setInstitution(e.target.value || null)} className="cc-picker" style={{ width: '100%', fontSize: 12.5, fontWeight: 600, padding: '2px 0', border: 'none', background: 'transparent', color: T.text, cursor: 'pointer', appearance: 'auto' }}>
                    {access.national ? <option value="">Every institution</option> : null}
                    {institutions.map(i => <option key={i.id} value={i.id}>{i.name}{i.oversight ? ' · ministry' : ''}</option>)}
                  </select>
                ) : <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{institutionName ?? access.institutionName ?? 'Vacancy'}</div>}
                {scopeLine && !access.national ? <div title={access.scopeLabel ?? undefined} style={{ fontSize: 10.5, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scopeLine}</div> : institution && access.national ? <div style={{ fontSize: 10.5, color: T.muted }}>{institution.sectorName}</div> : null}
              </div>
            </div>
          )}
          {!collapsed && readiness !== null && institutionId ? (
            <button type="button" onClick={() => navigate('/institution')} title="Directory readiness — how findable and reachable this institution is" style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', padding: '0 2px', cursor: 'pointer', color: T.muted, fontSize: 10.5 }}>
              <span style={{ flex: 1, height: 4, borderRadius: 2, background: T.surface3, overflow: 'hidden' }}><span style={{ display: 'block', width: `${readiness}%`, height: '100%', background: readiness >= 85 ? T.good : readiness >= 55 ? T.warn : T.bad, transition: 'width .4s' }} /></span>
              <span className="cc-num" style={{ color: readiness >= 85 ? T.good : readiness >= 55 ? T.warn : T.bad, fontWeight: 600 }}>{readiness}</span>
              <span style={{ letterSpacing: 0.6, textTransform: 'uppercase', fontSize: 9.5 }}>ready</span>
            </button>
          ) : null}
        </div>

        {/* the screens */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: collapsed ? '8px 0' : '8px 10px', display: 'flex', flexDirection: 'column', gap: 10, alignContent: 'start' }}>
          {groups.map(group => (
            <div key={group.title}>
              {collapsed ? <div style={{ height: 1, background: T.line, margin: '2px 16px 8px' }} /> : <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase', color: T.subtle, padding: '4px 10px 5px' }}>{group.title}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {group.items.map(n => (
                  <NavLink key={n.to} to={n.to} end={n.end} className="cc-nav" title={collapsed ? `${n.label} — ${n.hint}  (g ${n.key})` : `${n.hint}  (g ${n.key})`}
                    style={({ isActive }) => ({ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '9px 0' : '7px 10px', justifyContent: collapsed ? 'center' : 'flex-start', margin: collapsed ? '0 10px' : 0, borderRadius: 8, fontSize: 12.5, fontWeight: 500, color: isActive ? T.text : T.muted, textDecoration: 'none', position: 'relative', background: isActive ? T.accentSoft : 'transparent' })}>
                    {({ isActive }) => (<>
                      <span className="cc-nav-bar" style={{ position: 'absolute', left: collapsed ? -10 : -10, top: 7, bottom: 7, width: 2, borderRadius: 1, background: T.accent, opacity: isActive ? 1 : 0 }} />
                      <span style={{ position: 'relative', display: 'inline-flex' }}>
                        <Icon name={n.icon} size={16} color={isActive ? T.accent : T.subtle} width={1.8} />
                        {collapsed && badges[n.to] ? <span style={{ position: 'absolute', top: -5, right: -7, transform: 'scale(.85)' }}>{badges[n.to]}</span> : null}
                      </span>
                      {collapsed ? null : <><span style={{ flex: 1, letterSpacing: 0.1 }}>{n.label}</span>{badges[n.to]}</>}
                    </>)}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* the shift */}
        <div style={{ borderTop: `1px solid ${T.line}`, padding: collapsed ? '8px 0' : '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {collapsed ? null : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px 6px', fontSize: 10.5, color: T.subtle, whiteSpace: 'nowrap' }}>
              <LiveDot up={socket} />
              <span style={{ flex: 1 }} />
              {minutesLeft !== null ? <span className="cc-num" title={`The shift's session ends at ${endsAt!.toISOString().slice(11, 16)} UTC`} style={{ color: minutesLeft <= 15 ? T.warn : T.subtle }}>{minutesLeft <= 15 ? `${minutesLeft} min left` : `shift ends ${endsAt!.toISOString().slice(11, 16)}`}</span> : null}
            </div>
          )}
          <NavLink to="/settings" className="cc-nav" title="Settings  (g s)" style={({ isActive }) => ({ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '9px 0' : '7px 10px', justifyContent: collapsed ? 'center' : 'flex-start', margin: collapsed ? '0 10px' : 0, borderRadius: 8, fontSize: 12.5, fontWeight: 500, color: isActive ? T.text : T.muted, textDecoration: 'none', background: isActive ? T.accentSoft : 'transparent' })}>
            {({ isActive }) => (<><Icon name="settings" size={16} color={isActive ? T.accent : T.subtle} />{collapsed ? null : <span style={{ flex: 1 }}>Settings</span>}</>)}
          </NavLink>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: collapsed ? '6px 0 2px' : '6px 6px 2px', justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <div title={`${access.name}${access.email ? ` · ${access.email}` : ''}`} style={{ width: 30, height: 30, borderRadius: 15, background: `linear-gradient(135deg, ${T.accentSoft}, ${T.surface3})`, border: `1px solid ${T.line2}`, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: T.accent, flexShrink: 0 }}>{initials(access.name)}</div>
            {collapsed ? null : <>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{access.name || 'Desk'}</div>
                <div style={{ fontSize: 10.5, color: T.subtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{roleWords}</div>
              </div>
              <button type="button" onClick={signOut} title="Sign out" aria-label="Sign out" className="cc-nav" style={{ border: 'none', background: 'transparent', color: T.subtle, cursor: 'pointer', padding: 5, borderRadius: 6 }}><Icon name="logout" size={15} /></button>
            </>}
          </div>
          {collapsed ? <button type="button" onClick={() => setCollapsed(false)} title="Unfold the rail  [" aria-label="Unfold the rail" className="cc-nav" style={{ border: 'none', background: 'transparent', color: T.subtle, cursor: 'pointer', padding: 6, borderRadius: 6, alignSelf: 'center' }}><Icon name="chevronRight" size={14} /></button> : null}
        </div>
      </nav>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px', height: 46, borderBottom: `1px solid ${T.line}`, background: T.surface, position: 'sticky', top: 0, zIndex: 20 }}>
          <button type="button" className="cc-burger" aria-label="Menu" onClick={() => setOpen(o => !o)} style={{ display: 'none', border: 'none', background: 'transparent', color: T.muted, cursor: 'pointer', padding: 4 }}><Icon name="menu" size={18} /></button>
          <Vital label="Open" value={openNow} tone={openNow > 0 ? T.text : T.subtle} onClick={() => navigate('/queue')} />
          <Vital label="Unowned" value={unowned} tone={unowned > 0 ? T.warn : T.subtle} onClick={() => navigate('/queue?filter=unowned')} />
          <Vital label="P1 open" value={p1} tone={p1 > 0 ? T.bad : T.subtle} pulse={p1 > 0} onClick={() => navigate('/queue?filter=p1')} />
          {fleet ? <Vital label="On duty" value={fleet.onDuty} tone={fleet.onDuty > 0 ? T.good : T.subtle} onClick={() => navigate('/fleet')} /> : null}
          <span style={{ flex: 1 }} />
          {access.scopeLabel && !access.national ? <span className="cc-scope" title={`You see ${access.scopeLabel}. ${LEVEL_WORDS[access.level] ?? ''}`} style={{ fontSize: 11, color: T.muted, display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Icon name="shield" size={13} color={T.subtle} />{access.scopeLabel}</span> : null}
          <span style={{ fontSize: 11, color: T.subtle, display: 'flex', alignItems: 'center', gap: 6 }} title="Press g then a letter to jump: o overview · m map · q queue · f fleet · r roster · p people · d districts or your station · i institution · a analytics · s settings. [ folds the rail."><Icon name="keyboard" size={13} /> g + key</span>
          <SoundToggle />
          <LiveDot up={socket} />
          <Num size={12} color={T.muted}>{clock.toISOString().slice(11, 19)}<span style={{ color: T.subtle }}> UTC</span></Num>
        </header>
        <main style={{ flex: 1, minWidth: 0, padding: fullBleed ? 0 : 14, display: 'flex', flexDirection: 'column' }}>
          <Outlet />
        </main>
      </div>
    </div>
    </AlarmProvider>
  );
}

function Badge({ children, tone, pulse, title }: { children: ReactNode; tone: 'bad' | 'warn' | 'good' | 'neutral'; pulse?: boolean; title?: string }) {
  const colour = tone === 'bad' ? T.bad : tone === 'warn' ? T.warn : tone === 'good' ? T.good : T.muted;
  const wash = tone === 'bad' ? T.badSoft : tone === 'warn' ? T.warnSoft : tone === 'good' ? T.goodSoft : T.surface3;
  return <span className={`cc-num${pulse ? ' cc-pulse' : ''}`} title={title} style={{ fontSize: 10.5, fontWeight: 700, color: colour, background: wash, padding: '1px 6px', borderRadius: 5, minWidth: 20, textAlign: 'center', lineHeight: 1.5 }}>{children}</span>;
}

function sectorToneGuess(code: string | null | undefined) {
  switch ((code ?? '').toLowerCase()) {
    case 'police': return 'navy';
    case 'health': return 'teal';
    case 'fire': return 'red';
    case 'disaster': return 'amber';
    case 'road': return 'orange';
    case 'utility': return 'blue';
    case 'maritime': return 'blue';
    case 'community': return 'green';
    default: return 'navy';
  }
}

function Vital({ label, value, tone, pulse, onClick }: { label: string; value: number; tone: string; pulse?: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'baseline', gap: 6, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: tone }}>
      <span className={`cc-num${pulse ? ' cc-pulse' : ''}`} style={{ fontSize: 17, fontWeight: 600 }}>{value}</span>
      <span style={{ fontSize: 10.5, letterSpacing: 0.9, textTransform: 'uppercase', color: T.subtle }}>{label}</span>
    </button>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length === 0 ? '·' : parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function NotFound() {
  const navigate = useNavigate();
  return (
    <div style={{ padding: 40, maxWidth: 420 }}>
      <div style={{ fontSize: 18, fontWeight: 600 }}>There is nothing at this address.</div>
      <div style={{ color: T.muted, marginTop: 6, lineHeight: 1.5 }}>The link may be stale or cut short. Nothing has been deleted — this page says so rather than sending you somewhere that looks fine.</div>
      <div style={{ marginTop: 14 }}><Btn tone="primary" onClick={() => navigate('/')}>Overview</Btn></div>
    </div>
  );
}

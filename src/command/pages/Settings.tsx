/**
 * The desk's own settings: who is signed in, how long for, where the API is, and what the
 * room is doing. Deliberately small. There is no theme to choose — the command centre is
 * dark because the wall is — and no preferences that would make two desks look different.
 */
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { authApi, ROLE_WORDS } from '../api';
import { T } from '../theme';
import { Btn, Eyebrow, LiveDot, Num, Panel, Pill, fmtDateTime } from '../ui';
import { useCommand } from '../useCommand';
import { testAlarm, useAlarm } from '../Alarm';

export function Settings() {
  const { access, socket, signOut, shapes, tick, clock } = useCommand();
  const session = authApi.session();
  const alarm = useAlarm();
  const left = session?.expiresAt ? Math.max(0, Math.round((new Date(session.expiresAt).getTime() - clock.getTime()) / 60_000)) : null;

  return (
    <div className="cc-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, maxWidth: 1000 }}>
      <Panel title="Signed in">
        <Row label="Name" value={access.name || '—'} />
        <Row label="E-mail" value={access.email ?? '—'} />
        <Row label="Desk" value={<>{access.institutionName ?? 'Vacancy'}{access.facilityName ? <span style={{ color: T.muted }}> · {access.facilityName}</span> : null}</>} />
        <Row label="Role" value={<Pill tone={access.national ? 'accent' : access.role === 2 ? 'info' : 'neutral'}>{access.national ? 'National desk' : ROLE_WORDS[access.role]}</Pill>} />
        {access.title ? <Row label="Title" value={access.title} /> : null}
        <Row label="Session ends" value={session?.expiresAt ? <><Num>{fmtDateTime(session.expiresAt)}</Num>{left !== null ? <span style={{ color: left < 30 ? T.warn : T.subtle }}> · {left < 60 ? `${left} min` : `${Math.floor(left / 60)} h ${left % 60} min`} left</span> : null}</> : '—'} />
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}><Btn tone="danger" onClick={signOut}>Sign out</Btn></div>
        <div style={{ fontSize: 11, color: T.subtle, marginTop: 10, lineHeight: 1.5 }}>A command session lasts a shift — twelve hours — and ends when the tab is closed. Sign in again with your e-mail, your password and a fresh code.</div>
      </Panel>
      <Panel title="The room">
        <Row label="Live feed" value={<LiveDot up={socket} />} />
        <Row label="Refreshes" value={<><Num>{tick}</Num><span style={{ color: T.subtle }}> since you opened the desk · every nudge from the hub, and every 15 s regardless</span></>} />
        <Row label="District outlines" value={<><Num>{shapes.length}</Num><span style={{ color: T.subtle }}> loaded</span></>} />
        <Row label="API" value={<Num>{authApi.apiHost().replace(/^https?:\/\//, '') || '—'}</Num>} />
        <Row label="Clock" value={<><Num>{clock.toISOString().slice(11, 19)}</Num><span style={{ color: T.subtle }}> UTC — Sierra Leone keeps UTC all year, so every time here is local time</span></>} />
        <div style={{ marginTop: 12 }}>
          <Eyebrow style={{ marginBottom: 6 }}>When a report comes in</Eyebrow>
          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>A report your institution has set to the siren breathes a red frame round the window, drops a banner with a waiting timer, sounds a siren every few seconds, flashes this tab's title and — with this browser's permission — sends a desktop notification while the window is hidden. It stops when somebody on a desk takes the report, never on a timer. Only the siren can be turned off, and only in this browser.</div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, cursor: 'pointer', marginTop: 8 }}><input type="checkbox" checked={alarm.sound} onChange={e => alarm.setSound(e.target.checked)} style={{ accentColor: T.accent }} /> Sound the siren in this browser</label>
          {alarm.sound && alarm.state === 'blocked' ? <div style={{ fontSize: 11.5, color: T.warn, marginTop: 6 }}>The browser is holding sound back until you click on the page. Click anywhere once, then test it.</div> : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <Btn tone="danger" onClick={() => testAlarm(1)}>Test a critical alarm</Btn>
            <Btn onClick={() => testAlarm(2)}>Test an urgent one</Btn>
            <Btn onClick={() => testAlarm(3)}>Test a new report</Btn>
          </div>
          <div style={{ fontSize: 11, color: T.subtle, marginTop: 6 }}>A test raises a made-up report on this screen only. Nothing is sent to anyone.</div>
          <div style={{ marginTop: 12 }}>
            <Link to="/settings/alarm" style={{ fontSize: 12.5, fontWeight: 600 }}>Choose which reports sound the siren ›</Link>
            <Link to="/settings/alarm/history" style={{ fontSize: 12.5, fontWeight: 600, marginLeft: 14 }}>What rang, and who took it ›</Link>
            <div style={{ fontSize: 11, color: T.subtle, marginTop: 3, lineHeight: 1.5 }}>By severity, by kind of report, and by what else is going on — children, a crowd, a report nobody has taken.</div>
          </div>
        </div>
      </Panel>
      <Panel title="Keyboard" note="For the person who lives in this room">
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 12.5, alignItems: 'center' }}>
          {([['g o', 'Overview'], ['g m', 'Live map'], ['g q', 'Queue'], ['g f', 'Fleet'], ['g r', 'Roster'], ['g p', 'People'], ['g i', 'Institution'], ['g a', 'Analytics'], ['g s', 'Settings'], ['[', 'Fold or unfold the rail'], ['Esc', 'Close a drawer or dialog']] as const).map(([keys, what]) => (
            <Fragment key={keys}><span><Key>{keys}</Key></span><span style={{ color: T.muted }}>{what}</span></Fragment>
          ))}
        </div>
        <div style={{ fontSize: 11, color: T.subtle, marginTop: 10, lineHeight: 1.5 }}>Press g, then the letter, within a second. Nothing fires while you are typing in a field.</div>
      </Panel>
      <Panel title="The institution's own directory" note="What the Institution screen is for">
        <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
          An institution's administrator keeps its own record current — the profile and public line, the chart of offices and branches, the departments inside them, every number a dispatcher or a citizen rings, and what each office can handle. A station supervisor keeps the part under their station. Changes reach the router and the citizen directory at once; Vacancy's verification is a separate mark and never holds a change up. A number nobody has confirmed in ninety days is shown as stale until somebody presses <b style={{ color: T.text }}>Rang it</b>.
        </div>
      </Panel>
      <Panel title="Who may sign in here" style={{ gridColumn: '1 / -1' }}>
        <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6, maxWidth: 820 }}>
          The command centre admits the people an institution has put on its desk — dispatchers, supervisors and view-only staff — and Vacancy's own emergency administrators, who see the country. Supervisors manage the desk under <b style={{ color: T.text }}>People</b>; they find a colleague's Vacancy account by exact e-mail or phone, or start one that the person finishes through an emailed link. Nobody on a desk ever holds a colleague's password, and every action here is written to the audit trail with a name.
        </div>
      </Panel>
    </div>
  );
}

function Key({ children }: { children: ReactNode }) {
  return <kbd style={{ fontFamily: T.mono, fontSize: 11, padding: '2px 7px', borderRadius: 5, border: `1px solid ${T.line2}`, borderBottomWidth: 2, background: T.surface2, color: T.text }}>{children}</kbd>;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, fontSize: 12.5, padding: '4px 0', borderBottom: `1px solid ${T.line}` }}><span style={{ width: 120, flexShrink: 0, color: T.subtle }}>{label}</span><span style={{ minWidth: 0 }}>{value}</span></div>;
}

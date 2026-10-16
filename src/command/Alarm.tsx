/**
 * The alarm: what the command centre does the moment something comes in.
 *
 * A red frame round the whole window that breathes while a critical report waits for a
 * person, a banner at the top with the number, what it is and how long it has been waiting,
 * a siren that repeats until someone takes it, a tab title that flashes in the taskbar, and a
 * desktop notification when the window is hidden. It stops for a report when somebody on a
 * desk takes it — never on a timer — because the point is to find a person for it.
 *
 * What is read out is only what the queue card already shows the desk, and nothing of a
 * sensitive report: no words, no place. Notifications carry the number, the level and the
 * district, never what happened or who.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DispatchQueue } from './api';
import { fresh, loudest, nextSoundAfterMs, notificationFor, onBuiltInRules, rankOf, stillLive, titleFor, toAlert, waiting, waitingAtOpen } from './alarmRules';
import type { Alert } from './alarmRules';
import { openNow, play, soundState, unlockOnGesture, type SoundState } from './sound';
import { steadyInterval } from './ticker';
import { T } from './theme';
import { useCommand } from './useCommand';

const SOUND_KEY = 'vacancy.command.sound';
const TEST_EVENT = 'vacancy:alarm-test';

type AlarmApi = { builtIn: boolean; alerts: Alert[]; sound: boolean; setSound: (on: boolean) => void; state: SoundState; dismiss: (id: string) => void; dismissAll: () => void; test: (level?: 1 | 2 | 3) => void };
const Ctx = createContext<AlarmApi | null>(null);
export const useAlarm = (): AlarmApi => useContext(Ctx) ?? { builtIn: false, alerts: [], sound: false, setSound: () => undefined, state: 'unsupported', dismiss: () => undefined, dismissAll: () => undefined, test: () => undefined };

const readSound = (): boolean => { try { return window.localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; } };

/** Ask the shell to raise a made-up report, to hear and see the alarm. 1 is the siren, 2 an urgent call, 3 a chime. */
export function testAlarm(level: 1 | 2 | 3 = 1) { window.dispatchEvent(new CustomEvent(TEST_EVENT, { detail: level })); }

export function AlarmProvider({ queue, children }: { queue: DispatchQueue | null; children: ReactNode }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [sound, setSoundState] = useState<boolean>(readSound);
  const [state, setState] = useState<SoundState>(() => soundState());
  const seen = useRef<Map<string, number> | null>(null);
  const cards = useRef(queue?.cards ?? []);
  const base = useRef(typeof document === 'undefined' ? 'Command' : document.title);
  const lastSound = useRef<Map<string, number>>(new Map());

  useEffect(() => unlockOnGesture(), []);
  // The browser unlocks sound on the first click anywhere; notice it, so the warning goes the moment it is true.
  useEffect(() => {
    const h = window.setInterval(() => setState(prev => { const next = soundState(); return next === prev ? prev : next; }), 1500);
    return () => window.clearInterval(h);
  }, []);

  const setSound = useCallback((on: boolean) => {
    setSoundState(on);
    try { window.localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* fine */ }
    if (on) {
      openNow();
      play('critical');
      setState(soundState());
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission().catch(() => undefined);
    }
  }, []);

  // New reports: the first queue this desk loads is its baseline, never an alarm.
  useEffect(() => {
    if (!queue) return;
    cards.current = queue.cards;
    const now = Date.now();
    if (seen.current === null) {
      seen.current = new Map(queue.cards.map(c => [c.id, rankOf(c)]));
      const waitingNow = waitingAtOpen(queue.cards, now);
      if (waitingNow.length) setAlerts(waitingNow.slice(0, 30));
      return;
    }
    const added = fresh(seen.current, queue.cards, now);
    setAlerts(current => {
      // a test alert is not in the queue: it stays until dismissed, or — for a quiet one — twelve seconds
      const tests = current.filter(a => a.id.startsWith('test-') && (a.level !== 'new' || now - a.raisedAt < 12_000));
      const kept = [...tests, ...stillLive(current.filter(a => !a.id.startsWith('test-')), queue.cards, now)];
      const ids = new Set(kept.map(a => a.id));
      return [...added.filter(a => !ids.has(a.id)), ...kept].slice(0, 30);
    });
  }, [queue]);

  const dismiss = useCallback((id: string) => setAlerts(list => list.filter(a => a.id !== id)), []);
  const dismissAll = useCallback(() => setAlerts([]), []);

  const test = useCallback((level: 1 | 2 | 3 = 1) => {
    const id = `test-${Date.now()}`;
    const alert = toAlert({
      id, number: 'EM-TEST-0001', category: 1, situationWords: 'A test of the alarm — nothing has happened', severity: level, status: 1, isSensitive: false, isTraining: true,
      alarm: level === 1 ? 3 : level === 2 ? 2 : 1, alarmWhy: 'A test — nothing has been reported',
      sectorCode: 'police', districtSlug: 'western-area-urban', community: 'Hill Station', landmark: null, hasPin: true, reportedAt: new Date().toISOString(), ageMinutes: 0,
      facilityName: 'Test station', institutionName: null, dispatcherName: null, unowned: true, escalationLevel: 0, peopleAffected: null,
    }, Date.now());
    setAlerts(list => [alert, ...list]);
  }, []);
  useEffect(() => {
    const on = (e: Event) => test(((e as CustomEvent<number>).detail as 1 | 2 | 3) ?? 1);
    window.addEventListener(TEST_EVENT, on);
    return () => window.removeEventListener(TEST_EVENT, on);
  }, [test]);

  // The siren: every second, ask the rules whether any alert is due.
  useEffect(() => {
    const stopBeat = steadyInterval(() => {
      const now = Date.now();
      let due: Alert | null = null;
      for (const a of alerts) {
        const last = lastSound.current.get(a.id);
        const gap = nextSoundAfterMs(a.level, last === undefined ? 0 : a.sounded, now - a.raisedAt);
        if (gap === null) continue;
        if (last === undefined || now - last >= gap) { if (!due || a.severity < due.severity) due = a; }
      }
      if (due) {
        lastSound.current.set(due.id, now);
        const shouldSound = sound;
        if (shouldSound) { const ok = play(due.level); setState(ok ? 'ready' : soundState()); }
        setAlerts(list => list.map(a => (a.id === due!.id ? { ...a, sounded: a.sounded + 1 } : a)));
        if (typeof document !== 'undefined' && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted' && due.sounded === 0 && !due.id.startsWith('test-')) {
          const n = notificationFor(due);
          try { new Notification(n.title, { body: n.body, tag: due.id, requireInteraction: due.level === 'critical' }); } catch { /* fine */ }
        }
      }
    }, 1000);
    return stopBeat;
  }, [alerts, sound]);

  // Forget sounds for alerts that are gone, so the memory does not grow.
  useEffect(() => {
    const ids = new Set(alerts.map(a => a.id));
    for (const k of [...lastSound.current.keys()]) if (!ids.has(k)) lastSound.current.delete(k);
  }, [alerts]);

  // The tab title blinks while anything waits.
  useEffect(() => {
    if (alerts.length === 0) { document.title = base.current; return; }
    let phase = 0;
    const stopBlink = steadyInterval(() => { phase += 1; document.title = titleFor(alerts, phase, base.current); }, 900);
    document.title = titleFor(alerts, 0, base.current);
    return () => { stopBlink(); document.title = base.current; };
  }, [alerts]);

  const builtIn = onBuiltInRules(queue?.cards ?? []);
  const value = useMemo<AlarmApi>(() => ({ builtIn, alerts, sound, setSound, state, dismiss, dismissAll, test }), [builtIn, alerts, sound, setSound, state, dismiss, dismissAll, test]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ------------------------------------------------------------------ what is drawn */

/** The red frame and the banners. Mounted once, above everything, and it never takes a click except on its own buttons. */
export function AlarmLayer() {
  const { alerts, dismiss, dismissAll, sound, setSound, state } = useAlarm();
  const { clock } = useCommand();
  const navigate = useNavigate();
  const top = loudest(alerts);
  // Nothing is ringing, but the siren cannot: the browser wants one click before it will make a sound.
  // Say so now, while it is only a notice, rather than after the first report has gone by in silence.
  if (!top) {
    if (!(sound && state === 'blocked')) return null;
    return (
      <button type="button" data-arm-siren onClick={() => setSound(true)}
        style={{ position: 'fixed', top: 52, left: '50%', transform: 'translateX(-50%)', zIndex: 85, cursor: 'pointer', border: `1px solid ${T.warn}`, background: T.surface2, color: T.text, fontSize: 12.5, padding: '8px 14px', borderRadius: 9, boxShadow: '0 8px 30px rgba(0,0,0,.45)' }}>
        <b style={{ color: T.warn }}>The siren is not armed.</b> The browser keeps sound off until you click. Click here to arm it — you will hear a chime.
      </button>
    );
  }
  const critical = alerts.some(a => a.level === 'critical');
  const high = alerts.some(a => a.level === 'high');
  const tone = critical ? T.bad : high ? T.warn : T.accent;
  const shown = [...alerts].sort((a, b) => a.severity - b.severity || b.raisedAt - a.raisedAt).slice(0, 3);
  const more = alerts.length - shown.length;
  const open = (a: Alert) => { dismiss(a.id); if (!a.id.startsWith('test-')) navigate(`/incidents/${a.id}`); };

  return (
    <>
      <div aria-hidden="true" className={critical ? 'cc-edge cc-edge-critical' : high ? 'cc-edge cc-edge-high' : 'cc-edge cc-edge-new'} data-alarm-edge={critical ? 'critical' : high ? 'high' : 'new'} />
      <div role="alert" aria-live="assertive" data-alarm style={{ position: 'fixed', top: 52, left: '50%', transform: 'translateX(-50%)', width: 'min(760px, calc(100vw - 24px))', zIndex: 90, display: 'grid', gap: 8 }}>
        {shown.map(a => {
          const colour = a.level === 'critical' ? T.bad : a.level === 'high' ? T.warn : T.accent;
          const label = a.level === 'critical' ? 'CRITICAL' : a.level === 'high' ? 'URGENT' : 'NEW REPORT';
          return (
            <div key={a.id} className={a.level === 'critical' ? 'cc-alarm-card cc-alarm-card-critical' : 'cc-alarm-card'} data-alert={a.id} data-level={a.level}
              style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 14, alignItems: 'center', padding: '12px 14px', borderRadius: 12, background: T.surface, border: `2px solid ${colour}`, boxShadow: `0 10px 40px rgba(0,0,0,.55), 0 0 0 1px ${colour}` }}>
              <div style={{ textAlign: 'center', minWidth: 74 }}>
                <div className={a.level === 'critical' ? 'cc-blink' : undefined} style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: '#fff', background: colour, padding: '3px 8px', borderRadius: 5 }}>{label}</div>
                <div className="cc-num" style={{ fontSize: 10.5, color: T.muted, marginTop: 4 }}>P{a.severity}{a.raised ? ' · raised' : ''}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="cc-num" style={{ fontSize: 15, fontWeight: 700 }}>{a.number}</span>
                  <span className="cc-num" style={{ fontSize: 12, color: colour, fontWeight: 700 }} title="How long it has been waiting">waiting {waiting(clock.getTime() - a.raisedAt)}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.sensitive ? 'A sensitive report — open it to read it' : a.words}</div>
                {!a.sensitive && (a.where || a.by) ? <div style={{ fontSize: 12, color: T.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[a.where, a.by].filter(Boolean).join(' · ')}</div> : null}
                {a.why ? <div data-alarm-why style={{ fontSize: 11, color: T.subtle, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.why}</div> : null}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => open(a)} style={{ border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, padding: '9px 16px', borderRadius: 8, color: '#fff', background: colour }}>Take it</button>
                <button type="button" onClick={() => dismiss(a.id)} title="Stop alerting for this one without opening it" style={{ cursor: 'pointer', fontSize: 12, padding: '9px 10px', borderRadius: 8, color: T.muted, background: 'transparent', border: `1px solid ${T.line2}` }}>Dismiss</button>
              </div>
            </div>
          );
        })}
        {(more > 0 || (sound && state === 'blocked')) ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', fontSize: 12, color: T.text, background: T.surface2, border: `1px solid ${tone}`, borderRadius: 8, padding: '6px 10px' }}>
            {more > 0 ? <span>{more} more waiting <button type="button" onClick={() => navigate('/queue?filter=unowned')} style={{ border: 'none', background: 'transparent', color: T.accent, cursor: 'pointer', fontSize: 12 }}>open the queue</button> · <button type="button" onClick={dismissAll} style={{ border: 'none', background: 'transparent', color: T.muted, cursor: 'pointer', fontSize: 12 }}>dismiss all</button></span> : null}
            {sound && state === 'blocked' ? <span style={{ color: T.warn }}>The browser is holding the siren back — click anywhere on this page once.</span> : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

/** The header's switch: sound on or off for the siren. The rest of the alarm cannot be turned off. */
export function SoundToggle() {
  const { sound, setSound, state, alerts, builtIn } = useAlarm();
  const blocked = sound && state === 'blocked';
  return (
    <button type="button" onClick={() => setSound(!sound)} aria-pressed={sound} data-sound-toggle
      title={sound ? (blocked ? 'Sound is on, but the browser is waiting for a click on the page' : 'The siren is on — click to silence it') : 'The siren is off — the red frame and banner still show'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${blocked ? T.warn : T.line2}`, background: 'transparent', color: sound ? T.text : T.subtle, cursor: 'pointer', fontSize: 11, padding: '3px 8px', borderRadius: 6 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        {sound ? <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></> : <path d="m16 9 5 6M21 9l-5 6" />}
      </svg>
      {sound ? 'Siren' : 'Muted'}{alerts.length > 0 && blocked ? ' !' : ''}
      {builtIn ? <span data-built-in title="The server has not sent this desk's alarm rules, so the screen is using its built-in table. Update the API to use the rules you set." style={{ color: T.warn, fontWeight: 700 }}>· built-in rules</span> : null}
    </button>
  );
}

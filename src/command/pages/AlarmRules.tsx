/**
 * Which reports ring the room.
 *
 * An institution decides this for itself. The page is one document with four questions on it:
 * how loud for each severity, how loud for each kind of report (a whole category, or one exact
 * situation), what else should raise the voice — children, a crowd, a report no station answers
 * for — and what to do when nobody has taken it. Beside the questions, always on screen, is the
 * answer: every kind of report a citizen can file, sorted by what it will do on this desk.
 *
 * The API does the deciding and puts a number on every queue card; this page only edits the rules
 * and shows what they come to. The summary here mirrors the API's table for severity and type so
 * it can answer before anything is saved; the extra triggers and waiting are described in words.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ALARM_WORDS, commandApi, errorWords, type AlarmSettings, type AlarmSituation, type AlarmView } from '../api';
import { T } from '../theme';
import { Actions, Btn, Input, Loading, Modal, Num, Panel, Pill, Segmented, Select, Toasts, useToasts } from '../ui';
import { testAlarm } from '../Alarm';
import { useCommand } from '../useCommand';

const LEVELS: [number, string][] = [[0, 'Silent'], [1, 'Chime'], [2, 'Urgent'], [3, 'Siren']];
const TONE = (level: number) => (level >= 3 ? T.bad : level === 2 ? T.warn : level === 1 ? T.accent : T.subtle);
const TRIGGER: [number, string][] = [[-1, 'Not a trigger'], [1, 'Chime'], [2, 'Urgent call'], [3, 'Siren']];

const same = (a: AlarmSettings, b: AlarmSettings) => JSON.stringify(a) === JSON.stringify(b);
const clone = (s: AlarmSettings): AlarmSettings => JSON.parse(JSON.stringify(s)) as AlarmSettings;

/** What a situation does on this desk before the extra triggers: its own rule, its category's, or its severity's. */
function levelFor(s: AlarmSettings, x: AlarmSituation): { level: number; from: 'situation' | 'category' | 'severity' } {
  const own = s.bySituation[x.code];
  if (own !== undefined) return { level: own, from: 'situation' };
  const cat = s.byCategory[String(x.category)];
  if (cat !== undefined) return { level: cat, from: 'category' };
  return { level: x.severity >= 1 && x.severity <= 4 ? s.bySeverity[x.severity - 1] : 0, from: 'severity' };
}

export function AlarmRules() {
  const { access, institutions } = useCommand();
  const { toasts, push } = useToasts();
  const [scope, setScope] = useState<string>('');
  const [view, setView] = useState<AlarmView | null>(null);
  const [draft, setDraft] = useState<AlarmSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const [find, setFind] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  const load = (institutionId: string) => {
    setError(null);
    commandApi.alarm(institutionId || null)
      .then(next => { setView(next); setDraft(clone(next.settings)); })
      .catch(caught => setError(errorWords(caught, 'Could not load the alarm rules.')));
  };
  useEffect(() => { load(scope); }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = !!view && !!draft && !same(view.settings, draft);
  const canEdit = !!view?.canEdit;
  const set = (change: (s: AlarmSettings) => void) => setDraft(prev => { if (!prev) return prev; const next = clone(prev); change(next); return next; });

  const save = () => {
    if (!draft || busy) return;
    setBusy(true);
    commandApi.saveAlarm(draft, scope || null)
      .then(next => { setView(next); setDraft(clone(next.settings)); push('Saved. Every desk of this institution rings by it from now on.'); })
      .catch(caught => push(errorWords(caught, 'Could not save.'), 'error'))
      .finally(() => setBusy(false));
  };
  const reset = () => {
    setBusy(true);
    commandApi.resetAlarm(scope || null)
      .then(next => { setView(next); setDraft(clone(next.settings)); setConfirmReset(false); push('Back to the defaults.'); })
      .catch(caught => push(errorWords(caught, 'Could not reset.'), 'error'))
      .finally(() => setBusy(false));
  };

  const grouped = useMemo(() => {
    if (!view || !draft) return [];
    return view.categories.map(c => {
      const rows = view.situations.filter(x => x.category === c.id);
      return { ...c, rows };
    }).filter(c => c.rows.length > 0);
  }, [view, draft]);

  const summary = useMemo(() => {
    const out: Record<number, AlarmSituation[]> = { 3: [], 2: [], 1: [], 0: [] };
    if (!view || !draft) return out;
    for (const x of view.situations) out[levelFor(draft, x).level].push(x);
    return out;
  }, [view, draft]);

  if (error && !view) return <div style={{ color: T.bad, fontSize: 13 }}>{error}</div>;
  if (!view || !draft) return <Loading label="Opening the alarm rules…" />;
  const disabled = !canEdit || busy;
  const needle = find.trim().toLowerCase();

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 1180 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Link to="/settings" style={{ fontSize: 12, color: T.muted, textDecoration: 'none' }}>‹ Settings</Link>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Alarm rules</div>
        <Pill tone={view.custom ? 'accent' : 'neutral'}>{view.custom ? 'Set by this institution' : 'Defaults'}</Pill>
        <span style={{ fontSize: 12, color: T.muted }}>{view.scopeName}</span>
        <span style={{ flex: 1 }} />
        <Link to={scope ? `/settings/alarm/history?institution=${scope}` : '/settings/alarm/history'} style={{ fontSize: 12.5, fontWeight: 600 }}>What rang, and who took it ›</Link>
        {access.national ? (
          <span style={{ minWidth: 240 }}>
            <Select value={scope} onChange={setScope}>
              <option value="">Vacancy's national desk</option>
              {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
          </span>
        ) : null}
      </div>

      <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6, maxWidth: 860 }}>
        Choose how loud the room gets for each kind of report. <b style={{ color: T.text }}>Siren</b> is the red frame and the wail, repeating until a person takes it. <b style={{ color: T.text }}>Urgent</b> keeps a banner up and calls twice. <b style={{ color: T.text }}>Chime</b> is one soft note. <b style={{ color: T.text }}>Silent</b> leaves the report in the queue and says nothing. A rule for one exact situation beats a rule for its category, which beats the severity table.
        {canEdit ? null : <span style={{ color: T.warn }}> You can read these rules; only headquarters supervisors of {view.scopeName} change them.</span>}
      </div>

      <div className="cc-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(300px, 1fr)', gap: 12, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Panel title="By severity" note="The table every report falls back to">
            {[1, 2, 3, 4].map(p => (
              <Line key={p} label={`P${p}`} hint={p === 1 ? 'Critical' : p === 2 ? 'Urgent' : p === 3 ? 'Serious' : 'Routine'}
                control={<Segmented size="xs" value={draft.bySeverity[p - 1]} options={LEVELS.map(([v, l]) => [v, l] as [number, string])} onChange={v => { if (!disabled) set(s => { s.bySeverity[p - 1] = v; }); }} />}
                test={draft.bySeverity[p - 1] > 0 ? () => testAlarm((draft.bySeverity[p - 1] === 3 ? 1 : draft.bySeverity[p - 1] === 2 ? 2 : 3) as 1 | 2 | 3) : undefined} />
            ))}
            <div style={{ fontSize: 11, color: T.subtle, marginTop: 6 }}>An information-only report is always silent.</div>
          </Panel>

          <Panel title="By kind of report" note="Open a category to set one exact situation"
            action={<span style={{ width: 180 }}><Input value={find} onChange={setFind} placeholder="Find a situation…" /></span>}>
            {grouped.map(c => {
              const catRule = draft.byCategory[String(c.id)];
              const expanded = open.has(c.id) || !!needle;
              const rows = c.rows.filter(x => !needle || x.words.toLowerCase().includes(needle) || x.code.includes(needle));
              if (rows.length === 0) return null;
              const exact = c.rows.filter(x => draft.bySituation[x.code] !== undefined).length;
              return (
                <div key={c.id} style={{ borderTop: `1px solid ${T.line}`, padding: '8px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => setOpen(prev => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
                      style={{ border: 'none', background: 'transparent', color: T.text, cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0, display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ color: T.subtle, width: 10 }}>{expanded ? '▾' : '▸'}</span>{c.name}
                    </button>
                    <span style={{ fontSize: 11, color: T.subtle }}>{c.rows.length} situations{exact > 0 ? ` · ${exact} with their own rule` : ''}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ minWidth: 190 }}>
                      <Select disabled={disabled} value={catRule === undefined ? 'follow' : String(catRule)} onChange={v => set(s => { if (v === 'follow') delete s.byCategory[String(c.id)]; else s.byCategory[String(c.id)] = Number(v); })}>
                        <option value="follow">Follow the severity</option>
                        {LEVELS.map(([v, l]) => <option key={v} value={v}>All {c.name.toLowerCase()} — {l.toLowerCase()}</option>)}
                      </Select>
                    </span>
                  </div>
                  {expanded ? (
                    <div style={{ marginTop: 6, display: 'grid', gap: 2 }}>
                      {rows.map(x => {
                        const own = draft.bySituation[x.code];
                        const eff = levelFor(draft, x);
                        return (
                          <div key={x.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 4px 16px', fontSize: 12.5, borderTop: `1px dashed ${T.line}` }}>
                            <span style={{ width: 8, height: 8, borderRadius: 4, background: TONE(eff.level), flexShrink: 0 }} />
                            <span style={{ flex: 1, minWidth: 0 }}>{x.words}{x.sensitive ? <span style={{ color: T.subtle }}> · private</span> : null}</span>
                            <span className="cc-num" style={{ fontSize: 10.5, color: T.subtle }}>filed as P{x.severity}</span>
                            <span style={{ width: 168 }}>
                              <Select disabled={disabled} value={own === undefined ? 'follow' : String(own)} onChange={v => set(s => { if (v === 'follow') delete s.bySituation[x.code]; else s.bySituation[x.code] = Number(v); })}>
                                <option value="follow">{`Follow — ${ALARM_WORDS[eff.from === 'situation' ? levelFor({ ...draft, bySituation: {} }, x).level : eff.level].toLowerCase()}`}</option>
                                {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                              </Select>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </Panel>

          <Panel title="What else raises the voice" note="Only for reports with no rule of their own above">
            <Trigger label="Children are involved" value={draft.children} disabled={disabled} onChange={v => set(s => { s.children = v; })} />
            <Trigger label="A private report" hint="Domestic violence, child protection, a person in danger from themselves" value={draft.sensitive} disabled={disabled} onChange={v => set(s => { s.sensitive = v; })} />
            <Trigger label="No station answers for the area" value={draft.unrouted} disabled={disabled} onChange={v => set(s => { s.unrouted = v; })} />
            <Trigger label="It has been escalated" value={draft.escalated} disabled={disabled} onChange={v => set(s => { s.escalated = v; })} />
            <Trigger label="Many people are affected" value={draft.manyPeople} disabled={disabled} onChange={v => set(s => { s.manyPeople = v; })}
              extra={draft.manyPeople >= 0 ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.muted }}>from <span style={{ width: 62 }}><Input type="number" disabled={disabled} value={String(draft.manyPeopleFrom)} onChange={v => set(s => { s.manyPeopleFrom = Math.max(2, Math.min(500, Number(v) || 2)); })} /></span> people</span> : null} />
          </Panel>

          <Panel title="When nobody takes it, and when you are asked" note="These never turn a sound down">
            <Trigger label="Nobody has taken it for" hint="A quiet report becomes at least this loud. A silent one stays silent." value={draft.waiting} disabled={disabled} onChange={v => set(s => { s.waiting = v; })}
              extra={draft.waiting >= 0 ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.muted }}><span style={{ width: 62 }}><Input type="number" disabled={disabled} value={String(draft.waitingMinutes)} onChange={v => set(s => { s.waitingMinutes = Math.max(1, Math.min(240, Number(v) || 1)); })} /></span> minutes</span> : null} />
            <Line label="Another agency asks this desk to join" hint="Including a case handed to you. Cases you only follow, or help on, never ring."
              control={<Segmented size="xs" value={draft.asked} options={LEVELS.map(([v, l]) => [v, l] as [number, string])} onChange={v => { if (!disabled) set(s => { s.asked = v; }); }} />}
              test={draft.asked > 0 ? () => testAlarm((draft.asked === 3 ? 1 : draft.asked === 2 ? 2 : 3) as 1 | 2 | 3) : undefined} />
          </Panel>

          <Panel title="If nobody takes it" note="Pushes to the phones, while the room keeps ringing">
            <Line label="Push the phones again every" hint="Only for reports ringing urgent or the siren that nobody has taken. Up to six more times. 0 means never again."
              control={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.muted }}><span style={{ width: 62 }}><Input type="number" disabled={disabled} value={String(draft.repeatMinutes)} onChange={v => set(s => { s.repeatMinutes = Math.max(0, Math.min(60, Math.round(Number(v) || 0))); })} /></span> minutes</span>} />
            <Trigger2 label="Tell the headquarters supervisors if it is still untaken after" hint="Once, by push, to the supervisors of this institution. Nobody else is told."
              value={draft.tellSupervisorsMinutes} disabled={disabled} onChange={v => set(s => { s.tellSupervisorsMinutes = v; })} />
          </Panel>
        </div>

        <div style={{ display: 'grid', gap: 12, position: 'sticky', top: 8 }}>
          <Panel title="What this comes to" note="Every kind of report, by how it will sound">
            {([3, 2, 1, 0] as const).map(level => (
              <div key={level} style={{ padding: '6px 0', borderTop: level === 3 ? 'none' : `1px solid ${T.line}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 5, background: TONE(level) }} />
                  <b style={{ fontSize: 12.5 }}>{ALARM_WORDS[level]}</b>
                  <Num color={T.subtle} size={12}>{summary[level].length}</Num>
                  <span style={{ flex: 1 }} />
                  {level > 0 ? <Btn size="xs" tone="ghost" onClick={() => testAlarm((level === 3 ? 1 : level === 2 ? 2 : 3) as 1 | 2 | 3)}>Hear it</Btn> : null}
                </div>
                <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.55, marginTop: 3 }}>
                  {summary[level].length === 0 ? <span style={{ color: T.subtle }}>None</span> : summary[level].map(x => x.words).join(' · ')}
                </div>
              </div>
            ))}
            <div style={{ fontSize: 11, color: T.subtle, marginTop: 8, lineHeight: 1.5 }}>Before the extra triggers: children, a crowd, an unrouted or escalated report and waiting can still make any of these louder, except what you set to silent.</div>
          </Panel>

          <Panel title="Save">
            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
              {view.updatedBy ? <>Last changed by <b style={{ color: T.text }}>{view.updatedBy}</b>{view.updatedAt ? ` on ${new Date(view.updatedAt).toISOString().slice(0, 10)}` : ''}. </> : null}
              Every desk of {view.scopeName} rings by these rules. Your own speaker is the switch at the top of the screen.
            </div>
            <Actions left={view.custom && canEdit ? <Btn size="sm" tone="ghost" disabled={busy} onClick={() => setConfirmReset(true)}>Back to the defaults</Btn> : undefined}>
              <Btn disabled={!dirty || busy} onClick={() => setDraft(clone(view.settings))}>Undo</Btn>
              <Btn tone="primary" disabled={!dirty || disabled} onClick={save}>{busy ? 'Saving…' : 'Save the rules'}</Btn>
            </Actions>
          </Panel>
        </div>
      </div>

      {confirmReset ? (
        <Modal title="Back to the defaults" onClose={() => setConfirmReset(false)}>
          <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>Every rule you set for {view.scopeName} is dropped. P1 and P2 sound the siren, P3 an urgent call, P4 a chime, and the extra triggers return to what they were.</div>
          <Actions><Btn onClick={() => setConfirmReset(false)}>Keep my rules</Btn><Btn tone="danger" disabled={busy} onClick={reset}>Reset</Btn></Actions>
        </Modal>
      ) : null}
      <Toasts toasts={toasts} />
    </div>
  );
}

function Line({ label, hint, control, test }: { label: string; hint?: string; control: ReactNode; test?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        {hint ? <div style={{ fontSize: 11, color: T.subtle, marginTop: 1, lineHeight: 1.45 }}>{hint}</div> : null}
      </div>
      {control}
      <span style={{ width: 54, textAlign: 'right' }}>{test ? <Btn size="xs" tone="ghost" onClick={test}>Hear it</Btn> : null}</span>
    </div>
  );
}

function Trigger2({ label, hint, value, disabled, onChange }: { label: string; hint?: string; value: number; disabled: boolean; onChange: (v: number) => void }) {
  const never = value < 0;
  return (
    <Line label={label} hint={hint}
      control={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {never ? null : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.muted }}><span style={{ width: 62 }}><Input type="number" disabled={disabled} value={String(value)} onChange={v => onChange(Math.max(1, Math.min(240, Math.round(Number(v) || 1))))} /></span> minutes</span>}
        <Segmented size="xs" value={never ? 0 : 1} options={[[0, 'Never'], [1, 'After']] as [number, string][]} onChange={v => { if (!disabled) onChange(v === 0 ? -1 : 10); }} />
      </span>} />
  );
}

function Trigger({ label, hint, value, disabled, onChange, extra }: { label: string; hint?: string; value: number; disabled: boolean; onChange: (v: number) => void; extra?: ReactNode }) {
  return (
    <Line label={label} hint={hint}
      control={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {extra}
        <Segmented size="xs" value={value} options={TRIGGER.map(([v, l]) => [v, l] as [number, string])} onChange={v => { if (!disabled) onChange(v); }} />
      </span>}
      test={value > 0 ? () => testAlarm((value === 3 ? 1 : value === 2 ? 2 : 3) as 1 | 2 | 3) : undefined} />
  );
}


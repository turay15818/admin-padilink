/**
 * The duty sheet.
 *
 * One column per day, one row per responder, each shift a bar with its hours — the paper
 * sheet pinned on a wall, which is what it replaces. A shift the responder is not on for
 * (rostered, but their switch says off) is drawn in the warning colour; one they confirmed
 * from their phone carries a tick. Supervisors write; dispatchers read.
 */
import { useEffect, useMemo, useState } from 'react';
import { RESPONDER_ROLE, RESPONDER_STATUS, commandApi, errorWords, type CommandFacilityOption, type ResponderRow, type RosterResponse, type ShiftRow } from '../api';
import { T } from '../theme';
import { Actions, Btn, Empty, ErrorLine, Field, Input, Modal, Panel, Select, Textarea, Toasts, useToasts } from '../ui';
import { useCommand } from '../useCommand';

const DAY_MS = 86_400_000;
const nextHour = () => { const d = new Date(); d.setUTCMinutes(0, 0, 0); d.setUTCHours(d.getUTCHours() + 1); return d; };
const startOfWeek = (d: Date) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; };
const hhmm = (iso: string) => new Date(iso).toISOString().slice(11, 16);
const dayWord = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function Roster() {
  const { tick, access, institutionId } = useCommand();
  const canWrite = access.role === 2 || access.national;
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [roster, setRoster] = useState<RosterResponse | null>(null);
  const [responders, setResponders] = useState<ResponderRow[]>([]);
  const [facilities, setFacilities] = useState<CommandFacilityOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ShiftRow | { at: Date; responderId?: string } | null>(null);
  const [removing, setRemoving] = useState<ShiftRow | null>(null);
  const [local, setLocal] = useState(0);
  const { toasts, push } = useToasts();

  useEffect(() => {
    const to = new Date(weekStart.getTime() + 7 * DAY_MS);
    commandApi.roster({ institutionId, from: weekStart.toISOString(), to: to.toISOString() }).then(r => { setRoster(r); setError(null); }).catch(caught => setError(errorWords(caught, 'Could not load the roster.')));
  }, [weekStart, tick, local, institutionId]);
  useEffect(() => {
    commandApi.responders(false, institutionId).then(r => setResponders(r.responders.filter(x => x.active))).catch(() => setResponders([]));
    commandApi.people(institutionId).then(p => setFacilities(p.facilities)).catch(() => setFacilities([]));
  }, [tick, institutionId]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS)), [weekStart]);
  const byPerson = useMemo(() => { const m = new Map<string, ShiftRow[]>(); for (const s of roster?.shifts ?? []) m.set(s.responderId, [...(m.get(s.responderId) ?? []), s]); return m; }, [roster]);
  const onDay = (list: ShiftRow[], day: Date) => list.filter(s => new Date(s.startsAt).getTime() < day.getTime() + DAY_MS && new Date(s.endsAt).getTime() > day.getTime());
  const thisWeek = startOfWeek(new Date()).getTime() === weekStart.getTime();
  const todayKey = new Date().toISOString().slice(0, 10);
  const hours = (roster?.shifts ?? []).reduce((sum, s) => sum + (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 3_600_000, 0);
  const unconfirmed = (roster?.shifts ?? []).filter(s => !s.confirmed && s.when !== 'past').length;

  const remove = (whole: boolean) => {
    if (!removing) return;
    commandApi.removeShift(removing.id, whole).then(() => { setRemoving(null); push('Removed.'); setLocal(n => n + 1); }).catch(caught => push(errorWords(caught, 'Could not remove it.'), 'error'));
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Panel flush title={<div style={{ display: 'flex', gap: 10, alignItems: 'center', textTransform: 'none', letterSpacing: 0, fontSize: 13, color: T.text }}>
        <Btn size="xs" tone="ghost" onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * DAY_MS))}>‹</Btn>
        <span style={{ fontWeight: 600, minWidth: 190, textAlign: 'center' }}>{dayWord(days[0])} – {dayWord(days[6])}{thisWeek ? <span style={{ color: T.accent }}> · this week</span> : null}</span>
        <Btn size="xs" tone="ghost" onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * DAY_MS))}>›</Btn>
        {!thisWeek ? <Btn size="xs" tone="ghost" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</Btn> : null}
      </div>} action={<div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 11.5, color: T.muted }}>
        {roster ? <><span><b className="cc-num" style={{ color: roster.rosteredNotOn > 0 ? T.warn : T.good }}>{roster.rosteredNow}</b> on now{roster.rosteredNotOn > 0 ? <span style={{ color: T.warn }}> · {roster.rosteredNotOn} not on</span> : null}</span><span><b className="cc-num">{roster.shifts.length}</b> shifts · <b className="cc-num">{Math.round(hours)}</b> h</span>{unconfirmed > 0 ? <span style={{ color: T.warn }}>{unconfirmed} unconfirmed</span> : null}</> : null}
        {canWrite && institutionId ? <Btn size="sm" tone="primary" onClick={() => setEditing({ at: nextHour() })}>Add shift</Btn> : null}
      </div>}>
        {error ? <div style={{ padding: 12 }}><ErrorLine>{error}</ErrorLine></div> : null}
        {responders.length === 0 ? <Empty>Nobody on the roll yet. Add responders under Fleet, then roster them.</Empty> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10.5, color: T.subtle, textTransform: 'uppercase', letterSpacing: 0.9, width: 170, fontWeight: 600 }}>Who</th>
                  {days.map(d => { const isToday = todayKey === d.toISOString().slice(0, 10); return <th key={d.toISOString()} style={{ padding: '8px 6px', fontSize: 10.5, fontWeight: 600, color: isToday ? T.accent : T.subtle, textTransform: 'uppercase', letterSpacing: 0.9, borderLeft: `1px solid ${T.line}`, background: isToday ? T.accentSoft : undefined }}>{dayWord(d)}</th>; })}
                </tr>
              </thead>
              <tbody>
                {responders.map(p => {
                  const mine = byPerson.get(p.id) ?? [];
                  const off = p.status === 1 || p.status === 8;
                  return (
                    <tr key={p.id} style={{ borderTop: `1px solid ${T.line}` }}>
                      <td style={{ padding: '7px 12px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600, fontSize: 12.5 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: off ? T.subtle : T.good }}>{RESPONDER_ROLE[p.role]} · {RESPONDER_STATUS[p.status]}</div>
                      </td>
                      {days.map(d => {
                        const here = onDay(mine, d);
                        const isToday = todayKey === d.toISOString().slice(0, 10);
                        return (
                          <td key={d.toISOString()} style={{ padding: 4, verticalAlign: 'top', borderLeft: `1px solid ${T.line}`, minWidth: 96, background: isToday ? 'rgba(34,211,238,.03)' : undefined }}>
                            <div style={{ display: 'grid', gap: 3 }}>
                              {here.map(s => {
                                const gap = s.when === 'now' && (s.responderStatus === 1 || s.responderStatus === 8);
                                const colour = s.when === 'past' ? T.subtle : gap ? T.warn : s.when === 'now' ? T.good : T.info;
                                return (
                                  <div key={s.id} role="button" tabIndex={0} onClick={() => canWrite && setEditing(s)} onKeyDown={e => { if (e.key === 'Enter' && canWrite) setEditing(s); }} title={`${s.label ?? 'Shift'} ${hhmm(s.startsAt)}–${hhmm(s.endsAt)}${s.facilityName ? ` · ${s.facilityName}` : ''}${gap ? ' · rostered but not on' : ''}${s.note ? `\n${s.note}` : ''}`}
                                    style={{ borderLeft: `3px solid ${colour}`, background: T.surface2, borderRadius: 5, padding: '3px 6px', fontSize: 11, cursor: canWrite ? 'pointer' : 'default', lineHeight: 1.3 }}>
                                    <div className="cc-num" style={{ fontWeight: 600, color: s.when === 'past' ? T.muted : T.text }}>{hhmm(s.startsAt)}–{hhmm(s.endsAt)}{s.confirmed ? <span style={{ color: T.good }}> ✓</span> : null}</div>
                                    <div style={{ color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label ?? ''}{gap ? <span style={{ color: T.warn }}> · not on</span> : ''}</div>
                                    {canWrite ? <button type="button" onClick={e => { e.stopPropagation(); setRemoving(s); }} style={{ fontSize: 10, border: 'none', background: 'transparent', color: T.subtle, cursor: 'pointer', padding: 0, marginTop: 1 }}>remove</button> : null}
                                  </div>
                                );
                              })}
                              {canWrite ? <button type="button" onClick={() => { const at = new Date(d); at.setUTCHours(8, 0, 0, 0); setEditing({ at, responderId: p.id }); }} style={{ fontSize: 11, border: `1px dashed ${T.line2}`, background: 'transparent', color: T.subtle, borderRadius: 5, padding: '2px 0', cursor: 'pointer' }}>+</button> : null}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {editing && institutionId ? <ShiftDialog seed={editing} institutionId={institutionId} responders={responders} facilities={facilities} onClose={() => setEditing(null)} onDone={() => { setEditing(null); push('Saved.'); setLocal(n => n + 1); }} /> : null}
      {removing ? (
        <Modal title={`Remove ${removing.responderName}'s shift`} onClose={() => setRemoving(null)} width={440}>
          <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>{dayWord(new Date(removing.startsAt))} {hhmm(removing.startsAt)}–{hhmm(removing.endsAt)}{removing.label ? ` · ${removing.label}` : ''}.{removing.seriesId ? ' It is one of a weekly series.' : ''}</div>
          <Actions>
            <Btn tone="ghost" onClick={() => setRemoving(null)}>Keep it</Btn>
            {removing.seriesId ? <Btn tone="danger" onClick={() => remove(true)}>This and every later one</Btn> : null}
            <Btn tone="danger" onClick={() => remove(false)}>Just this one</Btn>
          </Actions>
        </Modal>
      ) : null}
      <Toasts toasts={toasts} />
    </div>
  );
}

function ShiftDialog({ seed, institutionId, responders, facilities, onClose, onDone }: { seed: ShiftRow | { at: Date; responderId?: string }; institutionId: string; responders: ResponderRow[]; facilities: CommandFacilityOption[]; onClose: () => void; onDone: () => void }) {
  const existing = 'id' in seed ? seed : null;
  const seededResponder = existing ? responders.find(r => r.id === existing.responderId) : 'responderId' in seed && seed.responderId ? responders.find(r => r.id === seed.responderId) : undefined;
  const startAt = existing ? new Date(existing.startsAt) : 'at' in seed ? seed.at : nextHour();
  const endAt = existing ? new Date(existing.endsAt) : new Date(startAt.getTime() + 8 * 3_600_000);
  const [responderId, setResponderId] = useState(existing?.responderId ?? seededResponder?.id ?? '');
  const [facilityId, setFacilityId] = useState(existing?.facilityId ?? seededResponder?.facilityId ?? '');
  const [date, setDate] = useState(startAt.toISOString().slice(0, 10));
  const [start, setStart] = useState(startAt.toISOString().slice(11, 16));
  const [end, setEnd] = useState(endAt.toISOString().slice(11, 16));
  const [label, setLabel] = useState(existing?.label ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [repeat, setRepeat] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const startsAt = new Date(`${date}T${start}:00Z`);
    let endsAt = new Date(`${date}T${end}:00Z`);
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + DAY_MS);
    setBusy(true); setError(null);
    commandApi.saveShift({ id: existing?.id ?? null, institutionId, facilityId: facilityId || null, responderId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), label: label || null, note: note || null, repeatWeeks: existing ? 0 : Number(repeat) || 0 })
      .then(onDone).catch(caught => setError(errorWords(caught, 'That did not save.'))).finally(() => setBusy(false));
  };
  return (
    <Modal title={existing ? `Move ${existing.responderName}'s shift` : 'Add a shift'} onClose={onClose} width={520}>
      <Field label="Who"><Select value={responderId} disabled={!!existing} onChange={setResponderId}><option value="">Pick a responder</option>{responders.map(r => <option key={r.id} value={r.id}>{r.name} · {RESPONDER_ROLE[r.role]}</option>)}</Select></Field>
      <Field label="Station" hint="Where the shift is. Empty means the whole institution — a control room."><Select value={facilityId} onChange={setFacilityId}><option value="">Whole institution</option>{facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
      <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr 1fr' }}>
        <Field label="Date"><Input value={date} onChange={setDate} type="date" /></Field>
        <Field label="Starts"><Input value={start} onChange={setStart} type="time" /></Field>
        <Field label="Ends" hint="Earlier than the start means the next day."><Input value={end} onChange={setEnd} type="time" /></Field>
      </div>
      <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr' }}>
        <Field label="Label"><Input value={label} onChange={setLabel} placeholder="Night" /></Field>
        {!existing ? <Field label="Repeat weekly" hint="How many more weeks, up to 12. A week that clashes is skipped."><Input value={repeat} onChange={v => setRepeat(v.replace(/\D/g, ''))} mono /></Field> : null}
      </div>
      <Field label="Note"><Textarea value={note} onChange={setNote} rows={2} /></Field>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <Actions><Btn tone="ghost" onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={busy || !responderId} onClick={save}>{existing ? 'Move it' : 'Add the shift'}</Btn></Actions>
    </Modal>
  );
}

/**
 * More than one agency on a case.
 *
 * A police desk that finds a crash with people hurt hands nothing off by phone and hope: it
 * brings the Ministry of Health, the nearest hospital and the fire service onto the same
 * case, or hands the whole case to one of them. The lead agency keeps the case and closes
 * it; an agency brought in writes on it and sends its own people; an agency that was handed
 * the case becomes its lead and the sender follows. Every one of these writes a line on the
 * timeline with a name on it, and a push that carries a number and a severity — never a
 * place, never anything medical.
 *
 * Which buttons show is read from what the service sent (`canBringIn`, `canHandOver`,
 * `pendingReferralId`, `agencies[].mine / canWithdraw`); the service refuses the rest.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  REFERRAL_KIND, REFERRAL_STATUS, ROLE_ON_CASE, commandApi, errorWords,
  type AgencyOption, type AgencyRow, type AgencyTarget, type DeskIncident, type ReferralOutcome,
} from '../api';
import { T } from '../theme';
import { Actions, Btn, Check, Eyebrow, Field, Input, Modal, Pill, Select, Textarea, age, fmtDateTime } from '../ui';

const MAX_BROUGHT_IN = 8;

type Say = (message: string, tone?: 'ok' | 'error') => void;
type Open = 'bring' | 'hand' | 'accept' | 'decline' | 'withdraw' | null;

const statusTone = (status: number) => (status === 2 ? 'good' : status === 3 ? 'bad' : status === 1 ? 'warn' : 'neutral') as 'good' | 'bad' | 'warn' | 'neutral';

/** What this desk is on the case, and — when the case was sent to it — the question it has to answer. */
export function RoleBanner({ inc, busy, onAccept, onDecline }: { inc: DeskIncident; busy: boolean; onAccept: () => void; onDecline: () => void }) {
  const role = inc.myRole ?? inc.card.role ?? null;
  if (!role || role === 'lead' || role === 'national') return null;
  const waiting = !!inc.pendingReferralId;
  const row = waiting ? (inc.agencies ?? []).find(a => a.referralId === inc.pendingReferralId) : null;
  const words = waiting ? (row?.kind === 1 ? 'This case was handed to you' : 'You have been asked to help on this case') : ROLE_ON_CASE[role] ?? role;
  const hint = waiting
    ? (row?.kind === 1
      ? 'Accept and it becomes yours to lead. Decline and it goes back to the desk that sent it, with your reason.'
      : 'Accept and you can write on it and send your own people. Decline with a reason if it is not yours to help with.')
    : role === 'following' ? 'You handed this case on. You can read it as it moves; the desk that took it acts on it.'
    : role === 'brought-in' || role === 'helping' ? 'You can write notes and send your own people. The lead agency changes the stage, routes and closes.'
    : role === 'oversight' ? 'Read only, for oversight.' : '';
  const tone = waiting ? T.warn : T.accent;
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '9px 12px', marginBottom: 12, borderRadius: 9, border: `1px solid ${tone}55`, background: `${tone}14` }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{words}{row?.fromName ? <span style={{ color: T.muted, fontWeight: 400 }}> · from {row.fromName}</span> : null}</div>
        {hint ? <div style={{ fontSize: 12, color: T.muted, marginTop: 2, lineHeight: 1.45 }}>{hint}</div> : null}
        {row?.message ? <div style={{ fontSize: 12.5, marginTop: 5 }}>“{row.message}”</div> : null}
      </div>
      {waiting && inc.canAct !== false ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn tone="primary" disabled={busy} onClick={onAccept}>{row?.kind === 1 ? 'Take the case' : 'Accept'}</Btn>
          <Btn tone="danger" disabled={busy} onClick={onDecline}>Decline</Btn>
        </div>
      ) : null}
    </div>
  );
}

/** Pass on or bring in — the two ways a case reaches another agency. */
export function AgencyButtons({ inc, busy, onOpen }: { inc: DeskIncident; busy: boolean; onOpen: (which: 'bring' | 'hand') => void }) {
  if (!inc.canBringIn && !inc.canHandOver) return null;
  return (
    <>
      {inc.canBringIn ? <Btn size="sm" tone="accent" disabled={busy} title="Ask other agencies to help on this case — it stays with you" onClick={() => onOpen('bring')}>Bring in agencies</Btn> : null}
      {inc.canHandOver ? <Btn size="sm" disabled={busy} title="Give the case to another agency to lead" onClick={() => onOpen('hand')}>Hand over</Btn> : null}
    </>
  );
}

function sectorTone(code: string): string {
  const key = code.toLowerCase();
  return key.includes('health') ? '#34D399' : key.includes('fire') ? '#FB7185' : key.includes('police') || key.includes('security') ? '#60A5FA' : key.includes('disaster') || key.includes('nds') ? '#FBBF24' : T.accent;
}

/** Who else is on the case, and what each has said. */
export function AgenciesPanel({ rows, busy, onWithdraw, onAccept, onDecline }: { rows: AgencyRow[]; busy: boolean; onWithdraw: (row: AgencyRow) => void; onAccept: (row: AgencyRow) => void; onDecline: (row: AgencyRow) => void }) {
  if (rows.length === 0) return null;
  const live = rows.filter(r => r.status === 1 || r.status === 2).length;
  return (
    <div style={{ border: `1px solid ${T.line}`, borderRadius: 9, padding: '8px 12px', background: T.surface2 }}>
      <Eyebrow style={{ marginBottom: 5 }}>Agencies on this case · {live}</Eyebrow>
      {rows.map((r, index) => {
        const tone = sectorTone(r.sectorCode);
        const ended = r.status > 2;
        return (
          <div key={r.referralId} style={{ padding: '7px 0', borderTop: index === 0 ? 'none' : `1px solid ${T.line}`, opacity: ended ? 0.72 : 1 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: tone, flexShrink: 0 }} />
              <b>{r.shortName ?? r.institutionName}</b>
              {r.facilityName ? <span style={{ color: T.muted }}>· {r.facilityName}</span> : null}
              <Pill tone={statusTone(r.status)}>{r.status === 2 && r.kind === 1 ? 'Leads now' : REFERRAL_STATUS[r.status]}</Pill>
              <Pill>{REFERRAL_KIND[r.kind]}</Pill>
              {r.oversight ? <Pill tone="info">Oversight</Pill> : null}
              <span style={{ flex: 1 }} />
              <span className="cc-num" style={{ fontSize: 11, color: T.subtle }}>{r.status === 1 ? `waiting ${age(r.waitedMinutes)}` : r.status === 2 ? `answered in ${age(r.waitedMinutes)}` : fmtDateTime(r.endedAt ?? r.respondedAt ?? r.referredAt)}</span>
            </div>
            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>
              {r.sectorName}{r.referredBy ? ` · sent by ${r.referredBy}` : ''}{r.respondedBy ? ` · answered by ${r.respondedBy}` : ''}
            </div>
            {r.message ? <div style={{ fontSize: 12.5, marginTop: 3 }}>“{r.message}”</div> : null}
            {r.responseNote ? <div style={{ fontSize: 12.5, marginTop: 3, color: r.status === 3 ? T.bad : T.text }}>{r.status === 3 ? 'Declined: ' : 'Reply: '}{r.responseNote}</div> : null}
            {(r.mine && r.status === 1) || r.canWithdraw ? (
              <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
                {r.mine && r.status === 1 ? <><Btn size="xs" tone="primary" disabled={busy} onClick={() => onAccept(r)}>{r.kind === 1 ? 'Take the case' : 'Accept'}</Btn><Btn size="xs" tone="danger" disabled={busy} onClick={() => onDecline(r)}>Decline</Btn></> : null}
                {r.canWithdraw ? <Btn size="xs" disabled={busy} onClick={() => onWithdraw(r)}>{r.kind === 1 ? 'Take it back' : 'Withdraw'}</Btn> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- picking agencies ---------- */

function useDirectory(id: string) {
  const [options, setOptions] = useState<AgencyOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    commandApi.agencies(id).then(d => { if (live) { setOptions([...d.options]); setError(null); } })
      .catch(caught => { if (live) setError(errorWords(caught, 'Could not load the agencies.')); });
    return () => { live = false; };
  }, [id]);
  return { options, error };
}

const placeWords = (p: { name: string; distanceKm: number | null }) => `${p.name}${p.distanceKm != null ? ` · ${p.distanceKm} km` : ''}`;

function Directory({ options, error, query, setQuery, children }: { options: AgencyOption[] | null; error: string | null; query: string; setQuery: (v: string) => void; children: (list: AgencyOption[]) => ReactNode }) {
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = (options ?? []).filter(o => !q || `${o.name} ${o.shortName ?? ''} ${o.sectorName}`.toLowerCase().includes(q));
    return all.sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.sectorName.localeCompare(b.sectorName) || a.name.localeCompare(b.name));
  }, [options, query]);
  if (error) return <div style={{ color: T.bad, fontSize: 12.5 }}>{error}</div>;
  if (!options) return <div style={{ color: T.subtle, fontSize: 12.5 }}>Loading the agencies…</div>;
  return (
    <>
      <Field label="Find an agency"><Input value={query} onChange={setQuery} placeholder="Ministry of Health, hospital, fire, NDMA…" autoFocus /></Field>
      <div style={{ display: 'grid', gap: 5, maxHeight: '44vh', overflowY: 'auto', paddingRight: 2, marginBottom: 10 }}>
        {list.length === 0 ? <div style={{ fontSize: 12.5, color: T.muted }}>No agency matches that.</div> : children(list)}
      </div>
    </>
  );
}

function OptionCard({ option, selected, kind, onPick, children }: { option: AgencyOption; selected: boolean; kind: 'radio' | 'check'; onPick: () => void; children?: ReactNode }) {
  const disabled = option.alreadyIn;
  return (
    <div style={{ borderRadius: 8, border: `1px solid ${selected ? T.accent : T.line2}`, background: selected ? T.accentSoft : T.surface2, opacity: disabled ? 0.55 : 1 }}>
      <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '7px 10px', cursor: disabled ? 'default' : 'pointer', fontSize: 12.5 }}>
        <input type={kind === 'radio' ? 'radio' : 'checkbox'} checked={selected} disabled={disabled} onChange={onPick} style={{ accentColor: T.accent, marginTop: 2 }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: sectorTone(option.sectorCode) }} />
            <b>{option.name}</b>
            {option.suggested ? <Pill tone="accent">Suggested</Pill> : null}
            {option.oversight ? <Pill tone="info">Oversight</Pill> : null}
            {option.alreadyIn ? <Pill>Already on the case</Pill> : null}
          </span>
          <span style={{ display: 'block', fontSize: 11.5, color: T.muted, marginTop: 2 }}>{option.sectorName}{option.why ? ` · ${option.why}` : ''}</span>
        </span>
      </label>
      {selected && children ? <div style={{ padding: '0 10px 8px 34px' }}>{children}</div> : null}
    </div>
  );
}

function PlaceSelect({ option, value, onChange, none }: { option: AgencyOption; value: string; onChange: (v: string) => void; none: string }) {
  if (option.places.length === 0) return null;
  return (
    <Select value={value} onChange={onChange}>
      <option value="">{none}</option>
      {option.places.map(p => <option key={p.facilityId} value={p.facilityId}>{placeWords(p)}</option>)}
    </Select>
  );
}

/* ---------- dialogs ---------- */

export function BringInDialog({ id, busy, onClose, onSend }: { id: string; busy: boolean; onClose: () => void; onSend: (targets: AgencyTarget[], message: string) => void }) {
  const { options, error } = useDirectory(id);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const count = Object.keys(picked).length;
  const toggle = (o: AgencyOption) => setPicked(prev => {
    const next = { ...prev };
    if (o.institutionId in next) delete next[o.institutionId];
    else if (Object.keys(next).length < MAX_BROUGHT_IN) next[o.institutionId] = '';
    return next;
  });
  return (
    <Modal title="Bring in agencies" onClose={onClose} width={640}>
      <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5, marginBottom: 10 }}>They are added to this case and see it from now on. The case stays with you — you still lead it and close it. They can write on it and send their own people, or decline with a reason.</div>
      <Directory options={options} error={error} query={query} setQuery={setQuery}>
        {list => list.map(o => (
          <OptionCard key={o.institutionId} option={o} kind="check" selected={o.institutionId in picked} onPick={() => toggle(o)}>
            <PlaceSelect option={o} value={picked[o.institutionId] ?? ''} onChange={v => setPicked(prev => ({ ...prev, [o.institutionId]: v }))} none={o.places.length > 0 ? 'The agency as a whole — its own desk picks' : ''} />
          </OptionCard>
        ))}
      </Directory>
      <Field label="What you need from them" hint="They read this first. Say what is wrong and what you want — not who is hurt or where."><Textarea value={message} onChange={setMessage} rows={3} placeholder="Two vehicles, people trapped — need ambulances and a hospital ready." /></Field>
      <Actions left={<span style={{ fontSize: 11.5, color: T.subtle }}>{count === 0 ? 'Pick one or more' : `${count} of ${MAX_BROUGHT_IN} picked`}</span>}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn tone="primary" disabled={busy || count === 0} onClick={() => onSend(Object.entries(picked).map(([institutionId, facilityId]) => ({ institutionId, facilityId: facilityId || null })), message.trim())}>{busy ? 'Sending…' : count > 1 ? `Bring in ${count}` : 'Bring in'}</Btn>
      </Actions>
    </Modal>
  );
}

export function HandOverDialog({ id, busy, onClose, onSend }: { id: string; busy: boolean; onClose: () => void; onSend: (institutionId: string, facilityId: string | null, reason: string, stayInvolved: boolean) => void }) {
  const { options, error } = useDirectory(id);
  const [query, setQuery] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [reason, setReason] = useState('');
  const [stay, setStay] = useState(true);
  return (
    <Modal title="Hand the case over" onClose={onClose} width={640}>
      <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5, marginBottom: 10 }}>The agency you pick becomes the lead once it accepts. Until then the case stays visible to you. If it declines, or you take it back, it returns to your desk. Ministries are brought in, not handed a case.</div>
      <Directory options={options} error={error} query={query} setQuery={setQuery}>
        {list => list.filter(o => !o.oversight).map(o => (
          <OptionCard key={o.institutionId} option={o} kind="radio" selected={o.institutionId === institutionId} onPick={() => { setInstitutionId(o.institutionId); setFacilityId(''); }}>
            <PlaceSelect option={o} value={facilityId} onChange={setFacilityId} none="The agency as a whole — its own desk picks" />
          </OptionCard>
        ))}
      </Directory>
      <Field label="Why" hint="The receiving desk reads this first."><Textarea value={reason} onChange={setReason} rows={2} placeholder="Patients, no police matter left — ambulance and hospital should lead." /></Field>
      <Check checked={stay} onChange={setStay}>Stay on the case as a helping agency (otherwise you only follow it)</Check>
      <Actions>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn tone="primary" disabled={busy || !institutionId || !reason.trim()} onClick={() => onSend(institutionId, facilityId || null, reason.trim(), stay)}>{busy ? 'Handing over…' : 'Hand over'}</Btn>
      </Actions>
    </Modal>
  );
}

export function AnswerDialog({ accept, taken, busy, onClose, onSend }: { accept: boolean; taken: boolean; busy: boolean; onClose: () => void; onSend: (note: string) => void }) {
  const [note, setNote] = useState('');
  const title = accept ? (taken ? 'Take the case' : 'Accept') : 'Decline';
  return (
    <Modal title={title} onClose={onClose}>
      <Field label={accept ? 'Note (optional)' : 'Why'} hint={accept ? (taken ? 'It becomes yours to lead, acknowledge and close. The desk that sent it follows.' : 'You can write on this case and send your own people.') : 'The desk that asked reads this. If it was handed over, the case goes back to them.'}>
        <Textarea value={note} onChange={setNote} rows={3} />
      </Field>
      <Actions>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn tone={accept ? 'primary' : 'danger'} disabled={busy || (!accept && !note.trim())} onClick={() => onSend(note.trim())}>{busy ? 'Sending…' : title}</Btn>
      </Actions>
    </Modal>
  );
}

export function WithdrawDialog({ row, busy, onClose, onSend }: { row: AgencyRow; busy: boolean; onClose: () => void; onSend: (note: string) => void }) {
  const [note, setNote] = useState('');
  const handed = row.kind === 1;
  return (
    <Modal title={handed ? 'Take the case back' : 'Withdraw the request'} onClose={onClose}>
      <Field label="Note (optional)" hint={handed ? `${row.institutionName} is told, and the case returns to your desk.` : `${row.institutionName} is told and no longer sees the case.`}>
        <Textarea value={note} onChange={setNote} rows={2} />
      </Field>
      <Actions>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn tone="danger" disabled={busy} onClick={() => onSend(note.trim())}>{busy ? 'Working…' : handed ? 'Take it back' : 'Withdraw'}</Btn>
      </Actions>
    </Modal>
  );
}

/**
 * Everything above, wired. `Incident.tsx` drops this in once; it owns its own dialogs so the
 * big panel does not grow by a hundred lines.
 */
export function useAgencyActions(inc: DeskIncident, onChanged: (next: DeskIncident) => void, push: Say, goQueue: () => void) {
  const [open, setOpen] = useState<Open>(null);
  const [row, setRow] = useState<AgencyRow | null>(null);
  const [busy, setBusy] = useState(false);
  const id = inc.card.id;

  const finish = (outcome: ReferralOutcome) => {
    push(outcome.message);
    setOpen(null); setRow(null);
    if (outcome.incident) onChanged(outcome.incident); else goQueue();
  };
  const act = (work: Promise<ReferralOutcome>) => {
    setBusy(true);
    work.then(finish).catch(caught => push(errorWords(caught, 'That did not work.'), 'error')).finally(() => setBusy(false));
  };
  const pendingRow = (inc.agencies ?? []).find(a => a.referralId === inc.pendingReferralId) ?? null;

  const dialogs = (
    <>
      {open === 'bring' ? <BringInDialog id={id} busy={busy} onClose={() => setOpen(null)} onSend={(targets, message) => act(commandApi.bringIn(id, targets, message))} /> : null}
      {open === 'hand' ? <HandOverDialog id={id} busy={busy} onClose={() => setOpen(null)} onSend={(institutionId, facilityId, reason, stayInvolved) => act(commandApi.handOver({ id, institutionId, facilityId, reason, stayInvolved }))} /> : null}
      {open === 'accept' || open === 'decline' ? (
        <AnswerDialog accept={open === 'accept'} taken={(row ?? pendingRow)?.kind === 1} busy={busy} onClose={() => { setOpen(null); setRow(null); }}
          onSend={note => { const target = row ?? pendingRow; if (target) act(commandApi.answerReferral(id, target.referralId, open === 'accept', note)); }} />
      ) : null}
      {open === 'withdraw' && row ? <WithdrawDialog row={row} busy={busy} onClose={() => { setOpen(null); setRow(null); }} onSend={note => act(commandApi.withdrawReferral(id, row.referralId, note))} /> : null}
    </>
  );
  return {
    busy, dialogs, pendingRow,
    openBring: () => setOpen('bring'),
    openHand: () => setOpen('hand'),
    answer: (accept: boolean, target?: AgencyRow) => { setRow(target ?? null); setOpen(accept ? 'accept' : 'decline'); },
    withdraw: (target: AgencyRow) => { setRow(target); setOpen('withdraw'); },
  };
}

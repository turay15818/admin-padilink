/**
 * What the room does when something comes in.
 *
 * Pure rules, kept apart from the screen so they can be read and tested on their own: which
 * cards are new, how loud each one is, when the siren sounds again, what the tab title says.
 * The hub only ever says "something changed", so newness is decided here by comparing the
 * queue with what this desk has already seen — and the first load is never an alarm, because
 * a person who opens the console to a queue of forty open reports has not been "alerted" to
 * any of them.
 */
import type { QueueCard } from './api';

/**
 * critical — the siren, until somebody takes it. high — a banner and a two-tone call. new — a quiet chime.
 * Which a report gets is the institution's own setting; the API puts a number on every queue card
 * (0 silent · 1 chime · 2 urgent · 3 siren) and this file only obeys it. A card from an older API,
 * with no number, falls back to the severity table that used to be fixed.
 */
export type AlarmLevel = 'critical' | 'high' | 'new';

export type Alert = {
  id: string;
  number: string;
  severity: number;
  level: AlarmLevel;
  /** What it is, in the reporter's category words. Empty for a sensitive report: nothing about it is read out. */
  words: string;
  /** Where, as far as the card says. Empty for a sensitive report. */
  where: string;
  by: string | null;
  sensitive: boolean;
  raisedAt: number;
  /** True when it was a report already in the queue whose severity just went up. */
  raised: boolean;
  /** How many times the room has been sounded for it. */
  sounded: number;
  /** Why it is that loud, in the desk's own rules. Never names what happened on a sensitive report. */
  why: string | null;
};

export const levelOf = (severity: number): AlarmLevel => (severity <= 1 ? 'critical' : severity === 2 ? 'high' : 'new');

/** 0 silent · 1 chime · 2 urgent · 3 siren — the number on a card, or the old severity table when there is none. */
export const rankOf = (card: Pick<QueueCard, 'severity' | 'alarm'> & Partial<Pick<QueueCard, 'ageMinutes' | 'unowned'>>): number => {
  if (typeof card.alarm === 'number') return Math.max(0, Math.min(3, card.alarm));
  // An API that has not been updated sends no number. The table it used to be, plus the one rule that matters most:
  // a report nobody has taken for five minutes is a siren, whatever its severity.
  const base = card.severity <= 1 ? 3 : card.severity === 2 ? 2 : 1;
  return card.unowned && (card.ageMinutes ?? 0) >= 5 ? 3 : base;
};

/** True when the API has not sent the desk's rules (no card carries a number): the screen is on its built-in table. */
export const onBuiltInRules = (cards: Pick<QueueCard, 'alarm'>[]): boolean => cards.length > 0 && cards.every(c => typeof c.alarm !== 'number');

/**
 * What to sound the moment a desk opens its screen: a report that is already waiting for a person and is
 * urgent or worse. Opening the console to forty quiet reports is not an alarm, but opening it to a siren-level
 * report that nobody has taken is exactly what the alarm is for.
 */
export function waitingAtOpen(cards: QueueCard[], now: number): Alert[] {
  return cards
    .filter(c => !c.isTraining && rankOf(c) >= 2 && (c.role === 'asked' || c.unowned))
    .map(c => toAlert(c, now, false, c.alarmWhy ?? 'Waiting for a person when you opened the desk'));
}

export const levelOfRank = (rank: number): AlarmLevel => (rank >= 3 ? 'critical' : rank === 2 ? 'high' : 'new');

const titleCase = (slug: string) => slug.split('-').map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');

/** The place on a card: the community and the district, or whichever of them there is. */
export function whereOf(card: Pick<QueueCard, 'community' | 'landmark' | 'districtSlug'>): string {
  const bits = [card.community || card.landmark, card.districtSlug ? titleCase(card.districtSlug) : null].filter((x): x is string => !!x);
  return bits.join(', ');
}

export function toAlert(card: QueueCard, now: number, raised = false, why?: string): Alert {
  return {
    id: card.id, number: card.number, severity: card.severity, level: levelOfRank(rankOf(card)),
    words: card.isSensitive ? '' : card.situationWords,
    where: card.isSensitive ? '' : whereOf(card),
    by: card.isSensitive ? null : card.facilityName ?? card.institutionName,
    sensitive: card.isSensitive, raisedAt: now, raised, sounded: 0, why: why ?? card.alarmWhy ?? null,
  };
}

/**
 * Which cards should wake the room. A card is new when this desk has not seen its id before and its
 * rules say it makes a sound; a card already seen is raised again when it has become louder — a P3
 * upgraded to P1, or a quiet one nobody took for five minutes. A report set to silent never sounds.
 * Training reports never sound. `seen` holds each card's loudness and is updated in place so the
 * caller keeps one memory across loads.
 */
export function fresh(seen: Map<string, number>, cards: QueueCard[], now: number): Alert[] {
  const out: Alert[] = [];
  for (const card of cards) {
    const rank = rankOf(card);
    if (card.isTraining) { seen.set(card.id, rank); continue; }
    const before = seen.get(card.id);
    if (before === undefined) { if (rank > 0) out.push(toAlert(card, now)); }
    else if (rank > before) out.push(toAlert(card, now, true));
    seen.set(card.id, rank);
  }
  return out;
}

/**
 * Which alerts are still live: one goes when the report leaves the queue (resolved, closed,
 * moved), when the desk's rules now say silent, or — for a critical or high one — when somebody
 * on a desk has taken it, because the point of the alarm is to find a person for it. A desk that
 * was asked to join a case is waiting on its own answer, not on the lead's dispatcher. A quiet one
 * only goes when dismissed or old.
 */
export function stillLive(alerts: Alert[], cards: QueueCard[], now: number): Alert[] {
  const byId = new Map(cards.map(c => [c.id, c]));
  return alerts.filter(a => {
    const card = byId.get(a.id);
    if (!card) return false;
    if (typeof card.alarm === 'number' && card.alarm === 0) return false;
    if (a.level === 'new') return now - a.raisedAt < 12_000;
    return card.role === 'asked' ? true : card.unowned;
  });
}

/** The most urgent alert, newest first among equals. */
export function loudest(alerts: Alert[]): Alert | null {
  return [...alerts].sort((a, b) => a.severity - b.severity || b.raisedAt - a.raisedAt)[0] ?? null;
}

/**
 * When the room should sound next for an alert that nobody has taken. A critical one rings at
 * once, again after six seconds and then every six for the first minute, then every fifteen —
 * it never stops by itself, because a siren that gives up is a report that was missed. A high
 * one rings at once, then every thirty seconds, three times. A quiet one rings once.
 */
export function nextSoundAfterMs(level: AlarmLevel, sounded: number, ageMs: number): number | null {
  if (sounded === 0) return 0;
  if (level === 'critical') return ageMs < 60_000 ? 6_000 : 15_000;
  if (level === 'high') return sounded < 3 ? 30_000 : null;
  return null;
}

/** The tab title while something is waiting: it alternates, so a minimised window still blinks in the taskbar. */
export function titleFor(alerts: Alert[], phase: number, base: string): string {
  const top = loudest(alerts);
  if (!top) return base;
  if (phase % 2 === 1) return base;
  const word = top.level === 'critical' ? 'CRITICAL' : top.level === 'high' ? 'URGENT' : 'NEW';
  return alerts.length > 1 ? `(${alerts.length}) ${word} ${top.number}` : `${word} ${top.number}`;
}

/** What a desktop notification may say: the number, the level and the district. Never what happened, never who. */
export function notificationFor(alert: Alert): { title: string; body: string } {
  const level = alert.level === 'critical' ? 'Critical report' : alert.level === 'high' ? 'Urgent report' : 'New report';
  const district = alert.where.includes(',') ? alert.where.split(',').pop()!.trim() : '';
  return { title: `${level} ${alert.number}`, body: district ? `${district} — open the command centre.` : 'Open the command centre.' };
}

/** "0:42", "12:05": how long the room has been looking at it. */
export function waiting(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

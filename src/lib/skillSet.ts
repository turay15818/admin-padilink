/**
 * One kind of work, five ways of doing it — the picker's half of the rule.
 *
 * The server is the authority (SkillSetRules on the API): it refuses a set that spans
 * two categories or overruns the limit, whoever sends it. What lives here is the reason
 * nobody ever MEETS that refusal — a picker that cannot compose an illegal set, and that
 * says why in the moment somebody reaches for the sixth chip rather than after they hit
 * Save.
 *
 * Two rules, and they are one idea:
 *
 *   ONE CATEGORY. A person is a plumber or a cleaner. A profile standing under both
 *   Skilled workers and Casual workers tells a customer nothing, and it outranks the
 *   specialist in each of their searches. Organisations are exempt — a construction firm
 *   really does employ plumbers and sweepers — which is why the limit, not a flag, is
 *   what decides: only an individual carries the five.
 *
 *   FIVE SKILLS. Same reasoning. Eleven trades reads as none of them done well.
 *
 * Nothing here is a lock. Somebody changing trade clears their picks and starts again in
 * the new category, and `switchCategory` is that move made in one tap instead of five.
 */

export const INDIVIDUAL_SKILL_LIMIT = 5;

/** Anything with an id and the category it hangs under. */
export type PickedSkill = {id: string; categoryId: string};

export type ToggleResult =
  | {ok: true; ids: string[]}
  | {ok: false; message: string; blockedBy: 'limit' | 'category'; currentCategoryId: string};

/**
 * The category the current picks sit in, or null when nothing is picked.
 *
 * Never guesses: a selection somehow spanning two (a profile made before the rule, read
 * back into the picker) reports the first, because the rail has to highlight something —
 * the SAVE is what refuses, and it will.
 */
export function pickedCategoryId(selected: PickedSkill[]): string | null {
  return selected.length > 0 ? selected[0].categoryId : null;
}

/** True when the picks straddle categories — only possible for a grandfathered profile. */
export function spansCategories(selected: PickedSkill[]): boolean {
  return new Set(selected.map(skill => skill.categoryId)).size > 1;
}

export function tooManyMessage(limit: number): string {
  return limit === INDIVIDUAL_SKILL_LIMIT
    ? `That is your ${limit}. Remove one to swap it — a profile claiming more reads as somebody who does none of them well.`
    : `You can pick up to ${limit} skills for this account.`;
}

export function oneCategoryMessage(current: string, attempted: string): string {
  return `You are building a ${current} profile. Switch to ${attempted} to start again there — a customer looking for one of them cannot tell what you do if you claim both.`;
}

/**
 * Tap a chip. Removing is always allowed; adding is what the rules are about.
 *
 * `limit` decides whether the one-category rule applies at all, exactly as it does on
 * the server: an organisation's larger limit IS the exemption.
 */
export function toggleSkill(args: {
  skill: PickedSkill;
  selected: PickedSkill[];
  limit: number;
  categoryName: (categoryId: string) => string;
}): ToggleResult {
  const {skill, selected, limit} = args;

  if (selected.some(picked => picked.id === skill.id)) {
    return {ok: true, ids: selected.filter(picked => picked.id !== skill.id).map(picked => picked.id)};
  }

  const home = pickedCategoryId(selected);
  const individual = limit === INDIVIDUAL_SKILL_LIMIT;

  if (individual && home !== null && home !== skill.categoryId) {
    return {
      ok: false,
      blockedBy: 'category',
      currentCategoryId: home,
      message: oneCategoryMessage(args.categoryName(home), args.categoryName(skill.categoryId)),
    };
  }

  if (selected.length >= limit) {
    return {ok: false, blockedBy: 'limit', currentCategoryId: home ?? skill.categoryId, message: tooManyMessage(limit)};
  }

  return {ok: true, ids: [...selected.map(picked => picked.id), skill.id]};
}

/**
 * Change trade: drop everything and keep only what is already picked in the new
 * category — which is nothing, unless a grandfathered profile was straddling, in which
 * case this is the move that repairs it.
 */
export function switchCategory(selected: PickedSkill[], categoryId: string): string[] {
  return selected.filter(picked => picked.categoryId === categoryId).map(picked => picked.id);
}

/** What the counter under the heading says. */
export function pickerCounter(count: number, limit: number): string {
  return `${count} of ${limit} picked`;
}

/**
 * Whether a chip should be tappable. A picked chip always is — you can always take
 * something off — and everything else closes once the set is complete or belongs to
 * another shelf.
 */
export function chipEnabled(args: {skill: PickedSkill; selected: PickedSkill[]; limit: number}): boolean {
  const {skill, selected, limit} = args;
  if (selected.some(picked => picked.id === skill.id)) {
    return true;
  }

  const home = pickedCategoryId(selected);
  if (limit === INDIVIDUAL_SKILL_LIMIT && home !== null && home !== skill.categoryId) {
    return false;
  }

  return selected.length < limit;
}

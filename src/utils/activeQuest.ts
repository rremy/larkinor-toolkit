// Recognising the active royal quest the game names in its narration.
//
// A page printing `Aktuális küldetés: (39)` states outright what the pub
// matcher (`questOffer.ts`) can only infer from wording, so this is the
// cheapest and most reliable quest signal we have.
//
// Deliberately data-free: a royal quest's `Quest.id` *is* the number the game
// prints, and its title is the same string, so nothing here needs quests.json
// (~1.5MB) on an ordinary city page. Pure, like `questOffer` — no DOM, no GM_*.

/** Highest royal quest number in the committed set (`static/db/quests.json`). */
const MAX_ROYAL_QUEST = 45;

/**
 * Matched on the **raw** narration rather than a folded copy: the offsets are
 * what let both platforms wrap the phrase in a link, and folding would shift
 * them. Accent tolerance comes from character classes instead, so a source that
 * arrives unaccented still matches at the right position.
 */
const ACTIVE_QUEST_RE = /Aktu[aá]lis\s+k[uü]ldet[eé]s\s*:?\s*\(\s*(\d{1,2})\s*\)/i;

export interface ActiveQuestMention {
  /** `Quest.id` of the royal quest — the bare number as a string. */
  questId: string;
  /** Offset of the whole matched phrase in the narration. */
  index: number;
  length: number;
}

/**
 * The active royal quest a narration names, or null.
 *
 * The whole phrase is returned as the run to link, not just the digits: a
 * sentence-sized target is reachable on a phone, and two characters are not.
 *
 * Out-of-range numbers yield null rather than a best guess — see
 * `MAX_ROYAL_QUEST`.
 */
export function findActiveQuest(narration: string): ActiveQuestMention | null {
  const match = ACTIVE_QUEST_RE.exec(narration);
  if (!match || match.index === undefined) return null;

  const number = Number(match[1]);
  if (!Number.isInteger(number) || number < 1 || number > MAX_ROYAL_QUEST) return null;

  return { questId: String(number), index: match.index, length: match[0].length };
}

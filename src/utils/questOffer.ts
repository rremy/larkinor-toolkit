// Recognising a tavern quest from the pub's narration.
//
// The game hands you a quest by printing its brief inside the Kocsma page's
// narration, wrapped in the barman's flavour text. That brief is the same
// text the fan site publishes as the quest's description, so a quest the
// player has just accepted can be identified and pre-selected in the database
// — see `matchTavernQuest`.
//
// Pure on purpose: no DOM, no GM_*, no data fetching. The boot modules supply
// the narration and the quest list, which keeps this unit-testable against
// the real captured note and the whole committed corpus.

import type { Quest } from '@/shared/data';

/**
 * Accent-folded, punctuation-free form used for every comparison here.
 *
 * The game's own text and the scraped descriptions disagree on Hungarian
 * diacritics often enough that comparing them literally is brittle, and the
 * narration arrives with different line breaking than the source page.
 */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Words long enough to carry signal; short Hungarian function words do not. */
function significantWords(folded: string): Set<string> {
  return new Set(folded.split(' ').filter((w) => w.length >= 5));
}

/**
 * The maze dimensions a quest note prints near its end, e.g. `(10x10, 26- )`
 * or `(8x8) (25-27 szintre)`.
 *
 * **The source writes these as width×height — the transpose of our
 * `rows`×`cols`.** Measured across the 13 committed descriptions that carry a
 * hint: 5 non-square ones match only when transposed, 0 match as
 * `rows`×`cols`, and 7 are square and so prove nothing. Hence `cols` first.
 *
 * Returns null when the note carries no dimensions — that is the common case
 * (24 of 37 descriptions omit them) and must not block a match.
 */
export function parseGridHint(narration: string): { cols: number; rows: number } | null {
  const m = /\(\s*(\d{1,2})\s*x\s*(\d{1,2})\s*[,)]/i.exec(narration);
  if (!m) return null;
  return { cols: Number(m[1]), rows: Number(m[2]) };
}

/**
 * Whether a stated size is consistent with a quest's real grid.
 *
 * Accepts either orientation. The source's convention is width×height, but
 * square mazes cannot distinguish the two and the fan site is hand-maintained,
 * so insisting on one orientation buys precision we cannot rely on.
 */
function hintAgrees(hint: { cols: number; rows: number }, quest: Quest): boolean {
  return (
    (hint.rows === quest.rows && hint.cols === quest.cols) ||
    (hint.rows === quest.cols && hint.cols === quest.rows)
  );
}

/** How many leading characters of a folded description must appear verbatim. */
const SIGNATURE_LENGTH = 60;
/** Minimum share of a description's significant words for the fallback. */
const MIN_OVERLAP = 0.6;
/** How far ahead of the runner-up the fallback's winner must be. */
const MARGIN = 2;

export interface QuestOfferMatch {
  quest: Quest;
  /** Share of the description's significant words present in the narration. */
  score: number;
  /** Which rule fired — `signature` is the precise one, `overlap` the fallback. */
  method: 'signature' | 'overlap';
}

/**
 * Identify the tavern quest a pub narration is offering, or null.
 *
 * Two rules, in order of precision:
 *
 * 1. **Signature** — the narration contains the description's opening
 *    verbatim (after folding). The game embeds the brief unchanged, so this
 *    is the normal path and it effectively cannot false-positive.
 * 2. **Overlap** — the share of the description's significant words present
 *    in the narration, requiring both a high absolute share and a clear lead
 *    over the runner-up. This covers a brief the game has lightly reworded.
 *
 * A grid hint in the narration vetoes an **overlap** match it contradicts,
 * but never a signature match. The asymmetry is measured, not stylistic: the
 * source's own stated sizes are unreliable — of the 13 descriptions carrying
 * one, 6 disagree with the maze actually drawn (5 by transposition, and
 * `ki_vagyok_ne_erdekeljen` states 10x10 for a 9x10 grid). A description
 * embedded verbatim is conclusive; a stated size is not, so it only hardens
 * the fuzzy path.
 *
 * Returning null is the safe outcome and the common one — an ordinary pub
 * visit offers no quest, and callers must not disturb the player's current
 * selection on a null.
 */
export function matchTavernQuest(narration: string, quests: readonly Quest[]): QuestOfferMatch | null {
  const foldedNarration = fold(narration);
  if (!foldedNarration || quests.length === 0) return null;

  const narrationWords = significantWords(foldedNarration);

  let best: QuestOfferMatch | null = null;
  let runnerUpScore = 0;

  for (const quest of quests) {
    const foldedDescription = fold(quest.description);
    if (!foldedDescription) continue;

    const descriptionWords = significantWords(foldedDescription);
    if (descriptionWords.size === 0) continue;

    let hits = 0;
    for (const word of descriptionWords) if (narrationWords.has(word)) hits += 1;
    const score = hits / descriptionWords.size;

    const signature = foldedDescription.slice(0, SIGNATURE_LENGTH);
    const isSignatureHit = signature.length > 0 && foldedNarration.includes(signature);

    // A signature hit outranks any overlap score; among signature hits (or
    // among overlap candidates) the higher share wins.
    const outranksBest =
      best === null ||
      (isSignatureHit && best.method === 'overlap') ||
      ((isSignatureHit || best.method === 'overlap') && score > best.score);

    if (outranksBest) {
      if (best) runnerUpScore = Math.max(runnerUpScore, best.score);
      best = { quest, score, method: isSignatureHit ? 'signature' : 'overlap' };
    } else {
      runnerUpScore = Math.max(runnerUpScore, score);
    }
  }

  if (!best) return null;

  if (best.method === 'overlap') {
    if (best.score < MIN_OVERLAP) return null;
    if (best.score < runnerUpScore * MARGIN) return null;
    // Dimensions veto the fuzzy path only — see the doc comment above.
    const hint = parseGridHint(narration);
    if (hint && !hintAgrees(hint, best.quest)) return null;
  }

  return best;
}

// Which keys the player holds inside one quest maze, as the set of locks whose
// doors the maze hides.
//
// Free of DOM, GM_* and `src/utils/**` imports, like `questCleared.ts`: the
// writers are the userscript's boot (a killed key monster) and the quests tab
// (the legend's eye, the cleared toggle, the reset), while the reader ships in
// the GM-free standalone bundle.

import type { LockType, QuestCell } from '@/shared/data';

/** Every lock this build knows; anything else in a stored value is dropped. */
const LOCKS: ReadonlySet<string> = new Set<LockType>([
  'vas', 'rez', 'bronz', 'ezust', 'arany', 'platina', 'tolvaj', 'cso', 'varazs',
]);

/** Every key a cell yields — `key`, then any `extraKeys`. */
export function cellKeys(cell: QuestCell): LockType[] {
  return cell.key ? [cell.key, ...(cell.extraKeys ?? [])] : [];
}

/**
 * The keys a cleared cell proves the player picked up: those of a cell whose
 * monster was killed, since the kill is what hands the key over.
 *
 * A question tile's key is left out — a cleared question only says it was
 * answered, not that the answer was the one that pays out — and so is a tile
 * holding both a monster and a question, where the data cannot say which of
 * the two gives the key. Leaving a door drawn costs nothing; hiding one the
 * player cannot open sends them the wrong way.
 */
export function killKeys(cell: QuestCell): LockType[] {
  return cell.monsterId != null && !cell.hasQuestion ? cellKeys(cell) : [];
}

/** Serialise a hidden-locks set for `questHiddenLocksKey`; sorted, so stable. */
export function serialiseHiddenLocks(locks: ReadonlySet<LockType>): string {
  return JSON.stringify([...locks].sort());
}

/**
 * Parse a stored hidden-locks set. Anything unreadable, and any entry that is
 * not a lock this build knows, is dropped: the cost is a door shown again,
 * never one hidden that should not be.
 */
export function parseHiddenLocks(raw: string | null): Set<LockType> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter(
      (lock): lock is LockType => typeof lock === 'string' && LOCKS.has(lock),
    ));
  } catch {
    return new Set();
  }
}

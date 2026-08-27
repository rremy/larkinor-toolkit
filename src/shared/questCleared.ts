// Which cells of a quest maze the player is done with — a monster killed, a
// question answered, a trap sprung.
//
// Free of DOM, GM_* and `src/utils/**` imports for the same reason as
// `questPosition.ts` and `loadout.ts`: the writers are the userscript's boot
// and the quests tab, while the reader ships in the GM-free standalone bundle.
// This module is only the shape they agree on.
//
// Unlike a `QuestPosition` — an observation about the page currently open —
// this is *progress*, and it is long-lived. So an unreadable value degrades to
// an empty set rather than being treated as a reason to stop: the worst case is
// a player re-marking a few cells, and the best case of strictness would be
// silently refusing to record anything.

/** Wire-format version. Bumped only if the shape changes. */
const VERSION = 1;

/** `row,col`, the same key `questMeta.cellKey` builds. */
const CELL_KEY_RE = /^\d+,\d+$/;

/**
 * Serialise a cleared set. Sorted, so an unchanged set always produces the same
 * string and a no-op write never churns the store.
 */
export function serialiseCleared(cells: ReadonlySet<string>): string {
  return JSON.stringify({ version: VERSION, cells: [...cells].sort() });
}

/** Parse a stored cleared set, or an empty set when there is nothing usable. */
export function parseCleared(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; cells?: unknown };
    if (parsed?.version !== VERSION || !Array.isArray(parsed.cells)) return new Set();
    return new Set(parsed.cells.filter(
      (key): key is string => typeof key === 'string' && CELL_KEY_RE.test(key),
    ));
  } catch {
    return new Set();
  }
}

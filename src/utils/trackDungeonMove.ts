// Noticing that the player has walked somewhere.
//
// A dungeon page never states a coordinate, but the step taken to reach it is
// observable: every movement path in the toolkit — the player's own click, the
// mobile NavPad, the desktop keyboard shortcuts — ends in a `.click()` on one
// of the game's own direction controls. A capture-phase listener there sees all
// of them without knowing about any of them.
//
// Two properties make this safe:
//
// - **It cannot race the detection.** The listener is attached at boot, long
//   before the async quest-data load resolves, and it stores only a direction:
//   the cell it came from is read on the *next* page load, from the position
//   pref that is still standing.
// - **It is armed only on dungeon pages**, so a step taken in the city can
//   never be replayed against a maze.

import type { Side } from '@/shared/data';
import { QUEST_MOVE_PREF_KEY, type ReadPref, type WritePref } from '@/shared/prefKeys';
import { dungeonDirectionInputs } from './domExtract';

const SIDES: readonly Side[] = ['N', 'E', 'S', 'W'];

/**
 * Start recording the player's steps on this dungeon page.
 *
 * Capture phase, so the write lands before the game's own inline handler
 * submits the form and navigates away. Failures are swallowed: a lost step
 * costs a marker, never the move.
 */
export function armDungeonMoveTracking(doc: Document, writePref: WritePref): void {
  for (const { side, input } of dungeonDirectionInputs(doc)) {
    input.addEventListener('click', () => {
      try {
        writePref(QUEST_MOVE_PREF_KEY, side);
      } catch (err) {
        console.warn('[Larkinor UI] Dungeon move: could not store the step:', err);
      }
    }, true);
  }
}

/**
 * Read the pending step and clear it in the same breath.
 *
 * Clearing on read is what keeps a phantom step from being replayed: resting,
 * answering a question, fighting and a move the game refused all produce a new
 * page without a step, and any of them would otherwise inherit the last one.
 */
export function takePendingMove(readPref: ReadPref, writePref: WritePref): Side | null {
  let raw: string | null = null;
  try {
    raw = readPref(QUEST_MOVE_PREF_KEY);
    if (raw) writePref(QUEST_MOVE_PREF_KEY, '');
  } catch (err) {
    console.warn('[Larkinor UI] Dungeon move: could not read the step:', err);
    return null;
  }
  return SIDES.includes(raw as Side) ? (raw as Side) : null;
}

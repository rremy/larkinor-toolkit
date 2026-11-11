// Working out where the player is in the archipelago from one page.
//
// The sea never names its square, so the position is carried from page to
// page: a city tile or a harbour picture states it outright, leaving a harbour
// puts the ship beside it, and every step sailed or walked moves it one square.
// Thord-Artin's tiles (and island pictures learned earlier) pin it again.
//
// Every result is checked against what the page draws around the player. A
// contradiction clears the position rather than guessing a better one: a
// marker on the wrong square is worse than none, because the player steers by
// it. See docs/superpowers/specs/2026-11-11-sea-and-island-maps-design.md.

import type { Side } from '@/shared/data';
import { contradicts, harbourById, STEP, SIDES, type ChartIndex } from '@/shared/seaChart';
import type { SeaPosition, SeaPositionSource } from '@/shared/seaPosition';
import { pinnedSquare, type LearnedTiles } from '@/shared/learnedTiles';
import type { SeaPageObservation } from './seaExtract';

/** What the current page says, already sorted by kind. */
export type SeaPageInput =
  | { kind: 'city'; row: number; col: number }
  | { kind: 'harbour'; harbourId: string | null }
  | { kind: 'battle'; sailed: boolean }
  | { kind: 'observed'; observation: SeaPageObservation }
  | { kind: 'other' };

export interface SeaResolution {
  /** The position to store; null with `lost` clears it. */
  position: SeaPosition | null;
  /** The position could not be kept: the window says so. */
  lost: boolean;
  /** An island picture to remember against its square. */
  learn: { image: string; row: number; col: number } | null;
  /** Leave the stored value exactly as it is. */
  keep: boolean;
}

const KEEP: SeaResolution = { position: null, lost: false, learn: null, keep: true };
const LOST: SeaResolution = { position: null, lost: true, learn: null, keep: false };

const make = (row: number, col: number, source: SeaPositionSource, now: number): SeaPosition => ({ row, col, source, at: now });

function stored(position: SeaPosition, learn: SeaResolution['learn'] = null): SeaResolution {
  return { position, lost: false, learn, keep: false };
}

/** The ship's square on a departure page: beside the harbour, opposite the side that shows it. */
function departureSquare(
  prev: SeaPosition | null,
  obs: SeaPageObservation,
  index: ChartIndex,
): { row: number; col: number } | null {
  const harbourSides = SIDES.filter((s) => obs.sides[s] === 'harbour');
  const fits = (row: number, col: number) =>
    index.squareAt(row, col) === null && !contradicts(index, row, col, 'sea', obs.sides);
  if (prev && index.squareAt(prev.row, prev.col)?.harbour) {
    for (const side of harbourSides) {
      const row = prev.row - STEP[side].row;
      const col = prev.col - STEP[side].col;
      if (fits(row, col)) return { row, col };
    }
  }
  const candidates = new Map<string, { row: number; col: number }>();
  for (const harbour of index.harbours) {
    for (const side of harbourSides) {
      const row = harbour.row - STEP[side].row;
      const col = harbour.col - STEP[side].col;
      if (fits(row, col)) candidates.set(`${row},${col}`, { row, col });
    }
  }
  return candidates.size === 1 ? [...candidates.values()][0] : null;
}

/** Whether a square can hold the player: open sea for a ship, land on an island. */
function plausible(index: ChartIndex, row: number, col: number, place: 'sea' | 'island'): boolean {
  if (!index.contains(row, col)) return true;
  const square = index.squareAt(row, col);
  if (square?.kind === 'unknown') return true;
  return place === 'sea' ? square === null : square !== null;
}

export function resolveSeaPosition(
  prev: SeaPosition | null,
  step: Side | null,
  page: SeaPageInput,
  index: ChartIndex | null,
  learned: LearnedTiles,
  now: number,
): SeaResolution {
  switch (page.kind) {
    case 'other':
      return KEEP;
    case 'city':
      return stored(make(page.row, page.col, 'city', now));
    case 'harbour': {
      if (!index || !page.harbourId) return KEEP;
      const harbour = harbourById(index, page.harbourId);
      return harbour ? stored(make(harbour.row, harbour.col, 'harbour', now)) : KEEP;
    }
    case 'battle':
      // The fight is in the square sailed into; the next sea page checks it.
      if (!page.sailed || !step || !prev) return KEEP;
      return stored(make(prev.row + STEP[step].row, prev.col + STEP[step].col, 'move', now));
    case 'observed':
      break;
  }
  if (!index) return KEEP;
  const obs = page.observation;
  if (obs.place === 'other') return KEEP;

  let next: SeaPosition | null = null;
  let learnable = false;
  const seeded = obs.islandImage ? index.tileByImage(obs.islandImage) : null;
  const pinned = seeded ?? (obs.islandImage ? pinnedSquare(learned, obs.islandImage) : null);

  if (obs.place === 'island' && pinned) {
    next = make(pinned.row, pinned.col, 'tile', now);
  } else if (obs.place === 'sea' && obs.departed) {
    const square = departureSquare(prev, obs, index);
    if (!square) return LOST;
    next = make(square.row, square.col, 'departure', now);
  } else if (prev && step && (obs.place === 'island' || obs.sailed)) {
    next = make(prev.row + STEP[step].row, prev.col + STEP[step].col, 'move', now);
    learnable = obs.place === 'island' && !seeded && obs.islandImage !== null;
  } else if (prev) {
    next = prev;
  } else {
    return KEEP;
  }

  if (!plausible(index, next.row, next.col, obs.place) || contradicts(index, next.row, next.col, obs.place, obs.sides)) {
    return LOST;
  }
  const learn = learnable && obs.islandImage ? { image: obs.islandImage, row: next.row, col: next.col } : null;
  return stored(next, learn);
}

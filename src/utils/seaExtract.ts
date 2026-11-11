// Reading what a page says about the archipelago: the sea, an island, a harbour.
//
// Measured live on 2026-11-11 (see
// docs/superpowers/specs/2026-11-11-sea-and-island-maps-design.md):
//
// - A sea page is a free-move page drawing `/tajk/hajotengeren.gif` on every
//   square; it never names the square. Its four sides are always described:
//   `<dir> hajózol - tenger` (open sea), `<dir> hajózol - kikötő` (a harbour,
//   which docks) and a `szarazfold.gif` image `<dir> szárazföld` (coast).
// - An island page draws its tile as `/tajk/<dir>/<name>.gif`: Thord-Artin as
//   `nagysziget/szig_<c>-<r>`, the small western island as `szighar/…` and
//   `szigmag/…`. Its sides are `<dir> nyomulsz - <district>` and the coast
//   blocker `<dir> tengerpart`.
// - **The direction words follow vowel harmony**: `északra`, `nyugatra`, but
//   `délre`, `keletre`. A pattern accepting only `-ra` misses south and east.
// - A step at sea prints `Tovább hajózol...` first; leaving a harbour prints
//   `Elindulsz a hajóddal egy távoli helyre...`. A sea monster's battle page
//   opens with the same `Tovább hajózol...`.
// - A harbour building is named after its grid square:
//   `/2/epulet/<row><col>kikoto.gif`, row and col written one after the other.

import type { Side } from '@/shared/data';
import type { SeaSide } from '@/shared/seaChart';
import { extractNarration } from './domExtract';

export type { SeaSide };

export interface SeaPageObservation {
  place: 'sea' | 'island' | 'other';
  sides: Partial<Record<Side, SeaSide>>;
  /** The island tile's picture below `/tajk/`, without `.gif`; null off an island. */
  islandImage: string | null;
  /** The narration says the ship has just left a harbour. */
  departed: boolean;
  /** The narration's first line says a step was sailed. */
  sailed: boolean;
}

const SIDE_BY_WORD: Record<string, Side> = { 'észak': 'N', 'dél': 'S', 'kelet': 'E', 'nyugat': 'W' };

/** `<dir>r[ae] [hajózol - |nyomulsz - ]<rest>`, the title every side control carries. */
const SIDE_TITLE = /^(észak|dél|kelet|nyugat)r[ae] (.*)$/;

/** The toolkit's own UI, never part of the game page. */
const OWN_UI = '#lc-root, #lc-dock-root, .lc-db';

/** The island picture directories: `szig…` and Thord-Artin's `nagysziget`. */
const ISLAND_PICTURE = /\/tajk\/((?:szig[^/]*|nagysziget)\/[^/?#]+)\.gif/;
const SEA_PICTURE = /\/tajk\/hajotengeren\.gif/;
// The column may be negative too: the harbour at (−20, −3) is `-20-3kikoto.gif`.
const HARBOUR_PICTURE = /\/2\/epulet\/(-?\d+(?:-\d+)?)kikoto\.gif/;

function isOwn(el: Element): boolean {
  return el.closest(OWN_UI) !== null;
}

function sideKind(rest: string, isInput: boolean): SeaSide | null {
  if (rest.startsWith('hajózol - kikötő')) return 'harbour';
  if (rest.startsWith('hajózol')) return 'sea';
  if (rest.startsWith('nyomulsz')) return 'walk';
  if (!isInput && rest.startsWith('szárazföld')) return 'land';
  if (!isInput && rest.startsWith('tengerpart')) return 'coast';
  return null;
}

/** What this page says about the sea or the island the player is on. */
export function readSeaPage(doc: Document): SeaPageObservation {
  let place: SeaPageObservation['place'] = 'other';
  let islandImage: string | null = null;
  for (const img of doc.querySelectorAll('img[src*="/tajk/"]')) {
    if (isOwn(img)) continue;
    const src = img.getAttribute('src') ?? '';
    if (SEA_PICTURE.test(src)) { place = 'sea'; break; }
    const island = ISLAND_PICTURE.exec(src);
    if (island) { place = 'island'; islandImage = island[1]; break; }
  }

  const sides: Partial<Record<Side, SeaSide>> = {};
  for (const el of doc.querySelectorAll('input[type="image"][title], img[title]')) {
    if (isOwn(el)) continue;
    const m = SIDE_TITLE.exec(el.getAttribute('title') ?? '');
    if (!m) continue;
    const kind = sideKind(m[2], el.tagName === 'INPUT');
    if (kind) sides[SIDE_BY_WORD[m[1]]] = kind;
  }

  const narration = extractNarration(doc);
  const firstLine = narration.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  return {
    place,
    sides,
    islandImage,
    departed: /Elindulsz a hajóddal/.test(narration),
    sailed: firstLine.startsWith('Tovább hajózol'),
  };
}

/** The harbour building's grid id (`-2224`), from its picture; null elsewhere. */
export function readHarbourPicture(doc: Document): string | null {
  for (const img of doc.querySelectorAll('img[src*="kikoto.gif"]')) {
    if (isOwn(img)) continue;
    const m = HARBOUR_PICTURE.exec(img.getAttribute('src') ?? '');
    if (m) return m[1];
  }
  return null;
}

/**
 * The game's own controls that move the player on a sea or island page —
 * sailing (the harbour included, since docking is a step too) and walking.
 */
export function seaDirectionInputs(doc: Document): { side: Side; input: Element }[] {
  const found: { side: Side; input: Element }[] = [];
  for (const input of doc.querySelectorAll('input[type="image"][title]')) {
    if (isOwn(input)) continue;
    const m = SIDE_TITLE.exec(input.getAttribute('title') ?? '');
    if (m && /^(hajózol|nyomulsz)\b/.test(m[2])) found.push({ side: SIDE_BY_WORD[m[1]], input });
  }
  return found;
}

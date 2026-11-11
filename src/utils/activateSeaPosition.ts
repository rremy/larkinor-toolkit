// Keeping the player's archipelago position current, from every page.
//
// Called by both boots before anything renders, so a sea window or a database
// already open on the chart reads this page's square rather than the last one.
// The city tile and the harbour picture state the square outright; everything
// else is carried by `resolveSeaPosition` (src/utils/seaTracking.ts).
//
// Steps are recorded like the labyrinth's (src/utils/trackDungeonMove.ts): a
// capture-phase listener on the game's own direction controls sees every way
// the toolkit or the player moves, and the next page takes and clears the step,
// so a step that led nowhere — a building, a refused move — is never replayed.

import type { DataLoader, Side } from '@/shared/data';
import {
  SEA_LEARNED_TILES_PREF_KEY, SEA_MOVE_PREF_KEY, SEA_POSITION_PREF_KEY,
  type ReadPref, type WritePref,
} from '@/shared/prefKeys';
import { indexChart, type ChartIndex } from '@/shared/seaChart';
import { parseSeaPosition, serializeSeaPosition, type SeaPosition } from '@/shared/seaPosition';
import { parseLearnedTiles, recordTile, serializeLearnedTiles } from '@/shared/learnedTiles';
import { parseMapPosition } from '@/shared/mapPosition';
import { parseId } from '@/database/map/mapMeta';
import { PageType } from './pageDetector';
import { readHarbourPicture, readSeaPage, seaDirectionInputs } from './seaExtract';
import { resolveSeaPosition, type SeaPageInput } from './seaTracking';

const SIDES: readonly Side[] = ['N', 'E', 'S', 'W'];

/** A city tile picture: `…/tajk/<id>.gif`, no sub-directory. */
const CITY_TILE = /\/tajk\/([^/?#]+)\.gif/;

/** Whether this page is at sea or on an island other than the city's. */
export function isSeaOrIsland(doc: Document): boolean {
  return readSeaPage(doc).place !== 'other';
}

/** Record the direction of every step clicked on this sea or island page. */
export function armSeaMoveTracking(doc: Document, writePref: WritePref): void {
  for (const { side, input } of seaDirectionInputs(doc)) {
    input.addEventListener('click', () => {
      try {
        writePref(SEA_MOVE_PREF_KEY, side);
      } catch (err) {
        console.warn('[Larkinor UI] Sea move: could not store the step:', err);
      }
    }, true);
  }
}

function takeStep(readPref: ReadPref, writePref: WritePref): Side | null {
  const raw = readPref(SEA_MOVE_PREF_KEY);
  if (raw) writePref(SEA_MOVE_PREF_KEY, '');
  return SIDES.includes(raw as Side) ? (raw as Side) : null;
}

function cityTile(doc: Document): { row: number; col: number } | null {
  for (const img of doc.querySelectorAll('img[src*="/tajk/"]')) {
    if (img.closest('#lc-root, #lc-dock-root, .lc-db')) continue;
    const id = parseMapPosition(CITY_TILE.exec(img.getAttribute('src') ?? '')?.[1] ?? null);
    const pos = id ? parseId(id) : null;
    if (pos) return pos;
  }
  return null;
}

function pageInput(pageType: PageType, doc: Document): SeaPageInput {
  if (pageType === PageType.Harbour) return { kind: 'harbour', harbourId: readHarbourPicture(doc) };
  if (pageType === PageType.Battle) return { kind: 'battle', sailed: readSeaPage(doc).sailed };
  if (pageType !== PageType.FreeMove) return { kind: 'other' };
  const observation = readSeaPage(doc);
  if (observation.place !== 'other') return { kind: 'observed', observation };
  const city = cityTile(doc);
  return city ? { kind: 'city', ...city } : { kind: 'other' };
}

async function loadIndex(loader: DataLoader): Promise<ChartIndex | null> {
  try {
    const [chart, islands] = await Promise.all([loader.loadSeaChart(), loader.loadIslands()]);
    return indexChart(chart, islands);
  } catch (err) {
    console.warn('[Larkinor UI] Sea chart could not be loaded:', err);
    return null;
  }
}

/**
 * Work out the player's square from this page and store it. Resolves to the
 * stored position (null when there is none); never rejects on missing data —
 * the stored value is then left as it was.
 */
export async function activateSeaPosition(
  pageType: PageType,
  doc: Document,
  loader: DataLoader,
  readPref: ReadPref,
  writePref: WritePref,
  now: number = Date.now(),
): Promise<SeaPosition | null> {
  const step = takeStep(readPref, writePref);
  const prev = parseSeaPosition(readPref(SEA_POSITION_PREF_KEY));
  const page = pageInput(pageType, doc);
  const needsChart = page.kind === 'harbour' || page.kind === 'observed';
  const index = needsChart ? await loadIndex(loader) : null;
  const learned = parseLearnedTiles(readPref(SEA_LEARNED_TILES_PREF_KEY));

  const result = resolveSeaPosition(prev, step, page, index, learned, now);
  if (result.keep) return prev;
  writePref(SEA_POSITION_PREF_KEY, result.position ? serializeSeaPosition(result.position) : '');
  if (result.learn) {
    const { image, row, col } = result.learn;
    writePref(SEA_LEARNED_TILES_PREF_KEY, serializeLearnedTiles(recordTile(learned, image, row, col)));
  }
  return result.position;
}

// Capturing which city map tile the player stands on, from the free-move page.
//
// Shared by both boots and injected with its writer (like captureMarketRates),
// so the capture is testable without GM_* and the two boots cannot drift.

import { MAP_POSITION_PREF_KEY } from '@/shared/prefKeys';
import { parseMapPosition } from '@/shared/mapPosition';

/** The tile id in a `…/tajk/<id>.gif` picture URL. */
const TILE_SRC = /\/tajk\/([^/?#]+)\.gif/;

/**
 * Stores the tile the page draws — the free-move page's `tajk/<id>.gif`, whose
 * id is the map data's `imageId`. Returns the id, or null when the page draws
 * no tile, which leaves the stored position as it was.
 */
export function captureMapPosition(doc: Document, write: (key: string, value: string) => void): string | null {
  for (const img of doc.querySelectorAll('img[src*="/tajk/"]')) {
    const id = parseMapPosition(TILE_SRC.exec(img.getAttribute('src') ?? '')?.[1] ?? null);
    if (id) {
      write(MAP_POSITION_PREF_KEY, id);
      return id;
    }
  }
  return null;
}

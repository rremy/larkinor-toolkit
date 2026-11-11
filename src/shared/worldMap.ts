// Which of the three maps belongs to where the player is: Larkinor (the city
// island), Thord-Artin, or the sea chart. The Térkép tab opens on it and the
// minimap draws it. An island with no map of its own (the small western one)
// is shown on the sea chart, which draws every island.

import type { ChartIndex } from './seaChart';
import { isInCity, type SeaPosition } from './seaPosition';

export type WorldMap = 'larkinor' | 'thord-artin' | 'sea';

export const WORLD_MAPS: readonly WorldMap[] = ['larkinor', 'thord-artin', 'sea'];

export const WORLD_MAP_LABEL: Record<WorldMap, string> = {
  'larkinor': 'Larkinor',
  'thord-artin': 'Thord-Artin',
  'sea': 'Tenger',
};

export const THORD_ARTIN = 'Thord-Artin';

/**
 * The map for a position; null when there is no position.
 *
 * Being on the ship decides before the square does: the sea square a ship
 * leaves harbour 13 onto, (0, 3), lies inside the city's 10×10 block.
 */
export function placeOf(here: SeaPosition | null, index: ChartIndex | null): WorldMap | null {
  if (!here) return null;
  if (here.source === 'city') return 'larkinor';
  if (here.image?.startsWith('nagysziget/')) return 'thord-artin';
  if (here.image) return 'sea'; // an island with no map of its own
  if (here.source === 'departure' || here.source === 'move') return 'sea';
  if (index) {
    if (index.squareAt(here.row, here.col) === null) return 'sea';
    // A harbour building or a hand-set square stands on its island's land.
    if (index.tileAt(here.row, here.col)?.island === THORD_ARTIN) return 'thord-artin';
  }
  return isInCity(here) ? 'larkinor' : 'sea';
}

/** A stored view; the values written before Thord-Artin had a map read as their nearest. */
export function parseWorldMap(raw: string | null): WorldMap | null {
  if (raw === 'city') return 'larkinor';
  return WORLD_MAPS.includes(raw as WorldMap) ? (raw as WorldMap) : null;
}

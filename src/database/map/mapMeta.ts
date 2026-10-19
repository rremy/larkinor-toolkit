/**
 * Grid position + district/POI lookup tables for the Térkép (map) view.
 * Ported from `lc-database/explorer.html` (MAP module, lines 734-766).
 */

import type { MapCell } from '@/shared/data';

export type MapSide = 'N' | 'E' | 'S' | 'W';

export const MAP_SIDES: readonly MapSide[] = ['N', 'E', 'S', 'W'];

export interface GridPos {
  row: number;
  col: number;
}

/** The cell every layout is anchored to; its id is also its true position. */
export const HUB_ID = '44';

const STEP: Record<MapSide, GridPos> = {
  N: { row: -1, col: 0 },
  S: { row: 1, col: 0 },
  E: { row: 0, col: 1 },
  W: { row: 0, col: -1 },
};

/**
 * Read a position off a tile id written `<row><col>`, where the row may be
 * negative — the strip above the city is drawn as `-11`, `-14`, `-15`. Returns
 * null for an id that does not follow the scheme at all (`41-13`, the
 * démonsziget tile east of 68), whose position only the edges can tell.
 */
export function parseId(imageId: string): GridPos | null {
  const signed = /^(-?\d)(\d)$/.exec(imageId);
  if (signed) return { row: Number(signed[1]), col: Number(signed[2]) };
  if (/^\d$/.test(imageId)) return { row: 0, col: Number(imageId) };
  return null;
}

/**
 * Place every cell on the grid by walking the recorded moves outwards from
 * the hub, so a tile lands where the game actually puts it whatever its image
 * is called. A cell no walk reaches is placed by {@link parseId} and walked
 * on from there in turn; a cell that still has no position, or whose slot is
 * already taken, is left out rather than drawn over another.
 */
export function layoutCells(
  cells: MapCell[],
  edges: Record<string, string>,
): Map<string, GridPos> {
  const known = new Set(cells.map((c) => c.imageId));
  const positions = new Map<string, GridPos>();
  const taken = new Set<string>();
  const place = (id: string, pos: GridPos): boolean => {
    const slot = `${pos.row},${pos.col}`;
    if (positions.has(id) || taken.has(slot)) return false;
    positions.set(id, pos);
    taken.add(slot);
    return true;
  };
  const walkFrom = (start: string): void => {
    const queue = [start];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      const from = positions.get(id) as GridPos;
      for (const side of MAP_SIDES) {
        const target = edges[`${id}:${side}`];
        if (target === undefined || !known.has(target)) continue;
        const pos = { row: from.row + STEP[side].row, col: from.col + STEP[side].col };
        if (place(target, pos)) queue.push(target);
      }
    }
  };

  const hub = cells.find((c) => c.imageId === HUB_ID);
  const seeds = hub ? [hub, ...cells] : cells;
  for (const cell of seeds) {
    const pos = parseId(cell.imageId);
    if (pos && place(cell.imageId, pos)) walkFrom(cell.imageId);
  }
  return positions;
}

/**
 * Sides of a cell the game offers no way through and marks with no blocker
 * icon — a plain wall. The game draws a direction button for every open side
 * and a blocker icon (the coast, `tenger.gif`) for some closed ones; a side
 * with neither is closed all the same, just silently.
 */
export function cellWalls(cell: MapCell): MapSide[] {
  const blockers = cell.blockers ?? {};
  return MAP_SIDES.filter((side) => !(side in cell.exits) && !(side in blockers));
}

export const DISTRICT_CLASS: Record<string, string> = {
  'városközpont': 'varos', 'mágus-negyed': 'magus', 'harcos-negyed': 'harcos',
  'kezdő-negyed': 'kezdo', 'sötét-negyed': 'sotet', 'sziklabarlangok': 'szikla',
  'erdő': 'erdo', 'mocsár': 'mocsar', 'temető': 'temeto', 'démonsziget': 'demon',
};

export const DISTRICT_SHORT: Record<string, string> = {
  'városközpont': 'város', 'mágus-negyed': 'mágus', 'harcos-negyed': 'harcos',
  'kezdő-negyed': 'kezdő', 'sötét-negyed': 'sötét', 'sziklabarlangok': 'szikla',
  'erdő': 'erdő', 'mocsár': 'mocsár', 'temető': 'temető', 'démonsziget': 'démon',
};

export const POI_EMOJI: Record<string, string> = {
  'palota.gif': '🏰', 'vegyesbolt.gif': '🛒', 'erod.gif': '🛡️', 'fegyverbolt.gif': '⚔️',
  'ekszeresz.gif': '💎', 'templom.gif': '⛪', 'magustorony.gif': '🔮', 'kocsma.gif': '🍺',
  'piac.gif': '🏪', 'kaszino.gif': '🎲', 'arena.gif': '⚔︎', 'kikoto.gif': '⚓',
};

export const POI_LABEL: Record<string, string> = {
  'palota.gif': 'palota', 'vegyesbolt.gif': 'vegyesbolt', 'erod.gif': 'erőd', 'fegyverbolt.gif': 'fegyverbolt',
  'ekszeresz.gif': 'ékszerész', 'templom.gif': 'templom', 'magustorony.gif': 'mágustorony', 'kocsma.gif': 'kocsma',
  'piac.gif': 'piac', 'kaszino.gif': 'kaszinó', 'arena.gif': 'aréna', 'kikoto.gif': 'kikötő',
};

/** `data-poi` value used for clan-house markers (they have no icon file). */
export const CLAN_POI = 'klanhaz';

/**
 * District colour legend, in display order. `cls` is the swatch/cell CSS
 * modifier; `label` is the Hungarian district name shown beside the swatch.
 * Mirrors the static "Districts" list in explorer.html:238-250.
 */
export const DISTRICT_SWATCHES: { cls: string; label: string }[] = [
  { cls: 'varos', label: 'városközpont' },
  { cls: 'magus', label: 'mágus-negyed' },
  { cls: 'harcos', label: 'harcos-negyed' },
  { cls: 'kezdo', label: 'kezdő-negyed' },
  { cls: 'sotet', label: 'sötét-negyed' },
  { cls: 'erdo', label: 'erdő' },
  { cls: 'mocsar', label: 'mocsár' },
  { cls: 'temeto', label: 'temető' },
  { cls: 'szikla', label: 'sziklabarlangok' },
  { cls: 'demon', label: 'démonsziget' },
  { cls: 'sea', label: 'tenger' },
  { cls: 'wall', label: 'fal' },
  { cls: 'hub', label: 'cell 44' },
];

/**
 * Filterable POI legend, in display order. `poi` is the `data-poi` key matched
 * against cell building icons (or {@link CLAN_POI} for clan houses); `emoji`
 * and `label` render the row. Mirrors explorer.html:254-268.
 */
export const POI_LEGEND: { poi: string; emoji: string; label: string; clan?: boolean }[] = [
  { poi: 'palota.gif', emoji: '🏰', label: 'palota' },
  { poi: 'vegyesbolt.gif', emoji: '🛒', label: 'vegyesbolt' },
  { poi: 'erod.gif', emoji: '🛡️', label: 'erőd' },
  { poi: 'fegyverbolt.gif', emoji: '⚔️', label: 'fegyverbolt' },
  { poi: 'ekszeresz.gif', emoji: '💎', label: 'ékszerész' },
  { poi: 'templom.gif', emoji: '⛪', label: 'templom' },
  { poi: 'magustorony.gif', emoji: '🔮', label: 'mágustorony' },
  { poi: 'kocsma.gif', emoji: '🍺', label: 'kocsma' },
  { poi: 'piac.gif', emoji: '🏪', label: 'piac' },
  { poi: 'kaszino.gif', emoji: '🎲', label: 'kaszinó' },
  { poi: 'arena.gif', emoji: '⚔︎', label: 'aréna' },
  { poi: 'kikoto.gif', emoji: '⚓', label: 'kikötő' },
  { poi: CLAN_POI, emoji: 'C', label: 'klánház', clan: true },
];

/** Per-cell shop-owner lookup: `{ [cellId]: { [buildingIcon]: ownerName } }`. */
export type ShopOwners = Record<string, Record<string, string>>;

/**
 * Build the shop-owner lookup consumed by the cell detail panel. Item shops
 * map to the `vegyesbolt.gif` building, weapon shops to `fegyverbolt.gif` —
 * reproducing the `shopOwners` table the legacy explorer inlined
 * (explorer.html:3174).
 */
export function buildShopOwners(
  itemShops: { cellId: string; owner: string }[],
  weaponShops: { cellId: string; owner: string }[],
): ShopOwners {
  const owners: ShopOwners = {};
  const add = (cellId: string, icon: string, owner: string) => {
    (owners[cellId] ??= {})[icon] = owner;
  };
  for (const s of itemShops) add(s.cellId, 'vegyesbolt.gif', s.owner);
  for (const s of weaponShops) add(s.cellId, 'fegyverbolt.gif', s.owner);
  return owners;
}

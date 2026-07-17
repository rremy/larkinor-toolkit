/**
 * Grid position + district/POI lookup tables for the Térkép (map) view.
 * Ported from `lc-database/explorer.html` (MAP module, lines 734-766).
 */

export function parseId(imageId: string): { row: number; col: number } {
  const id = Number(imageId);
  return { row: Math.floor(id / 10), col: id % 10 };
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

export type EntityTab = 'weapons' | 'armors' | 'items' | 'monsters';

export interface ColumnDef {
  key: string;
  label: string;
  num?: boolean;
  bool?: boolean;
  cls?: string;
}

export const COLS: Record<EntityTab, ColumnDef[]> = {
  weapons: [
    { key: 'id', label: 'ID', num: true, cls: 'right dim' },
    { key: 'name', label: 'Név', cls: 'name' },
    { key: 'level', label: 'Szint', num: true, cls: 'right' },
    { key: 'type', label: 'Típus' },
    { key: 'maxDamage', label: 'Max seb.', num: true, cls: 'right' },
    { key: 'avgDamage', label: 'Átlag seb.', num: true, cls: 'right' },
    { key: 'magical', label: 'Mág.', bool: true, cls: 'center' },
    { key: 'vampiric', label: 'Vámp.', bool: true, cls: 'center' },
    { key: 'weight', label: 'Súly', num: true, cls: 'right' },
    { key: 'price', label: 'Ár', num: true, cls: 'right' },
    { key: 'marketPrice', label: 'Piaci ár', num: true, cls: 'right' },
  ],
  armors: [
    { key: 'id', label: 'ID', num: true, cls: 'right dim' },
    { key: 'name', label: 'Név', cls: 'name' },
    { key: 'level', label: 'Szint', num: true, cls: 'right' },
    { key: 'type', label: 'Típus' },
    { key: 'defense', label: 'Védelem', num: true, cls: 'right' },
    { key: 'magical', label: 'Mág.', bool: true, cls: 'center' },
    { key: 'weight', label: 'Súly', num: true, cls: 'right' },
    { key: 'price', label: 'Ár', num: true, cls: 'right' },
    { key: 'marketPrice', label: 'Piaci ár', num: true, cls: 'right' },
    { key: 'craftableAt', label: 'Készíthető' },
  ],
  items: [
    { key: 'id', label: 'ID', num: true, cls: 'right dim' },
    { key: 'name', label: 'Név', cls: 'name' },
    { key: 'minLevel', label: 'Min. szint', num: true, cls: 'right' },
    { key: 'defense', label: 'Védelem', num: true, cls: 'right' },
    { key: 'magical', label: 'Mág.', bool: true, cls: 'center' },
    { key: 'weight', label: 'Súly', num: true, cls: 'right' },
    { key: 'price', label: 'Ár', num: true, cls: 'right' },
    { key: 'marketPrice', label: 'Piaci ár', num: true, cls: 'right' },
    { key: 'craftableAt', label: 'Készíthető' },
    { key: 'special', label: 'Speciális' },
  ],
  monsters: [
    { key: 'id', label: 'ID', num: true, cls: 'right dim' },
    { key: 'name', label: 'Név', cls: 'name' },
    { key: 'level', label: 'Szint', num: true, cls: 'right' },
    { key: 'hp', label: 'ÉP', num: true, cls: 'right' },
    { key: 'mp', label: 'TP', num: true, cls: 'right' },
    { key: 'attackType', label: 'Szenszgömb' },
    { key: 'debuff', label: 'Rontás' },
    { key: 'magicWeapon', label: 'Mág. fegyver', bool: true, cls: 'center' },
    { key: 'location', label: 'Előfordulás' },
  ],
};

export interface SortState {
  key: string;
  asc: boolean;
}

/**
 * Initial sort per tab, until the player picks another column: the strongest
 * gear first on the weapon and armour tabs, level (items: price) ascending on
 * the rest, as the legacy explorer had it.
 */
export const DEFAULT_SORT: Record<EntityTab, SortState> = {
  weapons: { key: 'maxDamage', asc: false },
  armors: { key: 'defense', asc: false },
  items: { key: 'price', asc: true },
  monsters: { key: 'level', asc: true },
};

/** A sort for `explorerSortKey`. */
export function serialiseSortState(sort: SortState): string {
  return JSON.stringify(sort);
}

/**
 * Read a stored sort back, falling back to the tab's default for a missing or
 * corrupt value, or a column the tab no longer shows.
 */
export function parseSortState(raw: string | null, tab: EntityTab): SortState {
  if (!raw) return DEFAULT_SORT[tab];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return DEFAULT_SORT[tab];
    const { key, asc } = parsed as Record<string, unknown>;
    if (typeof key !== 'string' || typeof asc !== 'boolean') return DEFAULT_SORT[tab];
    if (!COLS[tab].some((c) => c.key === key)) return DEFAULT_SORT[tab];
    return { key, asc };
  } catch {
    return DEFAULT_SORT[tab];
  }
}

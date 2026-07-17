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

/**
 * Initial sort per tab, mirroring the legacy `STATE.sort`
 * (explorer.html:286): level ascending everywhere except items (price asc).
 */
export const DEFAULT_SORT: Record<EntityTab, { key: string; asc: boolean }> = {
  weapons: { key: 'level', asc: true },
  armors: { key: 'level', asc: true },
  items: { key: 'price', asc: true },
  monsters: { key: 'level', asc: true },
};

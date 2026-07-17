import type { EntityTab } from './columns';

export type FilterDef = {
  type: 'search' | 'range' | 'select' | 'tri';
  key: string;
  label: string;
  options?: string[];
};

export type FilterState = Record<string, string>;

export function foldAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function applyFilters<T extends Record<string, unknown>>(
  rows: T[], defs: FilterDef[], state: FilterState,
): T[] {
  return rows.filter((row) => defs.every((def) => {
    if (def.type === 'search') {
      const q = (state[def.key] ?? '').trim();
      if (!q) return true;
      return foldAccents(String(row[def.key] ?? '')).includes(foldAccents(q));
    }
    if (def.type === 'range') {
      const v = Number(row[def.key]);
      const min = state[`${def.key}_min`], max = state[`${def.key}_max`];
      if (min !== undefined && min !== '' && !(v >= Number(min))) return false;
      if (max !== undefined && max !== '' && !(v <= Number(max))) return false;
      return true;
    }
    if (def.type === 'select') {
      const sel = state[def.key];
      if (!sel) return true;
      return String(row[def.key]) === sel;
    }
    // tri
    const t = state[def.key];
    if (!t) return true;
    return Boolean(row[def.key]) === (t === 'yes');
  }));
}

export function sortRows<T extends Record<string, unknown>>(
  rows: T[], key: string, asc: boolean, numeric: boolean,
): T[] {
  const dir = asc ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (numeric) return (Number(a[key]) - Number(b[key])) * dir;
    return foldAccents(String(a[key] ?? '')).localeCompare(foldAccents(String(b[key] ?? ''))) * dir;
  });
}

export const FILTERS: Record<EntityTab, FilterDef[]> = {
  weapons: [
    { type: 'search', key: 'name', label: 'Keresés (név)' },
    { type: 'range', key: 'level', label: 'Szint' },
    { type: 'select', key: 'type', label: 'Típus', options: ['', 'Szúró/Vágó', 'Ütő/Zúzó', 'Távolsági'] },
    { type: 'range', key: 'maxDamage', label: 'Max sebzés' },
    { type: 'range', key: 'price', label: 'Ár' },
    { type: 'tri', key: 'magical', label: 'Mágikus' },
    { type: 'tri', key: 'vampiric', label: 'Vámpirizál' },
  ],
  armors: [
    { type: 'search', key: 'name', label: 'Keresés (név)' },
    { type: 'range', key: 'level', label: 'Szint' },
    { type: 'select', key: 'type', label: 'Típus', options: ['', 'Sisak', 'Páncél', 'Csizma', 'Pajzs'] },
    { type: 'range', key: 'defense', label: 'Védelem' },
    { type: 'range', key: 'price', label: 'Ár' },
    { type: 'tri', key: 'magical', label: 'Mágikus' },
  ],
  items: [
    { type: 'search', key: 'name', label: 'Keresés (név)' },
    { type: 'range', key: 'minLevel', label: 'Min. szint' },
    { type: 'range', key: 'price', label: 'Ár' },
    { type: 'range', key: 'weight', label: 'Súly' },
    { type: 'tri', key: 'magical', label: 'Mágikus' },
  ],
  monsters: [
    { type: 'search', key: 'name', label: 'Keresés (név)' },
    { type: 'range', key: 'level', label: 'Szint' },
    { type: 'range', key: 'hp', label: 'ÉP' },
    { type: 'range', key: 'mp', label: 'TP' },
    { type: 'tri', key: 'magicWeapon', label: 'Mág. fegyver' },
  ],
};

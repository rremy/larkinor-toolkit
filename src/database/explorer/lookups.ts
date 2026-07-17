import type { Weapon, Armor, Item } from '@/shared/data';
import type { Monster } from '@/shared/data/monsters';

/** A craftable/entity that consumes some component item in its recipe. */
export interface UsedInEntry {
  ownerId: number;
  ownerName: string;
  ownerType: 'weapons' | 'armors' | 'items';
  qty: number;
  ownerLevel: number | null;
}

export interface DetailLookups {
  /** component item id → entities whose recipe uses it. */
  usedIn: Map<number, UsedInEntry[]>;
  /** monster id → monster, for enriching `droppedBy` lists. */
  monstersById: Map<number, Monster>;
}

/** Singular Hungarian noun per owner type, for the "Mire használható" list. */
export const OWNER_TYPE_LABEL: Record<UsedInEntry['ownerType'], string> = {
  weapons: 'fegyver',
  armors: 'vért',
  items: 'tárgy',
};

type Craftable = (Weapon | Armor | Item) & { level?: number | null; minLevel?: number | null };

/**
 * Build the reverse-crafting index and monster-by-id map consumed by the
 * detail panel. Mirrors the legacy `initData` (explorer.html:382-400).
 */
export function buildLookups(
  weapons: Weapon[], armors: Armor[], items: Item[], monsters: Monster[],
): DetailLookups {
  const usedIn = new Map<number, UsedInEntry[]>();
  const push = (owner: Craftable, ownerType: UsedInEntry['ownerType']) => {
    for (const c of owner.recipe ?? []) {
      if (!c.id) continue;
      const cid = Number(c.id);
      const entry: UsedInEntry = {
        ownerId: owner.id,
        ownerName: owner.name,
        ownerType,
        qty: c.qty,
        ownerLevel: owner.level ?? owner.minLevel ?? null,
      };
      const list = usedIn.get(cid);
      if (list) list.push(entry);
      else usedIn.set(cid, [entry]);
    }
  };
  weapons.forEach((w) => push(w, 'weapons'));
  armors.forEach((a) => push(a, 'armors'));
  items.forEach((i) => push(i, 'items'));

  const monstersById = new Map(monsters.map((m) => [m.id, m]));
  return { usedIn, monstersById };
}

/** Sort `usedIn` entries by owner level (nulls last), then name. */
export function sortUsedIn(entries: UsedInEntry[]): UsedInEntry[] {
  return [...entries].sort((a, b) => {
    if (a.ownerLevel == null && b.ownerLevel == null) return a.ownerName.localeCompare(b.ownerName, 'hu');
    if (a.ownerLevel == null) return 1;
    if (b.ownerLevel == null) return -1;
    if (a.ownerLevel !== b.ownerLevel) return a.ownerLevel - b.ownerLevel;
    return a.ownerName.localeCompare(b.ownerName, 'hu');
  });
}

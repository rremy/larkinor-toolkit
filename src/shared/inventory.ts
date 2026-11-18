// What the player owns, recorded from the pages that list it and laid over the
// database rows, so browsing the database shows how many of an item you already
// have and where.
//
// The game has no page that lists everything at once, so each location is a
// snapshot of the last page that listed it in full, replaced whole on every
// visit: the backpack (character sheet, home, shops, crafting halls), the house
// (home), and each market's standing offers (that market's page — every market
// keeps its own, src/shared/markets.ts). What is worn comes from the stored
// loadout, which the character sheet already keeps current.
// Stored per character (see "Per-character storage" in src/utils/config.ts).

import type { DataLoader, Holding, HoldingLocation, Ownership } from '@/shared/data';
import { SLOT_ORDER, type Loadout } from '@/shared/loadout';
import { LARKINOR_MARKET_ID, marketLabel } from '@/shared/markets';

/** The single locations a page can list: every holding but what is worn and the markets. */
export type InventoryLocation = Exclude<HoldingLocation, 'worn' | 'market'>;

const LOCATIONS: readonly InventoryLocation[] = ['backpack', 'house'];

/** One stack as a page lists it. */
export interface InventoryEntry {
  /**
   * The game's item id where the page gives one (a select option's value),
   * which is the database's own id. Null where it does not, matched by name.
   */
  id: string | null;
  name: string;
  quantity: number;
}

export interface InventorySnapshot {
  capturedAt: number;
  items: InventoryEntry[];
}

export interface Inventory {
  version: 1;
  locations: Partial<Record<InventoryLocation, InventorySnapshot>>;
  /** Each market's standing offers, keyed by the market's picture id. */
  markets: Record<string, InventorySnapshot>;
}

/** What one page lists, by location; a market page lists its own market's offers. */
export type PageInventory = Partial<Record<InventoryLocation, InventoryEntry[]>> & {
  market?: { id: string; items: InventoryEntry[] };
};

/** PrefStore key holding the serialised Inventory. */
export { INVENTORY_PREF_KEY } from '@/shared/prefKeys';

export function serializeInventory(inventory: Inventory): string {
  return JSON.stringify(inventory);
}

function parseEntry(raw: unknown): InventoryEntry | null {
  if (raw === null || typeof raw !== 'object') return null;
  const { id, name, quantity } = raw as Record<string, unknown>;
  if (typeof name !== 'string' || typeof quantity !== 'number' || !Number.isFinite(quantity)) return null;
  if (id !== null && typeof id !== 'string') return null;
  return { id, name, quantity };
}

function parseSnapshot(raw: unknown): InventorySnapshot | null {
  if (raw === null || typeof raw !== 'object') return null;
  const { capturedAt, items } = raw as { capturedAt?: unknown; items?: unknown };
  if (typeof capturedAt !== 'number' || !Array.isArray(items)) return null;
  return { capturedAt, items: items.map(parseEntry).filter((e): e is InventoryEntry => e !== null) };
}

/**
 * The stored inventory, or null when nothing usable is stored. A malformed
 * entry or unknown location is dropped on its own, so one bad value never
 * costs the rest — including the single `market` location stored before
 * markets were told apart, which cannot say which market it lists.
 */
export function parseInventory(raw: string | null): Inventory | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; locations?: unknown; markets?: unknown };
    if (parsed?.version !== 1 || parsed.locations === null || typeof parsed.locations !== 'object') return null;
    const stored = parsed.locations as Record<string, unknown>;
    const locations: Inventory['locations'] = {};
    for (const location of LOCATIONS) {
      const snapshot = parseSnapshot(stored[location]);
      if (snapshot) locations[location] = snapshot;
    }
    const markets: Inventory['markets'] = {};
    if (parsed.markets !== null && typeof parsed.markets === 'object') {
      for (const [id, value] of Object.entries(parsed.markets)) {
        const snapshot = parseSnapshot(value);
        if (snapshot) markets[id] = snapshot;
      }
    }
    return { version: 1, locations, markets };
  } catch {
    return null;
  }
}

/**
 * The inventory with each location `page` lists replaced by that list, stamped
 * `now`; every other location is kept as it was. An empty list is recorded as
 * empty — the page has just said there is nothing there.
 */
export function recordLocations(previous: Inventory | null, page: PageInventory, now: number): Inventory {
  const locations = { ...(previous?.locations ?? {}) };
  for (const location of LOCATIONS) {
    const items = page[location];
    if (items) locations[location] = { capturedAt: now, items };
  }
  const markets = { ...(previous?.markets ?? {}) };
  if (page.market) markets[page.market.id] = { capturedAt: now, items: page.market.items };
  return { version: 1, locations, markets };
}

/** Names compare case- and spacing-insensitively; pages and data disagree on both. */
function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The markets holding a listing, Larkinor first, then by id. */
function marketOrder(inventory: Inventory | null): string[] {
  const ids = Object.keys(inventory?.markets ?? {});
  return [...ids.filter((id) => id === LARKINOR_MARKET_ID), ...ids.filter((id) => id !== LARKINOR_MARKET_ID).sort()];
}

/** A database row, as far as ownership needs one. */
interface OwnableRow {
  id: number;
  name: string;
}

/**
 * Where the row's item is held. An entry carrying a game id matches that id
 * only: ids are unique across weapons, armours and items, while names are not
 * (a weapon and an item can share one), so a name match would credit the wrong
 * row. Only an entry without an id is matched by name.
 */
export function holdingsOf(row: OwnableRow, inventory: Inventory | null, loadout: Loadout | null): Holding[] {
  const id = String(row.id);
  const name = nameKey(row.name);
  const holdings: Holding[] = [];

  if (loadout) {
    const worn = SLOT_ORDER.filter((slot) => {
      const equipped = loadout.slots[slot];
      return equipped !== null && nameKey(equipped.name) === name;
    }).length;
    if (worn > 0) holdings.push({ location: 'worn', quantity: worn, capturedAt: loadout.capturedAt });
  }

  const held = (snapshot: InventorySnapshot): number => snapshot.items.reduce(
    (sum, entry) => (entry.id !== null ? entry.id === id : nameKey(entry.name) === name) ? sum + entry.quantity : sum,
    0,
  );
  for (const location of LOCATIONS) {
    const snapshot = inventory?.locations[location];
    const quantity = snapshot ? held(snapshot) : 0;
    if (snapshot && quantity > 0) holdings.push({ location, quantity, capturedAt: snapshot.capturedAt });
  }
  for (const marketId of marketOrder(inventory)) {
    const snapshot = inventory!.markets[marketId];
    const quantity = held(snapshot);
    if (quantity > 0) {
      holdings.push({ location: 'market', market: marketLabel(marketId), quantity, capturedAt: snapshot.capturedAt });
    }
  }
  return holdings;
}

/**
 * The rows with `owned` and `holdings` filled in. With nothing recorded at all
 * the rows come back untouched, so the explorer can tell "owns none" from "has
 * no record" — the latter hides the ownership column entirely.
 */
export function applyInventory<T extends OwnableRow & Ownership>(
  rows: T[],
  inventory: Inventory | null,
  loadout: Loadout | null,
): T[] {
  if (!inventory && !loadout) return rows;
  return rows.map((row) => {
    const holdings = holdingsOf(row, inventory, loadout);
    const owned = holdings.reduce((sum, h) => sum + h.quantity, 0);
    return { ...row, owned: owned > 0 ? owned : null, holdings };
  });
}

/**
 * Wraps a loader so weapons, armours and items carry what the player owns. Both
 * stores are read on every load, like `withMarketRates`, so a loader held
 * across pages still sees the latest capture.
 */
export function withInventory(
  loader: DataLoader,
  readInventory: () => Inventory | null,
  readLoadout: () => Loadout | null,
): DataLoader {
  return {
    ...loader,
    loadWeapons: async () => applyInventory(await loader.loadWeapons(), readInventory(), readLoadout()),
    loadArmors: async () => applyInventory(await loader.loadArmors(), readInventory(), readLoadout()),
    loadItems: async () => applyInventory(await loader.loadItems(), readInventory(), readLoadout()),
  };
}

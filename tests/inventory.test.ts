import { describe, expect, it } from 'vitest';
import {
  applyInventory,
  holdingsOf,
  parseInventory,
  recordLocations,
  serializeInventory,
  withInventory,
  type Inventory,
} from '@/shared/inventory';
import type { Loadout } from '@/shared/loadout';
import type { DataLoader, Item, Weapon } from '@/shared/data';

const NOW = Date.UTC(2026, 10, 3, 12, 0);

function inventory(locations: Inventory['locations']): Inventory {
  return { version: 1, locations };
}

const item = (id: number, name: string): Item => ({
  id, name, weight: 0, price: 1, marketPrice: null, special: '', magical: false, craftableAt: '',
  minLevel: null, recipe: [], droppedBy: [], defense: null, shops: [],
});

function loadoutWearing(left: string | null, head: string | null): Loadout {
  const worn = (name: string | null, kind: 'fegyver' | 'vért') => name === null ? null : {
    name, kind, type: null, level: null, maxDamage: null, spread: null, defense: null, magical: false, vampiric: false,
  };
  return {
    version: 2, playerLevel: 30, capturedAt: NOW - 1000,
    slots: { leftHand: worn(left, 'fegyver'), rightHand: null, body: null, head: worn(head, 'vért'), legs: null },
  } as Loadout;
}

describe('parseInventory / serializeInventory', () => {
  it('round-trips', () => {
    const inv = inventory({ backpack: { capturedAt: NOW, items: [{ id: '338', name: 'kenyér', quantity: 3 }] } });
    expect(parseInventory(serializeInventory(inv))).toEqual(inv);
  });

  it('reads nothing usable as null', () => {
    expect(parseInventory(null)).toBeNull();
    expect(parseInventory('not json')).toBeNull();
    expect(parseInventory('{"version":9,"locations":{}}')).toBeNull();
  });

  it('drops malformed entries rather than the whole store', () => {
    const raw = JSON.stringify({
      version: 1,
      locations: {
        backpack: { capturedAt: NOW, items: [{ id: null, name: 'opál', quantity: 2 }, { name: 5 }, null] },
        attic: { capturedAt: NOW, items: [] },
      },
    });
    expect(parseInventory(raw)).toEqual(inventory({
      backpack: { capturedAt: NOW, items: [{ id: null, name: 'opál', quantity: 2 }] },
    }));
  });
});

describe('recordLocations', () => {
  it('replaces the locations a page lists and keeps the rest', () => {
    const before = inventory({
      backpack: { capturedAt: 1, items: [{ id: null, name: 'opál', quantity: 2 }] },
      house: { capturedAt: 1, items: [{ id: null, name: 'kard', quantity: 1 }] },
    });
    const after = recordLocations(before, { backpack: [{ id: '4', name: 'bot', quantity: 1 }] }, NOW);
    expect(after.locations.backpack).toEqual({ capturedAt: NOW, items: [{ id: '4', name: 'bot', quantity: 1 }] });
    expect(after.locations.house).toEqual(before.locations.house);
  });

  it('starts a store from nothing, and records an empty container as empty', () => {
    expect(recordLocations(null, { market: [] }, NOW)).toEqual(inventory({ market: { capturedAt: NOW, items: [] } }));
  });
});

describe('holdingsOf', () => {
  const inv = inventory({
    backpack: { capturedAt: NOW, items: [{ id: '338', name: '1 hetes kenyér', quantity: 3 }, { id: null, name: 'Opál', quantity: 2 }] },
    house: { capturedAt: NOW - 60_000, items: [{ id: null, name: 'opál', quantity: 10 }, { id: null, name: '1 hetes kenyér', quantity: 1 }] },
    market: { capturedAt: NOW, items: [{ id: null, name: 'opál', quantity: 5 }] },
  });

  it('matches by game id where the page gave one, by name otherwise, per location', () => {
    expect(holdingsOf({ id: 338, name: '1 hetes kenyér' }, inv, null)).toEqual([
      { location: 'backpack', quantity: 3, capturedAt: NOW },
      { location: 'house', quantity: 1, capturedAt: NOW - 60_000 },
    ]);
    expect(holdingsOf({ id: 50, name: 'opál' }, inv, null)).toEqual([
      { location: 'backpack', quantity: 2, capturedAt: NOW },
      { location: 'house', quantity: 10, capturedAt: NOW - 60_000 },
      { location: 'market', quantity: 5, capturedAt: NOW },
    ]);
  });

  it('never matches an entry carrying another id by its name', () => {
    // Weapon 7 and item 900 can share a name; the page's id says which it is.
    const byId = inventory({ backpack: { capturedAt: NOW, items: [{ id: '900', name: 'törpe csákány', quantity: 1 }] } });
    expect(holdingsOf({ id: 7, name: 'törpe csákány' }, byId, null)).toEqual([]);
    expect(holdingsOf({ id: 900, name: 'törpe csákány' }, byId, null)).toHaveLength(1);
  });

  it('counts what is worn, from the stored loadout', () => {
    const loadout = loadoutWearing('Kaltenekker íj', 'ent sisak');
    expect(holdingsOf({ id: 1, name: 'kaltenekker íj' }, null, loadout)).toEqual([
      { location: 'worn', quantity: 1, capturedAt: NOW - 1000 },
    ]);
  });

  it('counts a pair worn in both hands as two', () => {
    const loadout = loadoutWearing('tőr', null);
    loadout.slots.rightHand = loadout.slots.leftHand;
    expect(holdingsOf({ id: 1, name: 'tőr' }, null, loadout)).toEqual([
      { location: 'worn', quantity: 2, capturedAt: NOW - 1000 },
    ]);
  });
});

describe('applyInventory', () => {
  it('adds the total and the breakdown, null for rows not owned', () => {
    const inv = inventory({ backpack: { capturedAt: NOW, items: [{ id: null, name: 'opál', quantity: 2 }] } });
    const [opal, ruby] = applyInventory([item(1, 'opál'), item(2, 'rubin')], inv, null);
    expect(opal.owned).toBe(2);
    expect(opal.holdings).toEqual([{ location: 'backpack', quantity: 2, capturedAt: NOW }]);
    expect(ruby.owned).toBeNull();
    expect(ruby.holdings).toEqual([]);
  });

  it('leaves rows untouched when nothing has ever been recorded', () => {
    const rows = [item(1, 'opál')];
    expect(applyInventory(rows, null, null)).toBe(rows);
  });
});

describe('withInventory', () => {
  it('reads the store on every load', async () => {
    let stored: Inventory | null = null;
    const base = {
      loadWeapons: async () => [{ ...item(5, 'bot'), type: 'ütő' } as unknown as Weapon],
      loadArmors: async () => [],
      loadItems: async () => [item(1, 'opál')],
    } as unknown as DataLoader;
    const loader = withInventory(base, () => stored, () => null);
    expect((await loader.loadItems())[0]).not.toHaveProperty('owned');
    stored = inventory({ backpack: { capturedAt: NOW, items: [{ id: '5', name: 'bot', quantity: 1 }] } });
    expect((await loader.loadWeapons())[0].owned).toBe(1);
    expect((await loader.loadItems())[0].owned).toBeNull();
  });
});

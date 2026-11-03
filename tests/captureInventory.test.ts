import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PageType } from '@/utils/pageDetector';
import { INVENTORY_PREF_KEY } from '@/shared/prefKeys';
import { parseInventory, serializeInventory } from '@/shared/inventory';

// The extractors have tests of their own against real page markup; these stand
// in for them so this file pins only which page feeds which location.
const pages = vi.hoisted(() => ({
  character: { backpack: [] as unknown[] },
  home: { house: { items: [] as unknown[] }, backpack: { items: [] as unknown[] } },
  market: { listings: [] as unknown[] },
  shop: { kind: 'general', sell: [] as unknown[] },
  hall: null as null | { options: unknown[] },
}));

vi.mock('@/utils/characterPageExtract', () => ({ extractCharacterPage: () => pages.character }));
vi.mock('@/utils/homeExtract', async (original) => ({
  ...(await original<typeof import('@/utils/homeExtract')>()),
  extractHome: () => pages.home,
}));
vi.mock('@/utils/marketExtract', async (original) => ({
  ...(await original<typeof import('@/utils/marketExtract')>()),
  extractMarket: () => pages.market,
}));
vi.mock('@/utils/shopExtract', () => ({ extractShop: () => pages.shop }));
vi.mock('@/utils/craftingExtract', () => ({ extractCraftingHall: () => pages.hall }));

const { captureInventory } = await import('@/utils/captureInventory');

const NOW = 1_700_000_000_000;
const doc = document;

function run(pageType: PageType, stored: Record<string, string> = {}): Record<string, string> {
  captureInventory(pageType, doc, (key) => stored[key] ?? null, (key, value) => { stored[key] = value; }, NOW);
  return stored;
}

function locations(store: Record<string, string>) {
  return parseInventory(store[INVENTORY_PREF_KEY] ?? null)?.locations;
}

beforeEach(() => {
  pages.character = { backpack: [] };
  pages.home = { house: { items: [] }, backpack: { items: [] } };
  pages.market = { listings: [] };
  pages.shop = { kind: 'general', sell: [] };
  pages.hall = null;
});

describe('captureInventory', () => {
  it('reads the backpack, with game ids, off the character sheet — silver is money, not an item', () => {
    pages.character.backpack = [
      { id: '0', name: 'ezüst', amount: 21851 },
      { id: '4', name: 'bot', amount: 1 },
    ];
    expect(locations(run(PageType.Character))).toEqual({
      backpack: { capturedAt: NOW, items: [{ id: '4', name: 'bot', quantity: 1 }] },
    });
  });

  it('reads both the house and the backpack at home', () => {
    pages.home.house.items = [{ name: 'ezüst', amount: 51031 }, { name: 'mágikus fejsze', amount: 1 }];
    pages.home.backpack.items = [{ name: 'opál', amount: 20 }];
    expect(locations(run(PageType.Home))).toEqual({
      house: { capturedAt: NOW, items: [{ id: null, name: 'mágikus fejsze', quantity: 1 }] },
      backpack: { capturedAt: NOW, items: [{ id: null, name: 'opál', quantity: 20 }] },
    });
  });

  it('reads the standing offers at the market, by detail or by label', () => {
    pages.market.listings = [
      { label: '6 db. agyar 700 ezüst/db. áron', detail: { name: 'agyar' }, quantity: 6 },
      { label: '2 db. vörös kő 50 ezüst/db. áron', detail: null, quantity: 2 },
    ];
    expect(locations(run(PageType.Market))).toEqual({
      market: {
        capturedAt: NOW,
        items: [{ id: null, name: 'agyar', quantity: 6 }, { id: null, name: 'vörös kő', quantity: 2 }],
      },
    });
  });

  it('reads the backpack off a shop’s sell list', () => {
    pages.shop.sell = [{ id: '144', name: 'bőrsisak', amount: 1 }, { id: null, name: 'opál', amount: 3 }];
    expect(locations(run(PageType.Shop))?.backpack?.items).toEqual([
      { id: '144', name: 'bőrsisak', quantity: 1 },
      { id: null, name: 'opál', quantity: 3 },
    ]);
  });

  it('reads the backpack off a crafting hall’s ingredient list', () => {
    pages.hall = { options: [{ id: '0', name: 'ezüst', count: 5 }, { id: '622', name: 'kincs', count: 450 }] };
    expect(locations(run(PageType.ForgeHall))?.backpack?.items).toEqual([{ id: '622', name: 'kincs', quantity: 450 }]);
  });

  it('keeps the locations this page does not list', () => {
    const stored = { [INVENTORY_PREF_KEY]: serializeInventory({
      version: 1,
      locations: { house: { capturedAt: 1, items: [{ id: null, name: 'kard', quantity: 1 }] } },
    }) };
    pages.character.backpack = [{ id: '4', name: 'bot', amount: 1 }];
    expect(locations(run(PageType.Character, stored))?.house?.items).toEqual([{ id: null, name: 'kard', quantity: 1 }]);
  });

  it('writes nothing on a page that lists no inventory', () => {
    expect(run(PageType.FreeMove)).toEqual({});
    expect(run(PageType.MageHall)).toEqual({}); // the hall's form was not found
  });

  it('never lets a broken page stop the boot', () => {
    pages.home = null as never;
    expect(() => run(PageType.Home)).not.toThrow();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { MARKET_SORT_OPTIONS, sortItems, sortListings } from '../src/desktop/marketSort';
import type { MarketItem, MarketListing } from '../src/utils/marketExtract';

function item(name: string, over: Partial<MarketItem> = {}): MarketItem {
  return {
    name, index: 0, type: 'tárgy', magical: false, attrs: [],
    weight: 1, amount: 1, totalWeight: 1, price: 10, pricePercent: 100, suggestedPrice: 10,
    ...over,
  };
}

function listing(label: string, over: Partial<MarketListing> = {}): MarketListing {
  return {
    label, index: 0, detail: null, pricePercent: 100,
    quantity: 1, unitPrice: 10, shopPrice: 10, suggestedPrice: 10,
    revoke: vi.fn(),
    ...over,
  };
}

/** The detail block an offer carries, when the game gave us one. */
function detail(name: string, over: Partial<NonNullable<MarketListing['detail']>> = {}) {
  return {
    name, type: 'tárgy' as const, magical: false, attrs: [] as Array<[string, string]>,
    weight: 1, amount: 1, totalWeight: 1, price: 10,
    ...over,
  };
}

const names = (rows: Array<{ name: string }>) => rows.map((r) => r.name);
const labels = (rows: MarketListing[]) => rows.map((r) => r.label);

describe('MARKET_SORT_OPTIONS', () => {
  it('opens with the home view\'s five keys, worded the same', () => {
    // The market's toolbar is meant to read as the home view's, so the shared
    // keys must not drift in wording or order.
    expect(MARKET_SORT_OPTIONS.slice(0, 5)).toEqual([
      ['name', 'Név'],
      ['weight', 'Súly'],
      ['totalWeight', 'Összsúly'],
      ['amount', 'Mennyiség'],
      ['price', 'Ár'],
    ]);
  });

  it('adds the figures only the market has', () => {
    expect(MARKET_SORT_OPTIONS.slice(5)).toEqual([
      ['percent', '%'],
      ['market', 'piaci ár'],
      ['total', 'összesen'],
    ]);
  });
});

describe('sortItems', () => {
  it('sorts by name, and by Hungarian collation rather than code points', () => {
    // "cs" is a letter of its own in Hungarian, sorting after every plain "c…".
    const rows = sortItems([item('csont'), item('cukor')], 'name', true);
    expect(names(rows)).toEqual(['cukor', 'csont']);
  });

  it('reverses on descending', () => {
    const rows = sortItems([item('agyar'), item('bőr')], 'name', false);
    expect(names(rows)).toEqual(['bőr', 'agyar']);
  });

  it('sorts by each of the item\'s own figures', () => {
    const light = item('light', { weight: 0.1, totalWeight: 0.5, amount: 5, price: 4, pricePercent: 80, suggestedPrice: 3 });
    const heavy = item('heavy', { weight: 9, totalWeight: 90, amount: 10, price: 400, pricePercent: 900, suggestedPrice: 3600 });

    for (const key of ['weight', 'totalWeight', 'amount', 'price', 'percent', 'market'] as const) {
      expect(names(sortItems([heavy, light], key, true))).toEqual(['light', 'heavy']);
      expect(names(sortItems([light, heavy], key, false))).toEqual(['heavy', 'light']);
    }
  });

  it('sorts by the pre-filled total, not the unit price', () => {
    // What a one-click offer of the whole stack comes to: a cheap item in bulk
    // outweighs a dear single.
    const bulk = item('bulk', { amount: 100, suggestedPrice: 50 });     // 5000
    const single = item('single', { amount: 1, suggestedPrice: 4000 }); // 4000

    expect(names(sortItems([bulk, single], 'total', true))).toEqual(['single', 'bulk']);
  });

  it('counts a missing figure as zero, keeping the row in the list', () => {
    // Silver has no Ár at all; the inventory's sort treats such a gap as 0 and
    // this one follows, so the row stays visible.
    const priceless = item('ezüst', { price: null, pricePercent: null, suggestedPrice: null });
    const rows = sortItems([item('agyar', { price: 124 }), priceless], 'price', true);

    expect(names(rows)).toEqual(['ezüst', 'agyar']);
  });

  it('leaves the given array untouched', () => {
    // The two columns sort the same extracted state independently.
    const original = [item('b'), item('a')];
    sortItems(original, 'name', true);
    expect(names(original)).toEqual(['b', 'a']);
  });
});

describe('sortListings', () => {
  it('sorts by the item\'s name, falling back to the label', () => {
    const named = listing('6 db. agyar 700 ezüst/db. áron', { detail: detail('agyar') });
    const unnamed = listing('valami furcsa sor');

    // The fallback is what such a row displays, so it is what it sorts by.
    expect(labels(sortListings([unnamed, named], 'name', true))).toEqual([named.label, unnamed.label]);
  });

  it('reads quantity and price from the offer, not from the detail block', () => {
    // A standing offer's own figures are what the row shows: the quantity comes
    // off the label, and Ár is the shop price it is competing with.
    const few = listing('few', { detail: detail('few', { amount: 99 }), quantity: 2, shopPrice: 5 });
    const many = listing('many', { detail: detail('many', { amount: 1 }), quantity: 40, shopPrice: 500 });

    expect(labels(sortListings([many, few], 'amount', true))).toEqual(['few', 'many']);
    expect(labels(sortListings([many, few], 'price', true))).toEqual(['few', 'many']);
  });

  it('sorts by weight through the detail block', () => {
    const light = listing('light', { detail: detail('light', { weight: 0.2, totalWeight: 1 }) });
    const heavy = listing('heavy', { detail: detail('heavy', { weight: 8, totalWeight: 80 }) });

    expect(labels(sortListings([heavy, light], 'weight', true))).toEqual(['light', 'heavy']);
    expect(labels(sortListings([heavy, light], 'totalWeight', true))).toEqual(['light', 'heavy']);
  });

  it('sorts by the asking total the row shows', () => {
    const bulk = listing('bulk', { quantity: 19, unitPrice: 50 });   // 950
    const single = listing('single', { quantity: 1, unitPrice: 7000 }); // 7000

    expect(labels(sortListings([single, bulk], 'total', true))).toEqual(['bulk', 'single']);
  });

  it('treats an offer with no quantity as a single unit, as the row does', () => {
    const one = listing('one', { quantity: null, unitPrice: 300 }); // 300 x 1
    const two = listing('two', { quantity: 2, unitPrice: 300 });    // 600

    expect(labels(sortListings([two, one], 'total', true))).toEqual(['one', 'two']);
  });
});

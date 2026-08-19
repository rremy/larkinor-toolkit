import { vi } from 'vitest';
import type {
  MarketCatalogueEntry,
  MarketItem,
  MarketListing,
  MarketPurchase,
  MarketState,
} from '../../src/utils/marketExtract';

// Builders for a MarketState, shared by the desktop panel's tests and the mobile
// page's: both render the same lists, so a divergent fixture would let one
// platform's tests pass on data the other never sees. Figures are the live
// page's own — jáspis is 50 ezüst at 170%.

export function item(name: string, amount: number, price: number | null, percent: number | null, index: number): MarketItem {
  const suggestedPrice = price === null ? null : Math.round((price * (percent ?? 500)) / 100);
  return {
    name, amount, index, price, pricePercent: percent, suggestedPrice,
    type: 'tárgy', weight: 0.04, totalWeight: 0.04 * amount, magical: false, attrs: [],
  };
}

export function listing(
  label: string,
  index: number,
  name?: string,
  percent: number | null = null,
  opts: { quantity?: number; unitPrice?: number; shopPrice?: number | null } = {},
): MarketListing {
  const shopPrice = opts.shopPrice ?? null;
  const detail = name
    ? { name, type: 'tárgy' as const, weight: 1, amount: 1, totalWeight: 1, price: shopPrice, magical: false, attrs: [] }
    : null;
  return {
    label,
    index,
    detail,
    pricePercent: percent,
    quantity: opts.quantity ?? null,
    unitPrice: opts.unitPrice ?? null,
    shopPrice,
    suggestedPrice: shopPrice === null ? null : Math.round((shopPrice * (percent ?? 500)) / 100),
    revoke: vi.fn(),
  };
}

export function purchase(
  name: string,
  index: number,
  opts: { quantity?: number; unitPrice?: number; shopPrice?: number | null; percent?: number | null } = {},
): MarketPurchase {
  const shopPrice = opts.shopPrice ?? null;
  const quantity = opts.quantity ?? 1;
  const unitPrice = opts.unitPrice ?? 100;
  return {
    index,
    label: `${quantity} db. ${name} ${unitPrice} ezüst/db. áron`,
    detail: { name, type: 'tárgy', weight: 1, amount: quantity, totalWeight: quantity, price: shopPrice, magical: false, attrs: [] },
    quantity,
    unitPrice,
    pricePercent: opts.percent ?? null,
    shopPrice,
    buy: vi.fn(),
  };
}

export function entry(id: string, name: string, pricePercent: number | null = null): MarketCatalogueEntry {
  return { id, name, pricePercent };
}

export function makeMarketState(overrides: Partial<MarketState> = {}): MarketState {
  return {
    items: [
      item('ezüst', 5725, null, null, 0),
      item('jáspis', 19, 50, 170, 2),
      item('gyíkbőr', 7, 10, 120, 3),
    ],
    listings: [listing('6 db. agyar 700 ezüst/db. áron', 1, 'agyar', 565, { quantity: 6, unitPrice: 700, shopPrice: 124 })],
    offer: vi.fn(),
    catalogue: [entry('37', 'jáspis', 170), entry('94', 'agyar', 565), entry('41', 'vámpír kard', 300)],
    search: vi.fn(),
    searchedName: null,
    purchases: [],
    actions: { exit: null, collectMoney: null, settings: null, special: [] },
    gold: 853,
    weight: { used: 43.6, max: 114.2 },
    earnings: null,
    narration: 'Szétnézel a piacon...',
    ...overrides,
  };
}

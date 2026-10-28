import { vi } from 'vitest';
import type { ShopBuyItem, ShopSellItem, ShopState } from '../../src/utils/shopExtract';

// Builders for a ShopState, shared by the mobile page's tests and the desktop
// panel's, for the reason the market's builders are shared. Figures are the
// live Vegyesbolt's: sárkánykarom is 810 ezüst and the shop pays half.

export function buyItem(name: string, index: number, unitPrice: number, over: Partial<ShopBuyItem> = {}): ShopBuyItem {
  return {
    name, index, id: String(100 + index), unitPrice, marketPrice: null,
    type: 'tárgy', weight: 0.4, amount: 1, totalWeight: 0.4, price: unitPrice, magical: false, attrs: [],
    ...over,
  };
}

export function sellItem(
  name: string,
  amount: number,
  sellPrice: number | null,
  opts: { index?: number | null; bulkIndex?: number | null; marketPrice?: number | null; sellable?: boolean } = {},
): ShopSellItem {
  return {
    name, amount,
    index: opts.index === undefined ? 0 : opts.index,
    id: '1',
    sellPrice,
    marketPrice: opts.marketPrice ?? null,
    bulkIndex: opts.bulkIndex === undefined ? null : opts.bulkIndex,
    sellable: opts.sellable ?? true,
    type: 'tárgy', weight: 1, totalWeight: amount, price: sellPrice === null ? null : sellPrice * 2, magical: false, attrs: [],
  };
}

export function makeShopState(overrides: Partial<ShopState> = {}): ShopState {
  return {
    kind: 'general',
    title: 'Vegyesbolt',
    gold: 3116,
    narration: 'Belépsz Szaiva vegyesboltjába...',
    buy: [buyItem('kaja', 0, 2), buyItem('térkép', 1, 150), buyItem('abrak', 2, 500)],
    sell: [
      sellItem('arany', 88, 10, { index: 1, bulkIndex: 2 }),
      sellItem('sárkánykarom', 11, 405, { index: 2, bulkIndex: 21, marketPrice: 24300 }),
      sellItem('mengorni kard', 2, 351, { index: 3 }),
    ],
    purchase: vi.fn(),
    sellOne: vi.fn(),
    sellMany: vi.fn(),
    actions: {
      exit: { label: 'Kilepes az epuletbol', iconUrl: '', trigger: vi.fn() },
      stowWorn: { label: 'Viselt targyak a hatizsakba', iconUrl: '', trigger: vi.fn() },
      other: [],
    },
    ailments: null,
    ...overrides,
  };
}

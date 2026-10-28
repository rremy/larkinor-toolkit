import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { Shop } from '../src/pages/Shop';
import { Market } from '../src/pages/Market';
import { SHOP_TAB_KEY, MARKET_TAB_KEY } from '../src/utils/config';
import { sortPrefKey } from '../src/hooks/useStoredSort';
import { makeShopState } from './support/shopState';
import { makeMarketState } from './support/marketState';

// Every trade reloads the game page, which remounts the whole UI: a sort kept
// only in component state was lost after each purchase or sale. Each list now
// keeps its own; these remount a list and expect the order to survive.

const names = (c: Element) => [...c.querySelectorAll('.lc-mkt-row .lc-mkt-name')].map((n) => n.textContent);

describe('stored list sorts', () => {
  beforeEach(() => {
    for (const list of ['shop-buy', 'shop-sell', 'market-offer']) GM_setValue(sortPrefKey(list), '');
  });

  it('keeps the shop\'s buy sort across a remount', () => {
    GM_setValue(SHOP_TAB_KEY, 'buy');
    const first = render(<Shop state={makeShopState()} />);
    fireEvent.change(first.container.querySelector('.lc-inv-sort')!, { target: { value: 'price' } });
    fireEvent.click(first.container.querySelector('.lc-inv-dir')!);
    first.unmount();

    const { container } = render(<Shop state={makeShopState()} />);
    expect(names(container)).toEqual(['abrak', 'térkép', 'kaja']);
    expect(container.querySelector<HTMLSelectElement>('.lc-inv-sort')!.value).toBe('price');
  });

  it('keeps each list\'s sort apart', () => {
    GM_setValue(SHOP_TAB_KEY, 'buy');
    const shop = render(<Shop state={makeShopState()} />);
    fireEvent.change(shop.container.querySelector('.lc-inv-sort')!, { target: { value: 'price' } });
    shop.unmount();

    GM_setValue(SHOP_TAB_KEY, 'sell');
    const { container } = render(<Shop state={makeShopState()} />);
    expect(container.querySelector<HTMLSelectElement>('.lc-inv-sort')!.value).toBe('name');
  });

  it('keeps the market\'s offer sort across a remount', () => {
    GM_setValue(MARKET_TAB_KEY, 'offer');
    const first = render(<Market state={makeMarketState()} />);
    fireEvent.change(first.container.querySelector('.lc-inv-sort')!, { target: { value: 'percent' } });
    first.unmount();

    const { container } = render(<Market state={makeMarketState()} />);
    expect(container.querySelector<HTMLSelectElement>('.lc-inv-sort')!.value).toBe('percent');
  });

  it('ignores a stored key the list does not offer', () => {
    GM_setValue(sortPrefKey('shop-buy'), JSON.stringify({ key: 'nonsense', asc: false }));
    GM_setValue(SHOP_TAB_KEY, 'buy');
    const { container } = render(<Shop state={makeShopState()} />);
    expect(names(container)).toEqual(['abrak', 'kaja', 'térkép']);
  });
});

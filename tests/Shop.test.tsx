import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/preact';
import { Shop } from '../src/pages/Shop';
import { ShopPanel } from '../src/desktop/ShopPanel';
import { SHOP_MINIMIZED_KEY, SHOP_TAB_KEY } from '../src/utils/config';
import { buyItem, makeShopState, sellItem } from './support/shopState';

/** The tab strip's button whose label matches (toolbars name the lists too). */
function tab(name: RegExp): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('.lc-home-tab')].find((b) => name.test(b.textContent ?? ''));
  if (!found) throw new Error(`no shop tab matching ${name}`);
  return found;
}

function rowFor(container: Element, name: string): Element {
  const row = [...container.querySelectorAll('.lc-mkt-row')]
    .find((r) => r.querySelector('.lc-mkt-name')?.textContent?.trim() === name);
  if (!row) throw new Error(`no shop row for ${name}`);
  return row;
}

const qtyInput = (row: Element) => row.querySelector<HTMLInputElement>('.lc-mkt-field input')!;

describe('Shop (mobile) — tabs', () => {
  beforeEach(() => { GM_setValue(SHOP_TAB_KEY, ''); });

  it('opens on buying, with a tab per job', () => {
    render(<Shop state={makeShopState()} />);
    expect(tab(/Vétel/).classList.contains('lc-home-tab--active')).toBe(true);
    expect(tab(/Eladás/)).toBeTruthy();
    expect(tab(/Egyéb/)).toBeTruthy();
  });

  it('remembers the tab across the reload a trade causes', () => {
    render(<Shop state={makeShopState()} />);
    fireEvent.click(tab(/Eladás/));
    expect(GM_getValue(SHOP_TAB_KEY, '')).toBe('sell');
  });

  it('gives the Templom no selling tab, even when selling was the stored tab', () => {
    GM_setValue(SHOP_TAB_KEY, 'sell');
    const { container } = render(<Shop state={makeShopState({ kind: 'church', title: 'Templom', sell: [] })} />);
    expect(container.textContent).not.toContain('Eladás');
    expect(tab(/Vétel/).classList.contains('lc-home-tab--active')).toBe(true);
  });

  it('shows the Templom\'s ailments and prayers on its own tab', () => {
    const pray = { label: 'Elmondasz egy imát átok ellen', iconUrl: '', trigger: vi.fn() };
    const { container } = render(<Shop state={makeShopState({ kind: 'church', sell: [], ailments: 'Mérgezett vagy', actions: { exit: null, stowWorn: null, other: [pray] } })} />);
    fireEvent.click(tab(/Templom/));

    expect(container.querySelector('.lc-shop-ailments')!.textContent).toContain('Mérgezett vagy');
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent?.includes('átok ellen'))!);
    expect(pray.trigger).toHaveBeenCalled();
  });
});

describe('Shop — buying', () => {
  beforeEach(() => { GM_setValue(SHOP_TAB_KEY, 'buy'); });

  it('buys the typed quantity of a row, one by default', () => {
    const state = makeShopState();
    const { container } = render(<Shop state={state} />);
    const row = rowFor(container, 'térkép');

    fireEvent.click(row.querySelector('.lc-mkt-buy-btn')!);
    fireEvent.input(qtyInput(row), { target: { value: '3' } });
    fireEvent.click(row.querySelector('.lc-mkt-buy-btn')!);

    expect(state.purchase).toHaveBeenNthCalledWith(1, state.buy[1], 1);
    expect(state.purchase).toHaveBeenNthCalledWith(2, state.buy[1], 3);
  });

  it('marks a total beyond the money on hand without blocking it', () => {
    const state = makeShopState({ gold: 100 });
    const { container } = render(<Shop state={state} />);
    const row = rowFor(container, 'abrak');

    expect(row.querySelector('.lc-mkt-total--short')).toBeTruthy();
    expect(row.querySelector<HTMLButtonElement>('.lc-mkt-buy-btn')!.disabled).toBe(false);
  });

  it('shows the market price when one is known', () => {
    const state = makeShopState({ buy: [buyItem('kaja', 0, 2, { marketPrice: 60 })] });
    const { container } = render(<Shop state={state} />);
    expect(rowFor(container, 'kaja').querySelector('.lc-shop-market')!.textContent).toContain('60');
  });

  it('filters by name, accent-insensitively', () => {
    const { container } = render(<Shop state={makeShopState()} />);
    fireEvent.input(container.querySelector('.lc-mkt-search')!, { target: { value: 'terk' } });
    expect([...container.querySelectorAll('.lc-mkt-name')].map((n) => n.textContent)).toEqual(['térkép']);
  });
});

describe('Shop — selling', () => {
  beforeEach(() => { GM_setValue(SHOP_TAB_KEY, 'sell'); });

  it('sells one unit of a row by default, never the whole stack unasked', () => {
    const state = makeShopState();
    const { container } = render(<Shop state={state} />);

    fireEvent.click(rowFor(container, 'sárkánykarom').querySelector('.lc-mkt-offer-btn')!);

    expect(state.sellOne).toHaveBeenCalledWith(state.sell[1], 1);
  });

  it('shows the shop price beside the market price', () => {
    const { container } = render(<Shop state={makeShopState()} />);
    const meta = rowFor(container, 'sárkánykarom').querySelector('.lc-mkt-meta')!.textContent!;
    expect(meta).toContain('elad. ár 405');
    expect(meta).toContain('piaci ár 24');
  });

  it('offers a tick box only where the page allows a bulk sale', () => {
    const { container } = render(<Shop state={makeShopState()} />);
    expect(rowFor(container, 'arany').querySelector('input[type="checkbox"]')).toBeTruthy();
    expect(rowFor(container, 'mengorni kard').querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('sums the ticked stacks and sells them on the second press only', () => {
    const state = makeShopState();
    const { container } = render(<Shop state={state} />);
    fireEvent.click(rowFor(container, 'arany').querySelector('input[type="checkbox"]')!);
    fireEvent.click(rowFor(container, 'sárkánykarom').querySelector('input[type="checkbox"]')!);

    // 88 × 10 + 11 × 405
    expect(container.querySelector('.lc-shop-bulk-sum')!.textContent).toMatch(/2 tétel — összesen 5\s?335/);

    const sell = container.querySelector<HTMLButtonElement>('.lc-shop-bulk-sell')!;
    fireEvent.click(sell);
    expect(state.sellMany).not.toHaveBeenCalled();
    expect(sell.textContent).toContain('Biztosan');
    fireEvent.click(sell);
    expect(state.sellMany).toHaveBeenCalledWith([state.sell[0], state.sell[1]]);
  });

  it('keeps every tick when several land before a re-render', () => {
    const { container } = render(<Shop state={makeShopState()} />);
    const boxes = [...container.querySelectorAll<HTMLInputElement>('.lc-mkt-row input[type="checkbox"]')];
    // Dispatched back to back inside one act(), so no render runs between them —
    // as with quick taps.
    act(() => { boxes.forEach((box) => box.dispatchEvent(new Event('change', { bubbles: true }))); });
    expect(container.querySelector('.lc-shop-bulk-sum')!.textContent).toContain('2 tétel');
  });

  it('disarms the bulk sale when the selection changes', () => {
    const state = makeShopState();
    const { container } = render(<Shop state={state} />);
    fireEvent.click(rowFor(container, 'arany').querySelector('input[type="checkbox"]')!);
    fireEvent.click(container.querySelector('.lc-shop-bulk-sell')!);
    fireEvent.click(rowFor(container, 'sárkánykarom').querySelector('input[type="checkbox"]')!);
    fireEvent.click(container.querySelector('.lc-shop-bulk-sell')!);

    expect(state.sellMany).not.toHaveBeenCalled();
  });

  it('ticks every visible bulk-sellable row at once', () => {
    const state = makeShopState();
    const { container } = render(<Shop state={state} />);
    fireEvent.click(container.querySelector('.lc-shop-bulk-all')!);
    expect(container.querySelector('.lc-shop-bulk-sum')!.textContent).toContain('2 tétel');
  });

  it('dims an item this shop will not buy and disables its sale', () => {
    const state = makeShopState({ sell: [sellItem('bot', 1, 3, { index: 0, sellable: false })] });
    const { container } = render(<Shop state={state} />);
    const row = rowFor(container, 'bot');

    expect(row.classList.contains('lc-shop-row--inactive')).toBe(true);
    expect(row.querySelector<HTMLButtonElement>('.lc-mkt-offer-btn')!.disabled).toBe(true);
    expect(qtyInput(row).disabled).toBe(true);
    expect(row.querySelector('input[type="checkbox"]')).toBeNull();
    fireEvent.click(row.querySelector('.lc-mkt-offer-btn')!);
    expect(state.sellOne).not.toHaveBeenCalled();
  });

  it('sinks what this shop will not buy to the end, whichever way the list is sorted', () => {
    const state = makeShopState({
      sell: [
        sellItem('arany', 88, 10, { index: 0, bulkIndex: 2 }),
        sellItem('bot', 1, 3, { index: 1, sellable: false }),
        sellItem('sárkánykarom', 11, 405, { index: 2, bulkIndex: 21 }),
      ],
    });
    const { container } = render(<Shop state={state} />);
    const names = () => [...container.querySelectorAll('.lc-mkt-name')].map((n) => n.textContent);

    expect(names()).toEqual(['arany', 'sárkánykarom', 'bot']);
    fireEvent.click(container.querySelector('.lc-inv-dir')!);
    expect(names()).toEqual(['sárkánykarom', 'arany', 'bot']);
  });

  it('keeps a bulk-only row sellable in bulk but not singly', () => {
    const state = makeShopState({ sell: [sellItem('madártoll', 4, null, { index: null, bulkIndex: 6 })] });
    const { container } = render(<Shop state={state} />);
    const row = rowFor(container, 'madártoll');
    expect(row.querySelector<HTMLButtonElement>('.lc-mkt-offer-btn')!.disabled).toBe(true);
    expect(row.querySelector('input[type="checkbox"]')).toBeTruthy();
  });
});

describe('ShopPanel (desktop)', () => {
  beforeEach(() => {
    GM_setValue(SHOP_TAB_KEY, '');
    GM_setValue(SHOP_MINIMIZED_KEY, '');
  });

  it('renders nothing when closed', () => {
    const { container } = render(<ShopPanel open={false} state={makeShopState()} onClose={() => {}} />);
    expect(container.querySelector('.lc-db-overlay')).toBeNull();
  });

  it('is titled by the shop and switches between buying and selling', () => {
    render(<ShopPanel open state={makeShopState()} onClose={() => {}} />);
    expect(document.body.textContent).toContain('Vegyesbolt');
    fireEvent.click(tab(/Eladás/));
    expect(document.querySelector('.lc-shop-bulk')).toBeTruthy();
    expect(GM_getValue(SHOP_TAB_KEY, '')).toBe('sell');
  });

  it('leaves the Templom\'s prayers on the game page', () => {
    const pray = { label: 'Elmondasz egy imát átok ellen', iconUrl: '', trigger: () => {} };
    render(<ShopPanel open state={makeShopState({ kind: 'church', sell: [], actions: { exit: null, stowWorn: null, other: [pray] } })} onClose={() => {}} />);
    expect(document.body.textContent).not.toContain('átok ellen');
  });
});

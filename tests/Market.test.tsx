import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { Market } from '../src/pages/Market';
import { MARKET_TAB_KEY } from '../src/utils/config';
import { makeMarketState, purchase } from './support/marketState';

/**
 * The tab strip's button whose label matches. Not getByRole: the column
 * toolbars carry aria-labels naming the same columns ("Felkínálható tárgyak
 * sorrendje"), so a role query matches those too.
 */
function tab(name: RegExp): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('.lc-home-tab')]
    .find(b => name.test(b.textContent ?? ''));
  if (!found) throw new Error(`no market tab matching ${name}`);
  return found;
}

describe('Market (mobile)', () => {
  beforeEach(() => { GM_setValue(MARKET_TAB_KEY, ''); });

  it('opens on the offerable backpack', () => {
    const { container } = render(<Market state={makeMarketState()} />);
    // Selling is what the market is mostly used for, and it is the only tab
    // whose contents are there without asking the game for anything.
    expect(container.querySelectorAll('.lc-mkt-row').length).toBe(3);
    expect(screen.getAllByText('Felkínál')).toHaveLength(3);
  });

  it('shows one tab at a time', () => {
    const { container } = render(<Market state={makeMarketState()} />);

    fireEvent.click(tab(/Felkínált/));

    expect(container.querySelector('.lc-mkt-offer-btn')).toBeNull();
    expect(container.querySelector('.lc-mkt-revoke-btn')).toBeTruthy();
  });

  it('counts what each selling tab holds', () => {
    render(<Market state={makeMarketState()} />);
    expect(tab(/Felkínálható/).textContent).toContain('3');
    expect(tab(/Felkínált/).textContent).toContain('1');
  });

  it('reaches the purchase view', () => {
    const { container } = render(<Market state={makeMarketState()} />);

    fireEvent.click(tab(/Vétel/));

    expect(container.querySelector('.lc-mkt-buy-search')).toBeTruthy();
  });

  it('reaches the market\'s other actions', () => {
    const trigger = vi.fn();
    const state = makeMarketState({
      actions: {
        exit: { label: 'Elhagyod a piacot', iconUrl: 'x.gif', trigger },
        collectMoney: null,
        settings: null,
        special: [],
      },
    });
    render(<Market state={state} />);

    fireEvent.click(tab(/Egyéb/));
    fireEvent.click(screen.getByTitle('Elhagyod a piacot'));

    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('remembers the tab, so a purchase search comes back where it left', () => {
    // The search reloads the game page; the page is then rendered from scratch,
    // and this is the only thing that carries the player's place across it.
    const { unmount } = render(<Market state={makeMarketState()} />);
    fireEvent.click(tab(/Vétel/));
    unmount();

    const { container } = render(<Market state={makeMarketState()} />);
    expect(container.querySelector('.lc-mkt-buy-search')).toBeTruthy();
  });

  it('shows the money and the backpack load', () => {
    const { container } = render(<Market state={makeMarketState()} />);
    expect(container.querySelector('.lc-mkt-gold')!.textContent).toContain('853');
    expect(container.querySelector('.lc-cap')).toBeTruthy();
  });

  it('shows what the sales earned, without opening a tab for it', () => {
    // The reason to come back to the market at all, so it sits in the always
    // visible stats row rather than behind the Egyéb tab.
    const state = makeMarketState({
      earnings: 7810,
      actions: {
        exit: null,
        collectMoney: { label: 'Felveszed a pénzt', iconUrl: 'p.gif', trigger: vi.fn() },
        settings: null,
        special: [],
      },
    });
    const { container } = render(<Market state={state} />);
    expect(container.querySelector('.lc-mkt-earnings')!.textContent).toContain('7810');
  });

  it('collects the earnings straight from that badge', () => {
    const trigger = vi.fn();
    const state = makeMarketState({
      earnings: 7810,
      actions: {
        exit: null,
        collectMoney: { label: 'Felveszed a pénzt', iconUrl: 'p.gif', trigger },
        settings: null,
        special: [],
      },
    });
    const { container } = render(<Market state={state} />);

    fireEvent.click(container.querySelector('.lc-mkt-earnings')!);

    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('still shows the amount when the page printed no collect button', () => {
    // Whether the figure is visible cannot depend on the control: the question
    // it answers ("is there anything waiting?") is the same either way.
    const { container } = render(<Market state={makeMarketState({ earnings: 7810 })} />);
    const badge = container.querySelector('.lc-mkt-earnings')!;
    expect(badge.tagName).toBe('SPAN');
    expect(badge.textContent).toContain('7810');
  });

  it('says nothing when there is nothing to collect', () => {
    const { container } = render(<Market state={makeMarketState({ earnings: 0 })} />);
    expect(container.querySelector('.lc-mkt-earnings')).toBeNull();
  });

  it('shows the narration, where the game reports a completed sale', () => {
    const state = makeMarketState({ narration: 'Megvették a következő cuccaidat: 1 démongyapjú' });
    render(<Market state={state} />);
    expect(screen.getByText(/Megvették/)).toBeTruthy();
  });

  it('opens the item database from a purchase row', () => {
    const state = makeMarketState({
      searchedName: 'jáspis',
      purchases: [purchase('jáspis', 0, { quantity: 7, unitPrice: 80, shopPrice: 50 })],
    });
    const { container } = render(<Market state={state} />);

    fireEvent.click(tab(/Vétel/));
    fireEvent.click(container.querySelector('.lc-mkt-name--link')!);

    expect(container.querySelector('.lc-db-overlay')).toBeTruthy();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { MarketBuy } from '../src/components/MarketBuy';
import { entry, makeMarketState, purchase } from './support/marketState';

/** Types `text` into the catalogue filter. */
function filter(container: Element, text: string): void {
  const input = container.querySelector<HTMLInputElement>('.lc-mkt-buy-search')!;
  fireEvent.input(input, { target: { value: text } });
}

function catalogueRows(container: Element): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>('.lc-mkt-cat-row')];
}

describe('MarketBuy — catalogue', () => {
  it('lists nothing until the search is narrowed', () => {
    // The live catalogue is 1424 items; rendering it whole is no more usable
    // than the game's own dropdown, which is what this view replaces.
    const { container } = render(<MarketBuy state={makeMarketState()} onOpenDetail={vi.fn()} />);
    expect(catalogueRows(container)).toHaveLength(0);
    expect(screen.getByText(/legalább 2 betűt/i)).toBeTruthy();
  });

  it('finds an item regardless of accents', () => {
    const state = makeMarketState({ catalogue: [entry('41', 'vámpír kard', 300), entry('94', 'agyar', 565)] });
    const { container } = render(<MarketBuy state={state} onOpenDetail={vi.fn()} />);

    filter(container, 'vampir');

    expect(catalogueRows(container).map(r => r.textContent)).toEqual([expect.stringContaining('vámpír kard')]);
  });

  it('shows what the market pays for a match', () => {
    const { container } = render(<MarketBuy state={makeMarketState()} onOpenDetail={vi.fn()} />);
    filter(container, 'jásp');
    expect(catalogueRows(container)[0].textContent).toContain('170%');
  });

  it('searches the market when a match is picked', () => {
    const state = makeMarketState();
    const { container } = render(<MarketBuy state={state} onOpenDetail={vi.fn()} />);

    filter(container, 'agyar');
    fireEvent.click(catalogueRows(container)[0]);

    expect(state.search).toHaveBeenCalledWith(state.catalogue[1]);
  });

  it('caps the matches and says how many it left out', () => {
    const catalogue = Array.from({ length: 40 }, (_, i) => entry(String(i), `kenyér ${i}`, 100));
    const { container } = render(<MarketBuy state={makeMarketState({ catalogue })} onOpenDetail={vi.fn()} />);

    filter(container, 'kenyér');

    // Capped rather than truncated silently: the count says what is missing, so
    // a narrower search is an obvious next step.
    expect(catalogueRows(container)).toHaveLength(20);
    expect(screen.getByText(/még 20/i)).toBeTruthy();
  });

  it('says so when nothing matches', () => {
    const { container } = render(<MarketBuy state={makeMarketState()} onOpenDetail={vi.fn()} />);
    filter(container, 'nincsilyen');
    expect(screen.getByText(/nincs ilyen tárgy/i)).toBeTruthy();
  });
});

describe('MarketBuy — offers', () => {
  const state = () => makeMarketState({
    searchedName: 'jáspis',
    purchases: [
      purchase('jáspis', 0, { quantity: 7, unitPrice: 80, shopPrice: 50, percent: 170 }),
      purchase('jáspis', 1, { quantity: 2, unitPrice: 95, shopPrice: 50, percent: 170 }),
    ],
  });

  it('invites a search when none has been made', () => {
    render(<MarketBuy state={makeMarketState()} onOpenDetail={vi.fn()} />);
    expect(screen.getByText(/keress rá/i)).toBeTruthy();
  });

  it('names the item the offers belong to', () => {
    const { container } = render(<MarketBuy state={state()} onOpenDetail={vi.fn()} />);
    expect(container.querySelector('.lc-mkt-buy-head')!.textContent).toContain('jáspis');
  });

  it('says when the searched item has no offers', () => {
    render(<MarketBuy state={makeMarketState({ searchedName: 'jáspis', purchases: [] })} onOpenDetail={vi.fn()} />);
    expect(screen.getByText(/nincs eladó/i)).toBeTruthy();
  });

  it('shows each offer with its stock, asking price and shop price', () => {
    const { container } = render(<MarketBuy state={state()} onOpenDetail={vi.fn()} />);
    const row = container.querySelectorAll('.lc-mkt-row')[0];

    expect(row.textContent).toContain('7 db');
    expect(row.textContent).toContain('80');   // asking price, per unit
    expect(row.textContent).toContain('50');   // the item's shop price
  });

  it('buys one unit by default', () => {
    const s = state();
    const { container } = render(<MarketBuy state={s} onOpenDetail={vi.fn()} />);

    fireEvent.click(container.querySelectorAll('.lc-mkt-buy-btn')[0]);

    // One, not the whole stack: unlike offering, this spends money.
    expect(s.purchases[0].buy).toHaveBeenCalledWith(1);
  });

  it('buys the quantity typed into the row', () => {
    const s = state();
    const { container } = render(<MarketBuy state={s} onOpenDetail={vi.fn()} />);
    const row = container.querySelectorAll('.lc-mkt-row')[0];

    fireEvent.input(row.querySelector('input[type="number"]')!, { target: { value: '3' } });
    fireEvent.click(row.querySelector('.lc-mkt-buy-btn')!);

    expect(s.purchases[0].buy).toHaveBeenCalledWith(3);
  });

  it('clamps the typed quantity to what is on offer', () => {
    const s = state();
    const { container } = render(<MarketBuy state={s} onOpenDetail={vi.fn()} />);
    const row = container.querySelectorAll('.lc-mkt-row')[1];

    fireEvent.input(row.querySelector('input[type="number"]')!, { target: { value: '99' } });
    fireEvent.click(row.querySelector('.lc-mkt-buy-btn')!);

    expect(s.purchases[1].buy).toHaveBeenCalledWith(2);
  });

  it('totals the purchase as the quantity changes', () => {
    const { container } = render(<MarketBuy state={state()} onOpenDetail={vi.fn()} />);
    const row = container.querySelectorAll('.lc-mkt-row')[0];

    fireEvent.input(row.querySelector('input[type="number"]')!, { target: { value: '3' } });

    expect(row.querySelector('.lc-mkt-total')!.textContent).toContain('240');
  });

  it('marks a total you cannot afford, without blocking the purchase', () => {
    // The money is parsed off the page, so a bad parse must not stop a trade the
    // game itself would allow — the warning is advice, not a gate.
    const s = makeMarketState({
      gold: 100,
      searchedName: 'jáspis',
      purchases: [purchase('jáspis', 0, { quantity: 7, unitPrice: 80, shopPrice: 50 })],
    });
    const { container } = render(<MarketBuy state={s} onOpenDetail={vi.fn()} />);
    const row = container.querySelector('.lc-mkt-row')!;

    fireEvent.input(row.querySelector('input[type="number"]')!, { target: { value: '3' } });

    expect(row.querySelector('.lc-mkt-total--short')).toBeTruthy();
    expect(row.querySelector<HTMLButtonElement>('.lc-mkt-buy-btn')!.disabled).toBe(false);
  });

  it('opens the database on an offered item', () => {
    const onOpenDetail = vi.fn();
    const { container } = render(<MarketBuy state={state()} onOpenDetail={onOpenDetail} />);

    fireEvent.click(container.querySelector('.lc-mkt-name--link')!);

    expect(onOpenDetail).toHaveBeenCalledWith('jáspis');
  });
});

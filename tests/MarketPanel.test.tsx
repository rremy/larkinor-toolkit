import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { MarketPanel } from '../src/desktop/MarketPanel';
import { MARKET_MINIMIZED_KEY } from '../src/utils/config';
import type { MarketItem, MarketListing, MarketState } from '../src/utils/marketExtract';

function item(name: string, amount: number, price: number | null, percent: number | null, index: number): MarketItem {
  const suggestedPrice = price === null ? null : Math.round((price * (percent ?? 500)) / 100);
  return {
    name, amount, index, price, pricePercent: percent, suggestedPrice,
    type: 'tárgy', weight: 0.04, totalWeight: 0.04 * amount, magical: false, attrs: [],
  };
}

function listing(
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

/** Real figures from the live page: jáspis 50 ezüst at 170% → 85. */
function makeState(overrides: Partial<MarketState> = {}): MarketState {
  return {
    items: [
      item('ezüst', 5725, null, null, 0),
      item('jáspis', 19, 50, 170, 2),
      item('gyíkbőr', 7, 10, 120, 3),
    ],
    listings: [listing('6 db. agyar 700 ezüst/db. áron', 1, 'agyar', 565, { quantity: 6, unitPrice: 700, shopPrice: 124 })],
    offer: vi.fn(),
    ...overrides,
  };
}

/** The row for a given item name. */
function rowFor(container: Element, name: string): Element {
  const row = [...container.querySelectorAll('.lc-mkt-row')]
    .find(r => r.querySelector('.lc-mkt-name')?.textContent?.trim() === name);
  if (!row) throw new Error(`no market row for ${name}`);
  return row;
}

describe('MarketPanel', () => {
  beforeEach(() => { GM_setValue(MARKET_MINIMIZED_KEY, ''); });

  it('renders nothing when closed', () => {
    const { container } = render(<MarketPanel open={false} state={makeState()} onClose={vi.fn()} />);
    expect(container.querySelector('.lc-db-overlay')).toBeNull();
  });

  it('shows what can be offered and what already is, side by side', () => {
    const { container } = render(<MarketPanel open state={makeState()} onClose={vi.fn()} />);
    expect(container.querySelectorAll('.lc-home-col').length).toBe(2);
    expect(screen.getByText('jáspis')).toBeTruthy();
    expect(screen.getByText('6 db. agyar 700 ezüst/db. áron')).toBeTruthy();
  });

  it('pre-fills the price from the market percentage and the quantity from the stack', () => {
    const { container } = render(<MarketPanel open state={makeState()} onClose={vi.fn()} />);
    const inputs = rowFor(container, 'jáspis').querySelectorAll<HTMLInputElement>('input');

    expect(inputs[0].value).toBe('19'); // whole stack
    expect(inputs[1].value).toBe('85'); // 50 × 170%
  });

  it('shows the shop price and the market price side by side', () => {
    // The shop price is the alternative to selling here, so the two need to be
    // comparable without reading the market figure out of the Ár input.
    const { container } = render(<MarketPanel open state={makeState()} onClose={vi.fn()} />);
    const meta = rowFor(container, 'jáspis').querySelector('.lc-mkt-meta')!.textContent!;

    expect(meta).toContain('bolti ár 50');
    expect(meta).toContain('piaci ár 85');
  });

  it('shows no market price for an item the market does not price', () => {
    const { container } = render(<MarketPanel open state={makeState()} onClose={vi.fn()} />);
    const meta = rowFor(container, 'ezüst').querySelector('.lc-mkt-meta')!.textContent!;

    expect(meta).not.toContain('piaci ár');
    expect(meta).not.toContain('bolti ár');
  });

  it('marks an assumed rate as ours rather than the market\'s', () => {
    // bölényszakáll is priced but unquoted on the live page: the suggestion is
    // then a guess and must not read as the game's own figure.
    const state = makeState({ items: [item('bölényszakáll', 5, 40, null, 4)] });
    const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);
    const badge = container.querySelector('.lc-mkt-pct')!;

    expect(badge.textContent).toBe('500%?');
    expect(badge.classList.contains('lc-mkt-pct--assumed')).toBe(true);
    // 40 x 500%
    expect(container.querySelectorAll<HTMLInputElement>('.lc-mkt-field input')[1].value).toBe('200');
  });

  it('shows no rate badge at all when there is no price to scale', () => {
    const { container } = render(<MarketPanel open state={makeState()} onClose={vi.fn()} />);
    expect(rowFor(container, 'ezüst').querySelector('.lc-mkt-pct')).toBeNull();
  });

  it('shows the market percentage so the suggested price is explainable', () => {
    const { container } = render(<MarketPanel open state={makeState()} onClose={vi.fn()} />);
    expect(rowFor(container, 'jáspis').querySelector('.lc-mkt-pct')!.textContent).toBe('170%');
  });

  it('offers the pre-filled values in one click', () => {
    const state = makeState();
    const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);

    fireEvent.click(rowFor(container, 'jáspis').querySelector<HTMLElement>('.lc-mkt-offer-btn')!);

    expect(state.offer).toHaveBeenCalledTimes(1);
    const [offered, qty, price] = vi.mocked(state.offer).mock.calls[0];
    expect(offered.name).toBe('jáspis');
    expect(qty).toBe(19);
    expect(price).toBe(85);
  });

  it('offers the edited values', () => {
    const state = makeState();
    const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);
    const row = rowFor(container, 'jáspis');
    const inputs = row.querySelectorAll<HTMLInputElement>('input');

    fireEvent.input(inputs[0], { target: { value: '5' } });
    fireEvent.input(inputs[1], { target: { value: '120' } });
    fireEvent.click(row.querySelector<HTMLElement>('.lc-mkt-offer-btn')!);

    const [, qty, price] = vi.mocked(state.offer).mock.calls[0];
    expect(qty).toBe(5);
    expect(price).toBe(120);
  });

  it('clamps a quantity above the stack', () => {
    const state = makeState();
    const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);
    const row = rowFor(container, 'jáspis');

    fireEvent.input(row.querySelectorAll<HTMLInputElement>('input')[0], { target: { value: '999' } });
    fireEvent.click(row.querySelector<HTMLElement>('.lc-mkt-offer-btn')!);

    expect(vi.mocked(state.offer).mock.calls[0][1]).toBe(19);
  });

  it('will not offer an item it cannot price', () => {
    // Silver has no Ár, so there is nothing to suggest and no valid offer.
    const state = makeState();
    const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);
    const button = rowFor(container, 'ezüst').querySelector<HTMLButtonElement>('.lc-mkt-offer-btn')!;

    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(state.offer).not.toHaveBeenCalled();
  });

  it('revokes a standing offer', () => {
    const state = makeState();
    const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);

    fireEvent.click(container.querySelector<HTMLElement>('.lc-mkt-revoke-btn')!);
    expect(state.listings[0].revoke).toHaveBeenCalledTimes(1);
  });

  it('filters the offerable list', () => {
    const { container } = render(<MarketPanel open state={makeState()} onClose={vi.fn()} />);
    fireEvent.input(screen.getByLabelText('Keresés a felkínálható tárgyak között'), { target: { value: 'jás' } });

    const names = [...container.querySelectorAll('.lc-mkt-name')].map(e => e.textContent?.trim());
    expect(names).toContain('jáspis');
    expect(names).not.toContain('ezüst');
  });

  it('finds an accented name typed without accents', () => {
    const { container } = render(<MarketPanel open state={makeState()} onClose={vi.fn()} />);
    fireEvent.input(screen.getByLabelText('Keresés a felkínálható tárgyak között'), { target: { value: 'gyikbor' } });

    const names = [...container.querySelectorAll('.lc-mkt-name')].map(e => e.textContent?.trim());
    expect(names).toContain('gyíkbőr');
    expect(names).not.toContain('jáspis');
  });

  describe('item names open the item detail', () => {
    it('opens the database on an offerable item', () => {
      const { container } = render(<MarketPanel open state={makeState()} onClose={vi.fn()} />);
      expect(document.querySelectorAll('.lc-db-overlay').length).toBe(1);

      fireEvent.click(rowFor(container, 'jáspis').querySelector<HTMLElement>('.lc-mkt-name--link')!);

      // The detail stacks above the market rather than replacing it.
      expect(document.querySelectorAll('.lc-db-overlay').length).toBe(2);
      expect(container.querySelector('.lc-home-split')).not.toBeNull();
    });

    it('opens the database from a standing offer', () => {
      const { container } = render(<MarketPanel open state={makeState()} onClose={vi.fn()} />);
      const offersCol = container.querySelectorAll('.lc-home-col')[1];

      fireEvent.click(offersCol.querySelector<HTMLElement>('.lc-mkt-name--link')!);
      expect(document.querySelectorAll('.lc-db-overlay').length).toBe(2);
    });

    it('leaves an offer we could not parse a name from as plain text', () => {
      const state = makeState({ listings: [listing('valami furcsa sor', 0)] });
      const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);
      const offersCol = container.querySelectorAll('.lc-home-col')[1];

      expect(offersCol.querySelector('.lc-mkt-name--link')).toBeNull();
      expect(offersCol.textContent).toContain('valami furcsa sor');
    });

    it('closes the detail and leaves the market open', () => {
      const onClose = vi.fn();
      const { container } = render(<MarketPanel open state={makeState()} onClose={onClose} />);
      fireEvent.click(rowFor(container, 'jáspis').querySelector<HTMLElement>('.lc-mkt-name--link')!);

      const closers = document.querySelectorAll('.lc-db-overlay-close');
      fireEvent.click(closers[closers.length - 1] as HTMLElement);

      expect(document.querySelectorAll('.lc-db-overlay').length).toBe(1);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it('shows the market percentage on a standing offer, as the offerable rows do', () => {
    // Same badge, so an asking price in the label can be judged against what the
    // market actually pays.
    const { container } = render(<MarketPanel open state={makeState()} onClose={vi.fn()} />);
    const offers = container.querySelectorAll('.lc-home-col')[1];

    expect(offers.querySelector('.lc-mkt-pct')!.textContent).toBe('565%');
  });

  it('omits the badge on an offer with no percentage to show', () => {
    const state = makeState({ listings: [listing('valami furcsa sor', 0)] });
    const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);
    const offers = container.querySelectorAll('.lc-home-col')[1];

    expect(offers.querySelector('.lc-mkt-pct')).toBeNull();
  });

  it('renders offers in the same shape as the offerable rows, but inert', () => {
    const { container } = render(<MarketPanel open state={makeState()} onClose={vi.fn()} />);
    const offer = container.querySelectorAll('.lc-home-col')[1].querySelector('.lc-mkt-row')!;
    const inputs = offer.querySelectorAll<HTMLInputElement>('.lc-mkt-field input');

    // Same two fields, carrying the offer's own figures.
    expect(inputs).toHaveLength(2);
    expect(inputs[0].value).toBe('6');    // quantity offered
    expect(inputs[1].value).toBe('700');  // asking price
    // A standing offer cannot be edited — the game only lets you revoke it.
    expect(inputs[0].disabled).toBe(true);
    expect(inputs[1].disabled).toBe(true);
  });

  it('compares an offer\'s asking price against the shop and market prices', () => {
    const { container } = render(<MarketPanel open state={makeState()} onClose={vi.fn()} />);
    const meta = container.querySelectorAll('.lc-home-col')[1].querySelector('.lc-mkt-meta')!.textContent!;

    expect(meta).toContain('bolti ár 124');
    expect(meta).toContain('piaci ár 701');   // 124 x 565%
    // Hungarian groups from five digits, so 4200 carries no separator.
    expect(meta).toContain('összesen 4200'); // 700 x 6, the asking total
  });

  describe('searching the standing offers', () => {
    const OFFERS = [
      listing('6 db. agyar 700 ezüst/db. áron', 0, 'agyar', 565, { quantity: 6, unitPrice: 700 }),
      listing('1 db. acélpajzs 7000 ezüst/db. áron', 1, 'acélpajzs', 2258, { quantity: 1, unitPrice: 7000 }),
      listing('19 db. gyíkbőr 50 ezüst/db. áron', 2, 'gyíkbőr', 500, { quantity: 19, unitPrice: 50 }),
    ];

    it('filters the offers by name', () => {
      const { container } = render(<MarketPanel open state={makeState({ listings: OFFERS })} onClose={vi.fn()} />);
      fireEvent.input(screen.getByLabelText('Keresés a felkínált tárgyaim között'), { target: { value: 'agyar' } });

      const offers = container.querySelectorAll('.lc-home-col')[1].querySelectorAll('.lc-mkt-row');
      expect(offers).toHaveLength(1);
      expect(offers[0].textContent).toContain('agyar');
    });

    it('ignores accents, like every other search', () => {
      const { container } = render(<MarketPanel open state={makeState({ listings: OFFERS })} onClose={vi.fn()} />);
      fireEvent.input(screen.getByLabelText('Keresés a felkínált tárgyaim között'), { target: { value: 'acelpajzs' } });

      const offers = container.querySelectorAll('.lc-home-col')[1].querySelectorAll('.lc-mkt-row');
      expect(offers).toHaveLength(1);
      expect(offers[0].textContent).toContain('acélpajzs');
    });

    it('matches on the price too, the whole label being searched', () => {
      const { container } = render(<MarketPanel open state={makeState({ listings: OFFERS })} onClose={vi.fn()} />);
      fireEvent.input(screen.getByLabelText('Keresés a felkínált tárgyaim között'), { target: { value: '7000' } });

      const offers = container.querySelectorAll('.lc-home-col')[1].querySelectorAll('.lc-mkt-row');
      expect(offers).toHaveLength(1);
      expect(offers[0].textContent).toContain('acélpajzs');
    });

    it('says when nothing matched, distinctly from having nothing offered', () => {
      render(<MarketPanel open state={makeState({ listings: OFFERS })} onClose={vi.fn()} />);
      fireEvent.input(screen.getByLabelText('Keresés a felkínált tárgyaim között'), { target: { value: 'zzz' } });

      expect(screen.getByText('Nincs találat.')).toBeTruthy();
      expect(screen.queryByText('Nincs felkínált tárgyad.')).toBeNull();
    });

    it('offers no search box when there is nothing to search', () => {
      render(<MarketPanel open state={makeState({ listings: [] })} onClose={vi.fn()} />);
      expect(screen.queryByLabelText('Keresés a felkínált tárgyaim között')).toBeNull();
    });

    it('filters the two columns independently', () => {
      const { container } = render(<MarketPanel open state={makeState({ listings: OFFERS })} onClose={vi.fn()} />);
      fireEvent.input(screen.getByLabelText('Keresés a felkínált tárgyaim között'), { target: { value: 'agyar' } });

      // The offerable column keeps its full list.
      const offerable = container.querySelectorAll('.lc-home-col')[0].querySelectorAll('.lc-mkt-row');
      expect(offerable.length).toBe(3);
    });
  });

  it('says so when there is nothing offered yet', () => {
    render(<MarketPanel open state={makeState({ listings: [] })} onClose={vi.fn()} />);
    expect(screen.getByText('Nincs felkínált tárgyad.')).toBeTruthy();
  });

  it('docks beside the game like the other panels', () => {
    render(<MarketPanel open state={makeState()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Kis méret'));
    expect(document.querySelector('.lc-db-overlay')!.classList.contains('lc-db-overlay--minimized')).toBe(true);
  });
});

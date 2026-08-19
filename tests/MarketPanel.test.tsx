import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { MarketPanel } from '../src/desktop/MarketPanel';
import { MARKET_MINIMIZED_KEY, MARKET_TAB_KEY } from '../src/utils/config';
import type { MarketItem, MarketState } from '../src/utils/marketExtract';
import { item, listing, makeMarketState } from './support/marketState';
import { LoadoutContext } from '../src/components/LoadoutContext';
import { emptySlots, type Loadout } from '../src/shared/loadout';

/** The row for a given item name. */
function rowFor(container: Element, name: string): Element {
  const row = [...container.querySelectorAll('.lc-mkt-row')]
    .find(r => r.querySelector('.lc-mkt-name')?.textContent?.trim() === name);
  if (!row) throw new Error(`no market row for ${name}`);
  return row;
}

describe('MarketPanel', () => {
  beforeEach(() => {
    GM_setValue(MARKET_MINIMIZED_KEY, '');
    GM_setValue(MARKET_TAB_KEY, '');
  });

  it('renders nothing when closed', () => {
    const { container } = render(<MarketPanel open={false} state={makeMarketState()} onClose={vi.fn()} />);
    expect(container.querySelector('.lc-db-overlay')).toBeNull();
  });

  it('shows what can be offered and what already is, side by side', () => {
    const { container } = render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
    expect(container.querySelectorAll('.lc-home-col').length).toBe(2);
    expect(screen.getByText('jáspis')).toBeTruthy();
    // An offer is titled by its item, not by the game's own prose label: the
    // label's quantity and price are already in this row's fields.
    expect(screen.getByText('agyar')).toBeTruthy();
    expect(screen.queryByText('6 db. agyar 700 ezüst/db. áron')).toBeNull();
  });

  it('pre-fills the price from the market percentage and the quantity from the stack', () => {
    const { container } = render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
    const inputs = rowFor(container, 'jáspis').querySelectorAll<HTMLInputElement>('input');

    expect(inputs[0].value).toBe('19'); // whole stack
    expect(inputs[1].value).toBe('85'); // 50 × 170%
  });

  it('shows the shop price and the market price side by side', () => {
    // The shop price is the alternative to selling here, so the two need to be
    // comparable without reading the market figure out of the Ár input.
    const { container } = render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
    const meta = rowFor(container, 'jáspis').querySelector('.lc-mkt-meta')!.textContent!;

    expect(meta).toContain('bolti ár 50');
    expect(meta).toContain('piaci ár 85');
  });

  it('shows no market price for an item the market does not price', () => {
    const { container } = render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
    const meta = rowFor(container, 'ezüst').querySelector('.lc-mkt-meta')!.textContent!;

    expect(meta).not.toContain('piaci ár');
    expect(meta).not.toContain('bolti ár');
  });

  it('marks an assumed rate as ours rather than the market\'s', () => {
    // bölényszakáll is priced but unquoted on the live page: the suggestion is
    // then a guess and must not read as the game's own figure.
    const state = makeMarketState({ items: [item('bölényszakáll', 5, 40, null, 4)] });
    const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);
    const badge = container.querySelector('.lc-mkt-pct')!;

    expect(badge.textContent).toBe('500%?');
    expect(badge.classList.contains('lc-mkt-pct--assumed')).toBe(true);
    // 40 x 500%
    expect(container.querySelectorAll<HTMLInputElement>('.lc-mkt-field input')[1].value).toBe('200');
  });

  it('shows no rate badge at all when there is no price to scale', () => {
    const { container } = render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
    expect(rowFor(container, 'ezüst').querySelector('.lc-mkt-pct')).toBeNull();
  });

  it('shows the market percentage so the suggested price is explainable', () => {
    const { container } = render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
    expect(rowFor(container, 'jáspis').querySelector('.lc-mkt-pct')!.textContent).toBe('170%');
  });

  it('offers the pre-filled values in one click', () => {
    const state = makeMarketState();
    const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);

    fireEvent.click(rowFor(container, 'jáspis').querySelector<HTMLElement>('.lc-mkt-offer-btn')!);

    expect(state.offer).toHaveBeenCalledTimes(1);
    const [offered, qty, price] = vi.mocked(state.offer).mock.calls[0];
    expect(offered.name).toBe('jáspis');
    expect(qty).toBe(19);
    expect(price).toBe(85);
  });

  it('offers the edited values', () => {
    const state = makeMarketState();
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
    const state = makeMarketState();
    const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);
    const row = rowFor(container, 'jáspis');

    fireEvent.input(row.querySelectorAll<HTMLInputElement>('input')[0], { target: { value: '999' } });
    fireEvent.click(row.querySelector<HTMLElement>('.lc-mkt-offer-btn')!);

    expect(vi.mocked(state.offer).mock.calls[0][1]).toBe(19);
  });

  it('will not offer an item it cannot price', () => {
    // Silver has no Ár, so there is nothing to suggest and no valid offer.
    const state = makeMarketState();
    const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);
    const button = rowFor(container, 'ezüst').querySelector<HTMLButtonElement>('.lc-mkt-offer-btn')!;

    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(state.offer).not.toHaveBeenCalled();
  });

  it('revokes a standing offer', () => {
    const state = makeMarketState();
    const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);

    fireEvent.click(container.querySelector<HTMLElement>('.lc-mkt-revoke-btn')!);
    expect(state.listings[0].revoke).toHaveBeenCalledTimes(1);
  });

  it('filters the offerable list', () => {
    const { container } = render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
    fireEvent.input(screen.getByLabelText('Keresés a felkínálható tárgyak között'), { target: { value: 'jás' } });

    const names = [...container.querySelectorAll('.lc-mkt-name')].map(e => e.textContent?.trim());
    expect(names).toContain('jáspis');
    expect(names).not.toContain('ezüst');
  });

  it('finds an accented name typed without accents', () => {
    const { container } = render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
    fireEvent.input(screen.getByLabelText('Keresés a felkínálható tárgyak között'), { target: { value: 'gyikbor' } });

    const names = [...container.querySelectorAll('.lc-mkt-name')].map(e => e.textContent?.trim());
    expect(names).toContain('gyíkbőr');
    expect(names).not.toContain('jáspis');
  });

  describe('item names open the item detail', () => {
    it('opens the database on an offerable item', () => {
      const { container } = render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
      expect(document.querySelectorAll('.lc-db-overlay').length).toBe(1);

      fireEvent.click(rowFor(container, 'jáspis').querySelector<HTMLElement>('.lc-mkt-name--link')!);

      // The detail stacks above the market rather than replacing it.
      expect(document.querySelectorAll('.lc-db-overlay').length).toBe(2);
      expect(container.querySelector('.lc-home-split')).not.toBeNull();
    });

    it('opens the database from a standing offer', () => {
      const { container } = render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
      const offersCol = container.querySelectorAll('.lc-home-col')[1];

      fireEvent.click(offersCol.querySelector<HTMLElement>('.lc-mkt-name--link')!);
      expect(document.querySelectorAll('.lc-db-overlay').length).toBe(2);
    });

    it('leaves an offer we could not parse a name from as plain text', () => {
      const state = makeMarketState({ listings: [listing('valami furcsa sor', 0)] });
      const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);
      const offersCol = container.querySelectorAll('.lc-home-col')[1];

      expect(offersCol.querySelector('.lc-mkt-name--link')).toBeNull();
      expect(offersCol.textContent).toContain('valami furcsa sor');
    });

    it('closes the detail and leaves the market open', () => {
      const onClose = vi.fn();
      const { container } = render(<MarketPanel open state={makeMarketState()} onClose={onClose} />);
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
    const { container } = render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
    const offers = container.querySelectorAll('.lc-home-col')[1];

    expect(offers.querySelector('.lc-mkt-pct')!.textContent).toBe('565%');
  });

  it('omits the badge on an offer with no percentage to show', () => {
    const state = makeMarketState({ listings: [listing('valami furcsa sor', 0)] });
    const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);
    const offers = container.querySelectorAll('.lc-home-col')[1];

    expect(offers.querySelector('.lc-mkt-pct')).toBeNull();
  });

  it('renders offers in the same shape as the offerable rows, but inert', () => {
    const { container } = render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
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
    const { container } = render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
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
      const { container } = render(<MarketPanel open state={makeMarketState({ listings: OFFERS })} onClose={vi.fn()} />);
      fireEvent.input(screen.getByLabelText('Keresés a felkínált tárgyaim között'), { target: { value: 'agyar' } });

      const offers = container.querySelectorAll('.lc-home-col')[1].querySelectorAll('.lc-mkt-row');
      expect(offers).toHaveLength(1);
      expect(offers[0].textContent).toContain('agyar');
    });

    it('ignores accents, like every other search', () => {
      const { container } = render(<MarketPanel open state={makeMarketState({ listings: OFFERS })} onClose={vi.fn()} />);
      fireEvent.input(screen.getByLabelText('Keresés a felkínált tárgyaim között'), { target: { value: 'acelpajzs' } });

      const offers = container.querySelectorAll('.lc-home-col')[1].querySelectorAll('.lc-mkt-row');
      expect(offers).toHaveLength(1);
      expect(offers[0].textContent).toContain('acélpajzs');
    });

    it('matches the item name only, not the label around it', () => {
      // Every label ends "… ezüst/db. áron", so searching the whole label made
      // "ezüst" — or any price — match every offer at once.
      const { container } = render(<MarketPanel open state={makeMarketState({ listings: OFFERS })} onClose={vi.fn()} />);
      const offers = container.querySelectorAll('.lc-home-col')[1];

      for (const term of ['ezüst', '7000']) {
        fireEvent.input(screen.getByLabelText('Keresés a felkínált tárgyaim között'), { target: { value: term } });
        expect(offers.querySelectorAll('.lc-mkt-row')).toHaveLength(0);
      }
    });

    it('falls back to the label for an offer with no name to match', () => {
      // Such a row shows its label, so that is the only thing there is to search.
      const state = makeMarketState({ listings: [listing('valami furcsa sor', 0), ...OFFERS] });
      const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);
      fireEvent.input(screen.getByLabelText('Keresés a felkínált tárgyaim között'), { target: { value: 'furcsa' } });

      const offers = container.querySelectorAll('.lc-home-col')[1].querySelectorAll('.lc-mkt-row');
      expect(offers).toHaveLength(1);
      expect(offers[0].textContent).toContain('valami furcsa sor');
    });

    it('says when nothing matched, distinctly from having nothing offered', () => {
      render(<MarketPanel open state={makeMarketState({ listings: OFFERS })} onClose={vi.fn()} />);
      fireEvent.input(screen.getByLabelText('Keresés a felkínált tárgyaim között'), { target: { value: 'zzz' } });

      expect(screen.getByText('Nincs találat.')).toBeTruthy();
      expect(screen.queryByText('Nincs felkínált tárgyad.')).toBeNull();
    });

    it('offers no search box when there is nothing to search', () => {
      render(<MarketPanel open state={makeMarketState({ listings: [] })} onClose={vi.fn()} />);
      expect(screen.queryByLabelText('Keresés a felkínált tárgyaim között')).toBeNull();
    });

    it('filters the two columns independently', () => {
      const { container } = render(<MarketPanel open state={makeMarketState({ listings: OFFERS })} onClose={vi.fn()} />);
      fireEvent.input(screen.getByLabelText('Keresés a felkínált tárgyaim között'), { target: { value: 'agyar' } });

      // The offerable column keeps its full list.
      const offerable = container.querySelectorAll('.lc-home-col')[0].querySelectorAll('.lc-mkt-row');
      expect(offerable.length).toBe(3);
    });
  });

  describe('marking backpack items that are already on offer', () => {
    /** The badge in a given backpack row, or null. */
    function badge(container: Element, name: string): Element | null {
      return rowFor(container, name).querySelector('.lc-mkt-offered');
    }

    it('badges an item that has a standing offer, with how much of it', () => {
      // The backpack keeps listing an item you have already offered, so without
      // this the two columns read as unrelated and you offer the same stack twice.
      const state = makeMarketState({
        listings: [listing('4 db. jáspis 85 ezüst/db. áron', 0, 'jáspis', 170, { quantity: 4, unitPrice: 85 })],
      });
      const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);

      expect(badge(container, 'jáspis')!.textContent).toContain('4 db');
      expect(badge(container, 'jáspis')!.textContent).toContain('felkínálva');
    });

    it('leaves an item with no standing offer unbadged', () => {
      const state = makeMarketState({
        listings: [listing('4 db. jáspis 85 ezüst/db. áron', 0, 'jáspis', 170, { quantity: 4, unitPrice: 85 })],
      });
      const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);

      expect(badge(container, 'gyíkbőr')).toBeNull();
    });

    it('matches the two lists case-insensitively', () => {
      // The game does not case the backpack and the offers list alike.
      const state = makeMarketState({
        listings: [listing('4 db. Jáspis 85 ezüst/db. áron', 0, 'Jáspis', 170, { quantity: 4, unitPrice: 85 })],
      });
      const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);

      expect(badge(container, 'jáspis')!.textContent).toContain('4 db');
    });

    it('sums two offers of the same item', () => {
      const state = makeMarketState({
        listings: [
          listing('4 db. jáspis 85 ezüst/db. áron', 0, 'jáspis', 170, { quantity: 4, unitPrice: 85 }),
          listing('3 db. jáspis 90 ezüst/db. áron', 1, 'jáspis', 170, { quantity: 3, unitPrice: 90 }),
        ],
      });
      const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);

      expect(badge(container, 'jáspis')!.textContent).toContain('7 db');
    });

    it('badges without a count when no quantity could be read', () => {
      const state = makeMarketState({ listings: [listing('jáspis, valahány', 0, 'jáspis', 170)] });
      const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);

      const text = badge(container, 'jáspis')!.textContent!;
      expect(text).toContain('felkínálva');
      expect(text).not.toContain('db');
    });
  });

  it('says so when there is nothing offered yet', () => {
    render(<MarketPanel open state={makeMarketState({ listings: [] })} onClose={vi.fn()} />);
    expect(screen.getByText('Nincs felkínált tárgyad.')).toBeTruthy();
  });

  describe('ordering, as the home view offers it', () => {
    /** The names a column currently lists, in render order. */
    function shown(container: Element, col: 0 | 1): string[] {
      return [...container.querySelectorAll('.lc-home-col')[col].querySelectorAll('.lc-mkt-name')]
        .map((e) => e.textContent!.trim());
    }

    const OFFERS = [
      listing('6 db. agyar 700 ezüst/db. áron', 0, 'agyar', 565, { quantity: 6, unitPrice: 700, shopPrice: 124 }),
      listing('1 db. acélpajzs 7000 ezüst/db. áron', 1, 'acélpajzs', 2258, { quantity: 1, unitPrice: 7000, shopPrice: 310 }),
    ];

    it('sorts the offerable column by the chosen key', () => {
      const { container } = render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
      fireEvent.change(screen.getByLabelText('Felkínálható tárgyak rendezése'), { target: { value: 'amount' } });

      // 7 gyíkbőr, 19 jáspis, 5725 ezüst.
      expect(shown(container, 0)).toEqual(['gyíkbőr', 'jáspis', 'ezüst']);
    });

    it('flips the direction', () => {
      const { container } = render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
      fireEvent.click(screen.getByLabelText('Felkínálható tárgyak sorrendje'));

      // Name order reversed: the default is ascending, as in the home view.
      expect(shown(container, 0)).toEqual(['jáspis', 'gyíkbőr', 'ezüst']);
    });

    it('sorts the standing offers too', () => {
      const state = makeMarketState({ listings: OFFERS });
      const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);
      fireEvent.change(screen.getByLabelText('Felkínált tárgyaim rendezése'), { target: { value: 'total' } });

      // 6 x 700 = 4200 against 1 x 7000.
      expect(shown(container, 1)).toEqual(['agyar', 'acélpajzs']);
    });

    it('keeps each column\'s ordering to itself', () => {
      const state = makeMarketState({ listings: OFFERS });
      const { container } = render(<MarketPanel open state={state} onClose={vi.fn()} />);
      fireEvent.click(screen.getByLabelText('Felkínált tárgyaim sorrendje'));

      expect(shown(container, 1)).toEqual(['agyar', 'acélpajzs']);   // reversed
      // Untouched: its own default order, in which silver — which the game gives
      // no price and so cannot be offered — sits at the end.
      expect(shown(container, 0)).toEqual(['gyíkbőr', 'jáspis', 'ezüst']);
    });

    it('offers no toolbar for an empty column', () => {
      render(<MarketPanel open state={makeMarketState({ listings: [] })} onClose={vi.fn()} />);

      expect(screen.queryByLabelText('Felkínált tárgyaim rendezése')).toBeNull();
      expect(screen.queryByLabelText('Felkínálható tárgyak rendezése')).not.toBeNull();
    });
  });

  it('styles the search boxes as inputs of their own', () => {
    // .lc-inv-search is the inventory's <label> wrapper, and its text colour
    // lives on the input inside it — borrowing it here left the field's text at
    // the browser default, i.e. black on black, since a form control inherits
    // no colour.
    render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
    const search = screen.getByLabelText('Keresés a felkínálható tárgyak között');

    expect(search.classList.contains('lc-mkt-search')).toBe(true);
    expect(search.classList.contains('lc-inv-search')).toBe(false);
  });

  it('docks beside the game like the other panels', () => {
    render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Kis méret'));
    expect(document.querySelector('.lc-db-overlay')!.classList.contains('lc-db-overlay--minimized')).toBe(true);
  });

  it('diffs an offerable armour against the worn one on hover', async () => {
    vi.useFakeTimers();
    try {
      const loadout: Loadout = {
        version: 2, playerLevel: 30, capturedAt: 1,
        slots: {
          ...emptySlots(),
          head: { name: 'ent sisak', kind: 'vért', type: 'fejre', level: 20, maxDamage: null, spread: null, defense: 16, magical: false, vampiric: false },
        },
      };
      // An armour in the backpack, carrying the stat block the game prints for one.
      const helmet: MarketItem = {
        name: 'jobb sisak', amount: 1, index: 5, price: 1457, pricePercent: null, suggestedPrice: null,
        type: 'vért', weight: 1.4, totalWeight: 1.4, magical: false,
        attrs: [['Név', 'jobb sisak'], ['Min. szint', '21'], ['Védelem', '20'], ['Fajta', 'fejre']],
      };
      const { container } = render(
        <LoadoutContext.Provider value={loadout}>
          <MarketPanel open state={makeMarketState({ items: [helmet] })} onClose={vi.fn()} />
        </LoadoutContext.Provider>,
      );

      fireEvent.mouseEnter(rowFor(container, 'jobb sisak').querySelector('.lc-mkt-name-line')!, { clientX: 5, clientY: 5 });
      await vi.advanceTimersByTimeAsync(200);

      expect(document.querySelector('.lc-cmp')).not.toBeNull();
      expect(screen.getByText('Fej')).toBeTruthy();
      // Védelem 16 -> 20 is an upgrade.
      expect(document.querySelector('.lc-cmp-better')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

/** The panel's tab strip button whose label matches. */
function panelTab(name: RegExp): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('.lc-home-tab')]
    .find(b => name.test(b.textContent ?? ''));
  if (!found) throw new Error(`no market panel tab matching ${name}`);
  return found;
}

describe('MarketPanel tabs', () => {
  beforeEach(() => {
    GM_setValue(MARKET_MINIMIZED_KEY, '');
    GM_setValue(MARKET_TAB_KEY, '');
  });

  it('opens on the selling split', () => {
    const { container } = render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
    expect(container.querySelector('.lc-home-split')).toBeTruthy();
    expect(container.querySelector('.lc-mkt-buy-search')).toBeNull();
  });

  it('swaps the split for the purchase view', () => {
    const { container } = render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);

    fireEvent.click(panelTab(/Vétel/));

    expect(container.querySelector('.lc-mkt-buy-search')).toBeTruthy();
    expect(container.querySelector('.lc-home-split')).toBeNull();
  });

  it('comes back on the purchase view after the reload a search causes', () => {
    const { unmount } = render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
    fireEvent.click(panelTab(/Vétel/));
    unmount();

    const { container } = render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
    expect(container.querySelector('.lc-mkt-buy-search')).toBeTruthy();
  });

  it('opens on the selling split when the phone was last left on one of its selling tabs', () => {
    // Mobile has three selling tabs where the panel has one, so any of them maps
    // to the split rather than to a tab the panel does not have.
    GM_setValue(MARKET_TAB_KEY, 'listings');
    const { container } = render(<MarketPanel open state={makeMarketState()} onClose={vi.fn()} />);
    expect(container.querySelector('.lc-home-split')).toBeTruthy();
  });

  it('keeps the market\'s own actions reachable from either tab', () => {
    const trigger = vi.fn();
    const state = makeMarketState({
      actions: {
        exit: null,
        collectMoney: { label: 'Felveszed a pénzt', iconUrl: 'p.gif', trigger },
        settings: null,
        special: [],
      },
    });
    render(<MarketPanel open state={state} onClose={vi.fn()} />);

    fireEvent.click(panelTab(/Vétel/));
    fireEvent.click(screen.getByTitle('Felveszed a pénzt'));

    expect(trigger).toHaveBeenCalledTimes(1);
  });
});

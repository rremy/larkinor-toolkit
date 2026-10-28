import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { ShopActions, ShopBuyItem, ShopSellItem } from '@/utils/shopExtract';
import type { BuildingOption } from '@/utils/domExtract';
import { matchesSearch } from '@/shared/text';
import { useStoredSort } from '@/hooks/useStoredSort';
import { NameLine, NumberField, Toolbar, silver, type ColumnLabels } from '@/components/MarketRows';

// The shops' two lists — what the shop sells, and what it will buy from you —
// shared by the mobile page and the desktop panel, like the market's rows. The
// game's own form is one dropdown per side with a quantity box and a total that
// only appears after a selection; here every item is a row with its figures in
// view and its own quantity and button.

type BuySortKey = 'name' | 'price' | 'weight' | 'market';
type SellSortKey = 'name' | 'amount' | 'sellPrice' | 'total' | 'market';

const BUY_SORT_OPTIONS: ReadonlyArray<readonly [BuySortKey, string]> = [
  ['name', 'Név'],
  ['price', 'Ár'],
  ['weight', 'Súly'],
  ['market', 'piaci ár'],
];

const SELL_SORT_OPTIONS: ReadonlyArray<readonly [SellSortKey, string]> = [
  ['name', 'Név'],
  ['amount', 'Mennyiség'],
  ['sellPrice', 'Elad. ár'],
  ['total', 'összesen'],
  ['market', 'piaci ár'],
];

const BUY_LABELS: ColumnLabels = {
  search: 'Keresés a bolt kínálatában',
  sort: 'A bolt kínálatának rendezése',
  direction: 'A bolt kínálatának sorrendje',
};

const SELL_LABELS: ColumnLabels = {
  search: 'Keresés az eladható tárgyak között',
  sort: 'Eladható tárgyak rendezése',
  direction: 'Eladható tárgyak sorrendje',
};

/** What the whole stack fetches at the shop's price, or null without one. */
function stackValue(item: ShopSellItem): number | null {
  return item.sellPrice === null ? null : item.sellPrice * item.amount;
}

function buyNumber(item: ShopBuyItem, key: Exclude<BuySortKey, 'name'>): number | null {
  switch (key) {
    case 'price': return item.unitPrice;
    case 'weight': return item.weight;
    case 'market': return item.marketPrice;
  }
}

function sellNumber(item: ShopSellItem, key: Exclude<SellSortKey, 'name'>): number | null {
  switch (key) {
    case 'amount': return item.amount;
    case 'sellPrice': return item.sellPrice;
    case 'total': return stackValue(item);
    case 'market': return item.marketPrice;
  }
}

/**
 * Sorts a copy. Names by Hungarian collation, numbers with a missing figure
 * counting as 0 — the market lists' rules, so the two read alike.
 */
function sortRows<T extends { name: string }, K extends string>(
  rows: T[],
  key: K | 'name',
  asc: boolean,
  num: (row: T, key: Exclude<K, 'name'>) => number | null,
): T[] {
  const dir = asc ? 1 : -1;
  return [...rows].sort((a, b) => (
    key === 'name'
      ? a.name.localeCompare(b.name, 'hu') * dir
      : ((num(a, key as Exclude<K, 'name'>) ?? 0) - (num(b, key as Exclude<K, 'name'>) ?? 0)) * dir
  ));
}

interface BuyRowProps {
  item: ShopBuyItem;
  gold: number;
  onBuy: (item: ShopBuyItem, qty: number) => void;
  onOpenDetail: (name: string) => void;
}

/** One item the shop sells. Starts at one unit: this spends money. */
function BuyRow({ item, gold, onBuy, onOpenDetail }: BuyRowProps): JSX.Element {
  const [qty, setQty] = useState(1);
  const total = item.unitPrice === null ? null : item.unitPrice * qty;
  const tooExpensive = total !== null && total > gold;

  return (
    <div class="lc-mkt-row lc-shop-row">
      <div class="lc-mkt-cell">
        <NameLine text={item.name} detailName={item.name} pricePercent={null} onOpenDetail={onOpenDetail} detail={item} />
        <div class="lc-mkt-meta">
          {item.unitPrice !== null && <span>ár: {silver(item.unitPrice)}</span>}
          {item.weight > 0 && <span>{silver(item.weight)} kg</span>}
          {item.marketPrice !== null && <span class="lc-shop-market">piaci ár: {silver(item.marketPrice)}</span>}
          {total !== null && (
            <span
              class={`lc-mkt-total${tooExpensive ? ' lc-mkt-total--short' : ''}`}
              title={tooExpensive ? `Ennyi pénzed nincs — ${silver(gold)} ezüstöd van` : undefined}
            >
              összesen {silver(total)}
            </span>
          )}
        </div>
      </div>

      <NumberField label="Db" value={qty} min={1} onInput={(n) => setQty(Math.max(1, Number.isFinite(n) ? Math.floor(n) : 1))} />

      {/* Not disabled when unaffordable, as on the market: the money is parsed
          off the page, and a bad parse must not block a purchase the game allows. */}
      <button class="lc-mkt-buy-btn" title="Megveszed" onClick={() => onBuy(item, qty)}>Megvesz</button>
    </div>
  );
}

export interface ShopBuyListProps {
  items: ShopBuyItem[];
  gold: number;
  onBuy: (item: ShopBuyItem, qty: number) => void;
  onOpenDetail: (name: string) => void;
}

export function ShopBuyList({ items, gold, onBuy, onOpenDetail }: ShopBuyListProps): JSX.Element {
  const [search, setSearch] = useState('');
  const { sortKey, setSortKey, asc, flip } = useStoredSort('shop-buy', BUY_SORT_OPTIONS.map(([k]) => k), { key: 'name', asc: true });
  const shown = sortRows(items.filter((i) => matchesSearch(i.name, search)), sortKey, asc, buyNumber);

  return (
    <div class="lc-mkt-column">
      {items.length > 0 && (
        <Toolbar
          labels={BUY_LABELS}
          search={search}
          onSearch={setSearch}
          sortKey={sortKey}
          onSortKey={setSortKey}
          asc={asc}
          onFlip={flip}
          options={BUY_SORT_OPTIONS}
        />
      )}
      <div class="lc-mkt-list">
        {shown.map((item) => <BuyRow key={item.index} item={item} gold={gold} onBuy={onBuy} onOpenDetail={onOpenDetail} />)}
        {shown.length === 0 && (
          <p class="lc-mkt-empty">{items.length === 0 ? 'A bolt most nem árul semmit.' : 'Nincs találat.'}</p>
        )}
      </div>
    </div>
  );
}

/**
 * The sell list's order: the chosen sort, with what this shop will not buy sunk
 * to the end regardless of direction — the market's rule for rows it cannot
 * price. Reversing the order is no reason to promote dead rows, and they keep
 * the chosen order among themselves.
 */
function sortSellRows(rows: ShopSellItem[], key: SellSortKey, asc: boolean): ShopSellItem[] {
  const ordered = sortRows(rows, key, asc, sellNumber);
  return [...ordered.filter((i) => i.sellable), ...ordered.filter((i) => !i.sellable)];
}

interface SellRowProps {
  item: ShopSellItem;
  picked: boolean;
  onPick: (item: ShopSellItem) => void;
  onSell: (item: ShopSellItem, qty: number) => void;
  onOpenDetail: (name: string) => void;
}

/**
 * One backpack item the shop will buy. The quantity starts at one rather than
 * the whole stack: a sale to a shop cannot be undone, and the market often pays
 * many times what the shop does — the whole stack is what the tick box is for.
 */
function SellRow({ item, picked, onPick, onSell, onOpenDetail }: SellRowProps): JSX.Element {
  const [qty, setQty] = useState(1);
  const single = item.index !== null && item.sellable;
  const total = item.sellPrice === null ? null : item.sellPrice * qty;
  const rowClass = `lc-mkt-row lc-shop-row lc-shop-row--sell${picked ? ' lc-shop-row--picked' : ''}${item.sellable ? '' : ' lc-shop-row--inactive'}`;

  return (
    <div class={rowClass} title={item.sellable ? undefined : 'Ezt a tárgyat ez a bolt nem veszi meg'}>
      {item.bulkIndex !== null ? (
        <input
          class="lc-shop-pick"
          type="checkbox"
          checked={picked}
          aria-label={`${item.name} kijelölése csoportos eladáshoz`}
          onChange={() => onPick(item)}
        />
      ) : (
        // Holds the column so every row's name starts at the same edge.
        <span
          class="lc-shop-pick lc-shop-pick--none"
          title={item.sellable ? 'Ez a bolt csak egyenként veszi meg' : 'Ezt a tárgyat ez a bolt nem veszi meg'}
        />
      )}

      <div class="lc-mkt-cell">
        <NameLine text={item.name} detailName={item.name} pricePercent={null} onOpenDetail={onOpenDetail} detail={item} />
        <div class="lc-mkt-meta">
          <span>{item.amount} db</span>
          {item.sellPrice !== null && <span>elad. ár: {silver(item.sellPrice)}</span>}
          {item.price !== null && <span>bolti ár: {silver(item.price)}</span>}
          {item.marketPrice !== null && <span class="lc-shop-market">piaci ár: {silver(item.marketPrice)}</span>}
          {single && total !== null && <span class="lc-mkt-total">összesen: {silver(total)}</span>}
          {!item.sellable && <span>itt nem eladható</span>}
        </div>
      </div>

      <NumberField
        label="Db"
        value={qty}
        min={1}
        max={item.amount}
        disabled={!single}
        onInput={(n) => setQty(Math.max(1, Math.min(Number.isFinite(n) ? Math.floor(n) : 1, item.amount)))}
      />

      <button
        class="lc-mkt-offer-btn"
        title={single ? 'Eladod' : item.sellable ? 'Ezt a bolt csak csoportosan veszi meg' : 'Ezt a tárgyat ez a bolt nem veszi meg'}
        disabled={!single}
        onClick={() => { if (single) onSell(item, qty); }}
      >
        Elad
      </button>
    </div>
  );
}

export interface ShopSellListProps {
  items: ShopSellItem[];
  onSellOne: (item: ShopSellItem, qty: number) => void;
  onSellMany: (items: ShopSellItem[]) => void;
  onOpenDetail: (name: string) => void;
}

/**
 * The backpack, sellable: toolbar, rows, and the bulk bar. Ticked rows sell
 * whole stacks through the game's own bulk list; the bar sums them and sells in
 * two presses, since a mis-tap there costs every stack ticked.
 */
export function ShopSellList({ items, onSellOne, onSellMany, onOpenDetail }: ShopSellListProps): JSX.Element {
  const [search, setSearch] = useState('');
  const { sortKey, setSortKey, asc, flip } = useStoredSort('shop-sell', SELL_SORT_OPTIONS.map(([k]) => k), { key: 'name', asc: true });
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const [armed, setArmed] = useState(false);

  const shown = sortSellRows(items.filter((i) => matchesSearch(i.name, search)), sortKey, asc);
  const pickable = shown.filter((i) => i.bulkIndex !== null);
  const chosen = items.filter((i) => i.bulkIndex !== null && picked.has(i.bulkIndex));
  const allShownPicked = pickable.length > 0 && pickable.every((i) => picked.has(i.bulkIndex!));
  const chosenTotal = chosen.reduce((sum, i) => sum + (stackValue(i) ?? 0), 0);
  const unpriced = chosen.some((i) => i.sellPrice === null);

  // Built from the previous selection, never from this render's: taps landing
  // before a re-render would otherwise each start from the same stale set, and
  // all but the last would be lost.
  const update = (change: (next: Set<number>) => void): void => {
    setPicked((prev) => {
      const next = new Set(prev);
      change(next);
      return next;
    });
    // Any change to the selection disarms the sale: the confirmation was for
    // the selection as it stood.
    setArmed(false);
  };

  const toggle = (item: ShopSellItem): void => update((next) => {
    if (next.has(item.bulkIndex!)) next.delete(item.bulkIndex!);
    else next.add(item.bulkIndex!);
  });

  const toggleShown = (): void => update((next) => {
    for (const item of pickable) {
      if (allShownPicked) next.delete(item.bulkIndex!);
      else next.add(item.bulkIndex!);
    }
  });

  const sellChosen = (): void => {
    if (chosen.length === 0) return;
    if (!armed) { setArmed(true); return; }
    onSellMany(chosen);
  };

  return (
    <div class="lc-mkt-column">
      {items.length > 0 && (
        <Toolbar
          labels={SELL_LABELS}
          search={search}
          onSearch={setSearch}
          sortKey={sortKey}
          onSortKey={setSortKey}
          asc={asc}
          onFlip={flip}
          options={SELL_SORT_OPTIONS}
        />
      )}
      <div class="lc-mkt-list">
        {shown.map((item) => (
          <SellRow
            key={item.bulkIndex !== null ? `b${item.bulkIndex}` : `s${item.index}`}
            item={item}
            picked={item.bulkIndex !== null && picked.has(item.bulkIndex)}
            onPick={toggle}
            onSell={onSellOne}
            onOpenDetail={onOpenDetail}
          />
        ))}
        {shown.length === 0 && (
          <p class="lc-mkt-empty">{items.length === 0 ? 'Nincs semmid, amit ez a bolt megvenne.' : 'Nincs találat.'}</p>
        )}
      </div>

      {items.some((i) => i.bulkIndex !== null) && (
        <div class="lc-shop-bulk">
          <button class="lc-shop-bulk-all" disabled={pickable.length === 0} onClick={toggleShown}>
            {allShownPicked ? 'egyik sem' : 'mind'}
          </button>
          <span class="lc-shop-bulk-sum">
            {chosen.length === 0
              ? 'Jelöld ki, amit egészben eladnál'
              : `${chosen.length} tétel — összesen ${silver(chosenTotal)}${unpriced ? '+' : ''}`}
          </span>
          <button
            class={`lc-mkt-offer-btn lc-shop-bulk-sell${armed ? ' lc-shop-bulk-sell--armed' : ''}`}
            disabled={chosen.length === 0}
            onClick={sellChosen}
          >
            {armed ? 'Biztosan eladod?' : 'Kijelöltek eladása'}
          </button>
        </div>
      )}
    </div>
  );
}

function ActionButton({ option, wide }: { option: BuildingOption | null; wide?: boolean }): JSX.Element | null {
  if (!option) return null;
  return (
    <button class={`lc-home-act${wide ? ' lc-home-act--wide' : ''}`} title={option.label} onClick={() => option.trigger()}>
      <img class="lc-mkt-act-icon" src={option.iconUrl} alt="" />
      {option.label}
    </button>
  );
}

export interface ShopActionButtonsProps {
  actions: ShopActions;
  /** Include the page's other controls (the Templom's prayers); desktop leaves them on the page. */
  withOther?: boolean;
}

/** The page's own buttons: leave, stow the worn set, and on mobile everything else. */
export function ShopActionButtons({ actions, withOther = false }: ShopActionButtonsProps): JSX.Element | null {
  const other = withOther ? actions.other : [];
  if (!actions.exit && !actions.stowWorn && other.length === 0) return null;
  return (
    <div class="lc-mkt-actions">
      {other.map((o) => <ActionButton key={o.label} option={o} />)}
      <ActionButton option={actions.stowWorn} wide />
      <ActionButton option={actions.exit} wide />
    </div>
  );
}

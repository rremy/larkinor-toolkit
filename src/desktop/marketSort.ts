// Ordering for the market panel's two columns.
//
// The keys are the home view's (see components/InventoryList) plus the three
// figures only the market has, and the two sorting rules are the same as there:
// names by Hungarian collation, numbers by subtraction with a missing figure
// counting as 0, so an unpriced row stays in the list instead of dropping out of
// sight.
//
// The same key reads from different fields in each column, hence one accessor
// per type rather than an index into a shared shape.

import type { MarketItem, MarketListing } from '@/utils/marketExtract';

export type MarketSortKey =
  | 'name'
  | 'weight'
  | 'totalWeight'
  | 'amount'
  | 'price'
  | 'percent'
  | 'market'
  | 'total';

/** Key and its label, in the order the select lists them. */
export const MARKET_SORT_OPTIONS: Array<[MarketSortKey, string]> = [
  ['name', 'Név'],
  ['weight', 'Súly'],
  ['totalWeight', 'Összsúly'],
  ['amount', 'Mennyiség'],
  ['price', 'Ár'],
  ['percent', '%'],
  ['market', 'piaci ár'],
  ['total', 'összesen'],
];

type NumericSortKey = Exclude<MarketSortKey, 'name'>;

function itemNumber(item: MarketItem, key: NumericSortKey): number | null {
  switch (key) {
    case 'weight': return item.weight;
    case 'totalWeight': return item.totalWeight;
    case 'amount': return item.amount;
    case 'price': return item.price;
    case 'percent': return item.pricePercent;
    case 'market': return item.suggestedPrice;
    // The pre-filled total: what offering the whole stack at the suggested price
    // comes to. A row's edited figures live in its own state, out of reach here.
    case 'total': return item.suggestedPrice === null ? null : item.suggestedPrice * item.amount;
  }
}

function listingNumber(listing: MarketListing, key: NumericSortKey): number | null {
  switch (key) {
    case 'weight': return listing.detail?.weight ?? null;
    case 'totalWeight': return listing.detail?.totalWeight ?? null;
    // The offer's own figures, not the detail block's: these are what the row
    // shows, and Ár is the shop price the asking price competes with.
    case 'amount': return listing.quantity;
    case 'price': return listing.shopPrice;
    case 'percent': return listing.pricePercent;
    case 'market': return listing.suggestedPrice;
    // The asking total, counted exactly as the row prints it.
    case 'total': return listing.unitPrice === null ? null : listing.unitPrice * (listing.quantity ?? 1);
  }
}

/** Sorts a copy: both columns order the same extracted state independently. */
function sortBy<T>(
  rows: T[],
  key: MarketSortKey,
  asc: boolean,
  text: (row: T) => string,
  num: (row: T, key: NumericSortKey) => number | null,
): T[] {
  const dir = asc ? 1 : -1;
  return [...rows].sort((a, b) => (
    key === 'name'
      ? text(a).localeCompare(text(b), 'hu') * dir
      : ((num(a, key) ?? 0) - (num(b, key) ?? 0)) * dir
  ));
}

/**
 * Whether the market will price this item at all. The game gives some backpack
 * contents no Ár — silver itself, quest pieces — and with no price there is
 * nothing to scale into an offer: the row renders with an empty Ár and a dead
 * Felkínál button. See `suggestPrice`, which is what returns null here.
 */
function offerable(item: MarketItem): boolean {
  return item.suggestedPrice !== null;
}

export function sortItems(items: MarketItem[], key: MarketSortKey, asc: boolean): MarketItem[] {
  // Rows that cannot be offered sink to the end, ahead of the chosen ordering
  // and regardless of its direction: they are dead weight in a list you are
  // reading to decide what to sell, and reversing the order is no reason to
  // promote them. They keep the chosen ordering among themselves, so the tail is
  // still a list rather than a heap.
  const ordered = sortBy(items, key, asc, (item) => item.name, itemNumber);
  return [...ordered.filter(offerable), ...ordered.filter((item) => !offerable(item))];
}

export function sortListings(listings: MarketListing[], key: MarketSortKey, asc: boolean): MarketListing[] {
  // Named by the item where there is one, by the label otherwise — what the row
  // itself is titled with.
  return sortBy(listings, key, asc, (listing) => listing.detail?.name ?? listing.label, listingNumber);
}

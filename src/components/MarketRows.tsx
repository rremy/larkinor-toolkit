import { h, type ComponentChildren, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import { askPercent, type MarketItem, type MarketListing } from '@/utils/marketExtract';
import { matchesSearch } from '@/shared/text';
import { MARKET_SORT_OPTIONS, sortItems, sortListings, type MarketSortKey } from '@/desktop/marketSort';
import { useCompare } from '@/hooks/useCompare';
import { useStoredSort } from '@/hooks/useStoredSort';
import { fromDetail } from '@/shared/compare';
import type { DetailLike } from '@/shared/loadout';

// The market's two selling columns — offerable backpack items, and offers
// already standing — as self-contained lists. Shared rather than desktop-only:
// the mobile market page shows the same two lists one tab at a time, and a row
// that read differently on the two platforms would be a second thing to keep
// right.

/** Hungarian thousands grouping, matching the rest of the UI. */
export function silver(n: number): string {
  return n.toLocaleString('hu-HU');
}

/**
 * Hover text for a row's own rate: what the figure measures, and the market's
 * quoted rate to judge it against — the badge itself no longer shows the quote.
 */
export function rateTitle(whose: string, marketPercent: number | null): string {
  const quote = marketPercent === null ? 'a piac nem jegyez árfolyamot' : `a piaci árfolyam ${marketPercent}%`;
  return `${whose} a bolti ár ennyi százaléka — ${quote}`;
}

interface NameLineProps {
  /** The clickable text: an item's name, or an offer's whole label. */
  text: string;
  /** Name to open the database on, or null to render the text as plain. */
  detailName: string | null;
  pricePercent: number | null;
  /** Hover text for the rate badge, when the figure needs explaining. */
  pricePercentTitle?: string;
  /**
   * True when the market quotes no rate for the item, so the badge's figure has
   * nothing to be judged against — drawn muted rather than accented.
   */
  unquoted?: boolean;
  onOpenDetail: (name: string) => void;
  /** Parsed stat block, when there is one, for the compare card. */
  detail?: DetailLike | null;
  /** Extra badges for one column only, rendered after the rate. */
  children?: ComponentChildren;
}

/** Item name plus its rate badge. Shared so every column reads identically. */
export function NameLine({
  text, detailName, pricePercent, pricePercentTitle, unquoted = false, onOpenDetail, detail, children,
}: NameLineProps): JSX.Element {
  // Here rather than in each row, so every column gets the compare card from one
  // wiring — offerable backpack items, standing offers and purchases alike.
  const cmp = useCompare(detail ? fromDetail(detail) : null);
  return (
    <div class="lc-mkt-name-line" {...cmp.props}>
      {cmp.card}
      {detailName ? (
        <button
          class="lc-mkt-name lc-mkt-name--link"
          title={`${detailName} — adatlap`}
          onClick={() => onOpenDetail(detailName)}
        >
          {text}
        </button>
      ) : (
        <span class="lc-mkt-name">{text}</span>
      )}
      {pricePercent !== null && (
        <span class={`lc-mkt-pct${unquoted ? ' lc-mkt-pct--unquoted' : ''}`} title={pricePercentTitle}>
          {pricePercent}%
        </span>
      )}
      {children}
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  /** Read-only fields show a standing offer's figures, which cannot be edited. */
  disabled?: boolean;
  onInput?: (value: number) => void;
}

export function NumberField({ label, value, min, max, disabled, onInput }: NumberFieldProps): JSX.Element {
  return (
    <label class="lc-mkt-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onInput={onInput && ((e) => onInput(Number((e.target as HTMLInputElement).value)))}
      />
    </label>
  );
}

/**
 * How much of each item already has a standing offer, keyed by lower-cased name:
 * the backpack and the offers list are not cased alike, the same reason
 * marketExtract lower-cases its rate map. An offer whose label yielded no
 * quantity still puts its item in the map, contributing 0 — the offer's
 * existence is the point, and the count is secondary.
 */
function offeredAmounts(listings: MarketListing[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const listing of listings) {
    const name = listing.detail?.name.toLowerCase();
    if (name === undefined) continue;
    totals.set(name, (totals.get(name) ?? 0) + (listing.quantity ?? 0));
  }
  return totals;
}

interface OfferRowProps {
  item: MarketItem;
  /** Units of this item already on offer, or undefined when there are none. */
  offered: number | undefined;
  onOffer: (item: MarketItem, qty: number, price: number) => void;
  onOpenDetail: (name: string) => void;
}

/**
 * One backpack item, ready to offer. Quantity starts at the whole stack and the
 * price at what the market pays — the two values you would otherwise type by
 * hand every time — so offering is a single click unless you want to change one.
 */
function OfferRow({ item, offered, onOffer, onOpenDetail }: OfferRowProps): JSX.Element {
  const [qty, setQty] = useState(item.amount);
  const [price, setPrice] = useState(item.suggestedPrice ?? 0);

  const clampQty = (n: number) => Math.max(1, Math.min(Number.isFinite(n) ? n : 1, item.amount));
  const priceValid = price > 0;

  return (
    <div class="lc-mkt-row">
      <div class="lc-mkt-cell">
        <NameLine
          text={item.name}
          detailName={item.name}
          pricePercent={askPercent(priceValid ? price : null, item.price)}
          pricePercentTitle={rateTitle('Az árad', item.pricePercent)}
          unquoted={item.pricePercent === null}
          onOpenDetail={onOpenDetail}
          detail={item}
        >
          {/* The backpack keeps listing an item you have already offered, so
              without this the two columns read as unrelated and the same stack
              gets offered twice. */}
          {offered !== undefined && (
            <span class="lc-mkt-offered" title="Már van felkínált tételed ebből a piacon">
              🏷 {offered > 0 && `${offered} db `}felkínálva
            </span>
          )}
        </NameLine>
        <div class="lc-mkt-meta">
          <span>{item.amount} db</span>
          {/* Both prices, side by side: the shop's is the alternative to selling
              here, and the market's is what this panel is offering at. Showing
              only the latter (inside the Ár input) made them hard to compare. */}
          {item.price !== null && <span>bolti ár: {silver(item.price)}</span>}
          {item.suggestedPrice !== null && <span>piaci ár: {silver(item.suggestedPrice)}</span>}
          {priceValid && <span class="lc-mkt-total">összesen: {silver(price * qty)}</span>}
        </div>
      </div>

      <NumberField label="Db" value={qty} min={1} max={item.amount} onInput={(n) => setQty(clampQty(n))} />
      <NumberField label="Ár" value={price} min={1} onInput={setPrice} />

      <button
        class="lc-mkt-offer-btn"
        title="Felkínálod"
        disabled={!priceValid}
        // Guarded here as well as by `disabled`: this submits a real, priced
        // trade, and the attribute alone leaves the invariant to the DOM.
        onClick={() => { if (priceValid) onOffer(item, qty, price); }}
      >
        Felkínál
      </button>
    </div>
  );
}

interface ListingRowProps {
  listing: MarketListing;
  onOpenDetail: (name: string) => void;
}

function ListingRow({ listing, onOpenDetail }: ListingRowProps): JSX.Element {
  const name = listing.detail?.name ?? null;
  const qty = listing.quantity ?? 1;
  const asking = listing.unitPrice;

  return (
    <div class="lc-mkt-row">
      <div class="lc-mkt-cell">
        {/* Titled by the item's own name, not the game's label: the label's
            quantity and price already sit in this row's fields, and it read as a
            sentence where the other column reads as a name. Falls back to the
            label when the offer's detail block gave us no name, so no row
            renders nameless. */}
        <NameLine
          text={name ?? listing.label}
          detailName={name}
          pricePercent={askPercent(asking, listing.shopPrice)}
          pricePercentTitle={rateTitle('Az árad', listing.pricePercent)}
          unquoted={listing.pricePercent === null}
          onOpenDetail={onOpenDetail}
          detail={listing.detail}
        />
        <div class="lc-mkt-meta">
          {listing.shopPrice !== null && <span>bolti ár: {silver(listing.shopPrice)}</span>}
          {listing.suggestedPrice !== null && <span>piaci ár: {silver(listing.suggestedPrice)}</span>}
          {asking !== null && <span class="lc-mkt-total">összesen: {silver(asking * qty)}</span>}
        </div>
      </div>

      {/* The same two fields as the offerable rows, disabled: a standing offer's
          quantity and price are fixed, and the game gives no way to edit one —
          you revoke it and offer again. Shown rather than omitted so both columns
          read alike and the asking price sits under the same heading. */}
      <NumberField label="Db" value={qty} disabled />
      <NumberField label="Ár" value={asking ?? 0} disabled />

      <button class="lc-mkt-revoke-btn" title="Visszavonod" onClick={() => listing.revoke()}>
        Visszavon
      </button>
    </div>
  );
}

const MARKET_SORT_KEYS: MarketSortKey[] = MARKET_SORT_OPTIONS.map(([key]) => key);

/** A column's control labels, spelled out so each one is separately addressable. */
export interface ColumnLabels {
  search: string;
  sort: string;
  direction: string;
}

const OFFERABLE_LABELS: ColumnLabels = {
  search: 'Keresés a felkínálható tárgyak között',
  sort: 'Felkínálható tárgyak rendezése',
  direction: 'Felkínálható tárgyak sorrendje',
};

const OFFERED_LABELS: ColumnLabels = {
  search: 'Keresés a felkínált tárgyaim között',
  sort: 'Felkínált tárgyaim rendezése',
  direction: 'Felkínált tárgyaim sorrendje',
};

interface ToolbarProps<K extends string> {
  labels: ColumnLabels;
  search: string;
  onSearch: (value: string) => void;
  sortKey: K;
  onSortKey: (key: K) => void;
  asc: boolean;
  onFlip: () => void;
  /** The sort keys offered, with their labels — the market's own by default. */
  options?: ReadonlyArray<readonly [K, string]>;
}

/**
 * Search, sort key and direction — the home view's toolbar, one per column, with
 * that view's own select and button classes so the two read alike. Shared with
 * the shops, which sort on keys of their own.
 */
export function Toolbar<K extends string = MarketSortKey>({
  labels, search, onSearch, sortKey, onSortKey, asc, onFlip,
  options = MARKET_SORT_OPTIONS as unknown as ReadonlyArray<readonly [K, string]>,
}: ToolbarProps<K>): JSX.Element {
  return (
    <div class="lc-mkt-toolbar">
      <input
        class="lc-mkt-search"
        type="search"
        placeholder="keresés…"
        aria-label={labels.search}
        value={search}
        onInput={(e) => onSearch((e.target as HTMLInputElement).value)}
      />
      <select
        class="lc-inv-sort"
        aria-label={labels.sort}
        value={sortKey}
        onChange={(e) => onSortKey((e.target as HTMLSelectElement).value as K)}
      >
        {options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <button class="lc-inv-dir" aria-label={labels.direction} onClick={onFlip}>{asc ? '↓' : '↑'}</button>
    </div>
  );
}

export interface OfferableListProps {
  items: MarketItem[];
  /** Standing offers, only to mark items that already have one. */
  listings: MarketListing[];
  onOffer: (item: MarketItem, qty: number, price: number) => void;
  onOpenDetail: (name: string) => void;
}

/** The backpack, offerable: toolbar, rows, and the reason for an empty list. */
export function OfferableList({ items, listings, onOffer, onOpenDetail }: OfferableListProps): JSX.Element {
  const [search, setSearch] = useState('');
  // By name ascending to begin with, as in the home view.
  const { sortKey, setSortKey, asc, flip } = useStoredSort('market-offer', MARKET_SORT_KEYS, { key: 'name', asc: true });

  const shown = sortItems(items.filter((i) => matchesSearch(i.name, search)), sortKey, asc);
  const offered = offeredAmounts(listings);

  return (
    <div class="lc-mkt-column">
      {items.length > 0 && (
        <Toolbar
          labels={OFFERABLE_LABELS}
          search={search}
          onSearch={setSearch}
          sortKey={sortKey}
          onSortKey={setSortKey}
          asc={asc}
          onFlip={flip}
        />
      )}
      <div class="lc-mkt-list">
        {shown.map((item) => (
          <OfferRow
            key={item.index}
            item={item}
            offered={offered.get(item.name.toLowerCase())}
            onOffer={onOffer}
            onOpenDetail={onOpenDetail}
          />
        ))}
        {shown.length === 0 && (
          <p class="lc-mkt-empty">{items.length === 0 ? 'A hátizsákod üres.' : 'Nincs találat.'}</p>
        )}
      </div>
    </div>
  );
}

export interface ListingListProps {
  listings: MarketListing[];
  onOpenDetail: (name: string) => void;
}

/** Offers already standing, revocable. */
export function ListingList({ listings, onOpenDetail }: ListingListProps): JSX.Element {
  const [search, setSearch] = useState('');
  const { sortKey, setSortKey, asc, flip } = useStoredSort('market-listings', MARKET_SORT_KEYS, { key: 'name', asc: true });

  // Matched against the item's name, not the offer's whole label: every label
  // ends "… ezüst/db. áron", so a label search returned the entire column for
  // anything price-shaped. An offer with no name falls back to its label, which
  // is all such a row shows.
  const shown = sortListings(
    listings.filter((l) => matchesSearch(l.detail?.name ?? l.label, search)),
    sortKey,
    asc,
  );

  return (
    <div class="lc-mkt-column">
      {listings.length > 0 && (
        <Toolbar
          labels={OFFERED_LABELS}
          search={search}
          onSearch={setSearch}
          sortKey={sortKey}
          onSortKey={setSortKey}
          asc={asc}
          onFlip={flip}
        />
      )}
      <div class="lc-mkt-list">
        {shown.map((listing) => <ListingRow key={listing.index} listing={listing} onOpenDetail={onOpenDetail} />)}
        {shown.length === 0 && (
          <p class="lc-mkt-empty">{listings.length === 0 ? 'Nincs felkínált tárgyad.' : 'Nincs találat.'}</p>
        )}
      </div>
    </div>
  );
}

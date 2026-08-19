import { h, type ComponentChildren, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import { DEFAULT_PRICE_PERCENT, type MarketItem, type MarketListing } from '@/utils/marketExtract';
import { matchesSearch } from '@/shared/text';
import { MARKET_SORT_OPTIONS, sortItems, sortListings, type MarketSortKey } from '@/desktop/marketSort';
import { useCompare } from '@/hooks/useCompare';
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

interface NameLineProps {
  /** The clickable text: an item's name, or an offer's whole label. */
  text: string;
  /** Name to open the database on, or null to render the text as plain. */
  detailName: string | null;
  pricePercent: number | null;
  /** True when a price exists but the market quotes no rate for it. */
  assumedRate: boolean;
  onOpenDetail: (name: string) => void;
  /** Parsed stat block, when there is one, for the compare card. */
  detail?: DetailLike | null;
  /** Extra badges for one column only, rendered after the rate. */
  children?: ComponentChildren;
}

/** Item name plus its market rate. Shared so every column reads identically. */
export function NameLine({ text, detailName, pricePercent, assumedRate, onOpenDetail, detail, children }: NameLineProps): JSX.Element {
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
      {pricePercent !== null ? (
        <span class="lc-mkt-pct">{pricePercent}%</span>
      ) : assumedRate && (
        /* The market does not quote this item, so the rate behind the suggested
           price is ours. Marked, so the figure is not mistaken for the game's. */
        <span
          class="lc-mkt-pct lc-mkt-pct--assumed"
          title={`A piac nem adja meg az árfolyamot — ${DEFAULT_PRICE_PERCENT}%-kal számolva`}
        >
          {DEFAULT_PRICE_PERCENT}%?
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
          pricePercent={item.pricePercent}
          assumedRate={item.suggestedPrice !== null}
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
          {item.price !== null && <span>bolti ár {silver(item.price)}</span>}
          {item.suggestedPrice !== null && <span>piaci ár {silver(item.suggestedPrice)}</span>}
          {priceValid && <span class="lc-mkt-total">összesen {silver(price * qty)}</span>}
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
          pricePercent={listing.pricePercent}
          assumedRate={listing.suggestedPrice !== null}
          onOpenDetail={onOpenDetail}
          detail={listing.detail}
        />
        <div class="lc-mkt-meta">
          {listing.shopPrice !== null && <span>bolti ár {silver(listing.shopPrice)}</span>}
          {listing.suggestedPrice !== null && <span>piaci ár {silver(listing.suggestedPrice)}</span>}
          {asking !== null && <span class="lc-mkt-total">összesen {silver(asking * qty)}</span>}
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

/** A column's control labels, spelled out so each one is separately addressable. */
interface ColumnLabels {
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

interface ToolbarProps {
  labels: ColumnLabels;
  search: string;
  onSearch: (value: string) => void;
  sortKey: MarketSortKey;
  onSortKey: (key: MarketSortKey) => void;
  asc: boolean;
  onFlip: () => void;
}

/**
 * Search, sort key and direction — the home view's toolbar, one per column, with
 * that view's own select and button classes so the two read alike.
 */
export function Toolbar({ labels, search, onSearch, sortKey, onSortKey, asc, onFlip }: ToolbarProps): JSX.Element {
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
        onChange={(e) => onSortKey((e.target as HTMLSelectElement).value as MarketSortKey)}
      >
        {MARKET_SORT_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
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
  const [sortKey, setSortKey] = useState<MarketSortKey>('name');
  const [asc, setAsc] = useState(true);

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
          onFlip={() => setAsc((v) => !v)}
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
  const [sortKey, setSortKey] = useState<MarketSortKey>('name');
  const [asc, setAsc] = useState(true);

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
          onFlip={() => setAsc((v) => !v)}
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

import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import { DEFAULT_PRICE_PERCENT, type MarketItem, type MarketListing, type MarketState } from '@/utils/marketExtract';
import { DockedPanel } from '@/components/DockedPanel';
import { MARKET_MINIMIZED_KEY } from '@/utils/config';
import { matchesSearch } from '@/shared/text';
import { DatabaseOverlay } from '@/components/DatabaseOverlay';

export interface MarketPanelProps {
  open: boolean;
  onClose: () => void;
  state: MarketState;
}

/** Hungarian thousands grouping, matching the rest of the UI. */
function silver(n: number): string {
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
}

/** Item name plus its market rate. Shared so both columns read identically. */
function NameLine({ text, detailName, pricePercent, assumedRate, onOpenDetail }: NameLineProps): JSX.Element {
  return (
    <div class="lc-mkt-name-line">
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

function NumberField({ label, value, min, max, disabled, onInput }: NumberFieldProps): JSX.Element {
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

interface OfferRowProps {
  item: MarketItem;
  onOffer: (item: MarketItem, qty: number, price: number) => void;
  onOpenDetail: (name: string) => void;
}

/**
 * One backpack item, ready to offer. Quantity starts at the whole stack and the
 * price at what the market pays — the two values you would otherwise type by
 * hand every time — so offering is a single click unless you want to change one.
 */
function OfferRow({ item, onOffer, onOpenDetail }: OfferRowProps): JSX.Element {
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
        />
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
        <NameLine
          text={listing.label}
          detailName={name}
          pricePercent={listing.pricePercent}
          assumedRate={listing.suggestedPrice !== null}
          onOpenDetail={onOpenDetail}
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

/**
 * The market, docked beside the game: what you can offer on one side, what you
 * have already offered on the other — the same split the inventory uses, since
 * the task is the same shape (move things between two lists).
 *
 * The game's own form makes you pick an item from a dropdown, then type both a
 * quantity and a price with no indication of what the market pays. Here every
 * row carries its own inputs, pre-filled.
 */
export function MarketPanel({ open, onClose, state }: MarketPanelProps): JSX.Element {
  const [itemSearch, setItemSearch] = useState('');
  const [offerSearch, setOfferSearch] = useState('');
  const [detailName, setDetailName] = useState<string | undefined>(undefined);

  const items = state.items.filter((i) => matchesSearch(i.name, itemSearch));
  // Matched against the offer's whole label, so a price or a quantity narrows it
  // down as well as a name.
  const listings = state.listings.filter((l) => matchesSearch(l.label, offerSearch));

  return (
    <DockedPanel title="Piac" open={open} onClose={onClose} storageKey={MARKET_MINIMIZED_KEY} minimizable>
      <div class="lc-page lc-page--wide">
        <div class="lc-home-split-host">
          <div class="lc-home-split">
            <section class="lc-home-col">
              <header class="lc-home-col-head">
                <h2>🎒 Felkínálható</h2>
                <span class="lc-home-count">{state.items.length}</span>
              </header>
              {state.items.length > 0 && (
                <input
                  class="lc-inv-search"
                  type="search"
                  placeholder="keresés…"
                  aria-label="Keresés a felkínálható tárgyak között"
                  value={itemSearch}
                  onInput={(e) => setItemSearch((e.target as HTMLInputElement).value)}
                />
              )}
              <div class="lc-mkt-list">
                {items.map((item) => (
                  <OfferRow key={item.index} item={item} onOffer={state.offer} onOpenDetail={setDetailName} />
                ))}
                {items.length === 0 && (
                  <p class="lc-mkt-empty">
                    {state.items.length === 0 ? 'A hátizsákod üres.' : 'Nincs találat.'}
                  </p>
                )}
              </div>
            </section>

            <section class="lc-home-col">
              <header class="lc-home-col-head">
                <h2>🏷 Felkínált tárgyaim</h2>
                <span class="lc-home-count">{state.listings.length}</span>
              </header>
              {state.listings.length > 0 && (
                <input
                  class="lc-inv-search"
                  type="search"
                  placeholder="keresés…"
                  aria-label="Keresés a felkínált tárgyaim között"
                  value={offerSearch}
                  onInput={(e) => setOfferSearch((e.target as HTMLInputElement).value)}
                />
              )}
              <div class="lc-mkt-list">
                {listings.map((listing) => (
                  <ListingRow key={listing.index} listing={listing} onOpenDetail={setDetailName} />
                ))}
                {listings.length === 0 && (
                  <p class="lc-mkt-empty">
                    {state.listings.length === 0 ? 'Nincs felkínált tárgyad.' : 'Nincs találat.'}
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Stacks above the market, like the inventory's item detail. DockedPanel
          keeps the layering and the Escape order straight. */}
      <DatabaseOverlay
        open={detailName !== undefined}
        initialItemName={detailName}
        onClose={() => setDetailName(undefined)}
      />
    </DockedPanel>
  );
}

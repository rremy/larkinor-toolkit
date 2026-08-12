import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { MarketItem, MarketListing, MarketState } from '@/utils/marketExtract';
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
        <div class="lc-mkt-name-line">
          <button
            class="lc-mkt-name lc-mkt-name--link"
            title={`${item.name} — adatlap`}
            onClick={() => onOpenDetail(item.name)}
          >
            {item.name}
          </button>
          {item.pricePercent !== null && <span class="lc-mkt-pct">{item.pricePercent}%</span>}
        </div>
        <div class="lc-mkt-meta">
          <span>{item.amount} db</span>
          {item.price !== null && <span>alapár {silver(item.price)}</span>}
          {priceValid && <span class="lc-mkt-total">összesen {silver(price * qty)}</span>}
        </div>
      </div>

      <label class="lc-mkt-field">
        <span>Db</span>
        <input
          type="number"
          min={1}
          max={item.amount}
          value={qty}
          onInput={(e) => setQty(clampQty(Number((e.target as HTMLInputElement).value)))}
        />
      </label>

      <label class="lc-mkt-field">
        <span>Ár</span>
        <input
          type="number"
          min={1}
          value={price}
          onInput={(e) => setPrice(Number((e.target as HTMLInputElement).value))}
        />
      </label>

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
  const name = listing.detail?.name;
  return (
    <div class="lc-mkt-row">
      <div class="lc-mkt-cell">
        {name ? (
          <button
            class="lc-mkt-name lc-mkt-name--link"
            title={`${name} — adatlap`}
            onClick={() => onOpenDetail(name)}
          >
            {listing.label}
          </button>
        ) : (
          <span class="lc-mkt-name">{listing.label}</span>
        )}
      </div>
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
  const [search, setSearch] = useState('');
  const [detailName, setDetailName] = useState<string | undefined>(undefined);

  const items = state.items.filter((i) => matchesSearch(i.name, search));

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
              <input
                class="lc-inv-search"
                type="search"
                placeholder="keresés…"
                value={search}
                onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
              />
              <div class="lc-mkt-list">
                {items.map((item) => (
                  <OfferRow key={item.index} item={item} onOffer={state.offer} onOpenDetail={setDetailName} />
                ))}
                {items.length === 0 && <p class="lc-mkt-empty">Nincs találat.</p>}
              </div>
            </section>

            <section class="lc-home-col">
              <header class="lc-home-col-head">
                <h2>🏷 Felkínált tárgyaim</h2>
                <span class="lc-home-count">{state.listings.length}</span>
              </header>
              <div class="lc-mkt-list">
                {state.listings.map((listing) => (
                  <ListingRow key={listing.index} listing={listing} onOpenDetail={setDetailName} />
                ))}
                {state.listings.length === 0 && <p class="lc-mkt-empty">Nincs felkínált tárgyad.</p>}
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

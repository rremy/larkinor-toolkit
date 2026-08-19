import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { MarketCatalogueEntry, MarketPurchase, MarketState } from '@/utils/marketExtract';
import { matchesSearch } from '@/shared/text';
import { NameLine, NumberField, silver } from '@/components/MarketRows';

// The buy side of the market. The game's own version is a 1424-entry dropdown
// with no search, and the flow is two steps with a page load between them:
// picking an item submits the page, which comes back with that item's offers.
// So this view is two stacked halves — find an item, then buy from what came
// back — and it has to read sensibly on arrival, since every search lands here
// afresh.

/**
 * Matches shown at once. The catalogue is long enough that an unfiltered list is
 * as unusable as the game's dropdown; the remainder is counted rather than
 * quietly dropped, so a narrower search is the obvious next step.
 */
const MAX_MATCHES = 20;

/** Characters before the catalogue is searched at all. */
const MIN_QUERY = 2;

interface PurchaseRowProps {
  purchase: MarketPurchase;
  /** The player's money, for flagging a total they cannot cover. */
  gold: number;
  onOpenDetail: (name: string) => void;
}

/**
 * One standing offer. The quantity starts at one, unlike the offer rows' whole
 * stack: this spends money, so the safe default is the smallest trade.
 */
function PurchaseRow({ purchase, gold, onOpenDetail }: PurchaseRowProps): JSX.Element {
  const stock = purchase.quantity ?? 1;
  const [qty, setQty] = useState(1);

  const clampQty = (n: number) => Math.max(1, Math.min(Number.isFinite(n) ? n : 1, stock));
  const total = purchase.unitPrice === null ? null : purchase.unitPrice * qty;
  const tooExpensive = total !== null && total > gold;

  return (
    <div class="lc-mkt-row">
      <div class="lc-mkt-cell">
        <NameLine
          text={purchase.detail?.name ?? purchase.label}
          detailName={purchase.detail?.name ?? null}
          pricePercent={purchase.pricePercent}
          assumedRate={false}
          onOpenDetail={onOpenDetail}
          detail={purchase.detail}
        />
        <div class="lc-mkt-meta">
          <span>{stock} db</span>
          {/* The three figures that decide a purchase: what is asked, what the
              shop charges, and what the market pays for it. */}
          {purchase.unitPrice !== null && <span>kért ár {silver(purchase.unitPrice)}</span>}
          {purchase.shopPrice !== null && <span>bolti ár {silver(purchase.shopPrice)}</span>}
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

      <NumberField label="Db" value={qty} min={1} max={stock} onInput={(n) => setQty(clampQty(n))} />

      {/* Not disabled when the total exceeds the money on hand: the figure is
          parsed off the page, and a bad parse must not block a trade the game
          itself would allow. The marked total is advice, not a gate. */}
      <button class="lc-mkt-buy-btn" title="Megveszed" onClick={() => purchase.buy(qty)}>
        Megvesz
      </button>
    </div>
  );
}

export interface MarketBuyProps {
  state: MarketState;
  onOpenDetail: (name: string) => void;
}

export function MarketBuy({ state, onOpenDetail }: MarketBuyProps): JSX.Element {
  const [query, setQuery] = useState('');

  const narrowed = query.trim().length >= MIN_QUERY;
  const matches = narrowed ? state.catalogue.filter((e) => matchesSearch(e.name, query)) : [];
  const shown = matches.slice(0, MAX_MATCHES);

  const pick = (item: MarketCatalogueEntry): void => state.search(item);

  return (
    <div class="lc-mkt-buy">
      <div class="lc-mkt-buy-find">
        <input
          class="lc-mkt-buy-search"
          type="search"
          placeholder="mit keresel?"
          aria-label="Keresés a piac kínálatában"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />

        {!narrowed && <p class="lc-mkt-empty">Írj be legalább 2 betűt a kereséshez.</p>}
        {narrowed && matches.length === 0 && <p class="lc-mkt-empty">Nincs ilyen tárgy a piacon.</p>}

        {shown.length > 0 && (
          <div class="lc-mkt-cat-list">
            {shown.map((item) => (
              <button
                key={item.id}
                class="lc-mkt-cat-row"
                /* Searching reloads the page — the game answers a search with a
                   fresh page — so the row says as much before it is tapped. */
                title={`${item.name} ajánlatai (újratölti az oldalt)`}
                onClick={() => pick(item)}
              >
                <span class="lc-mkt-name">{item.name}</span>
                {item.pricePercent !== null && <span class="lc-mkt-pct">{item.pricePercent}%</span>}
              </button>
            ))}
          </div>
        )}
        {matches.length > shown.length && (
          <p class="lc-mkt-more">még {matches.length - shown.length} találat — pontosítsd a keresést</p>
        )}
      </div>

      <div class="lc-mkt-buy-offers">
        {state.searchedName === null ? (
          <p class="lc-mkt-empty">Keress rá egy tárgyra, és itt jelennek meg az eladó tételek.</p>
        ) : (
          <header class="lc-mkt-buy-head">
            <h3>🛒 {state.searchedName}</h3>
            <span class="lc-home-count">{state.purchases.length}</span>
          </header>
        )}

        <div class="lc-mkt-list">
          {state.purchases.map((p) => (
            <PurchaseRow key={p.index} purchase={p} gold={state.gold} onOpenDetail={onOpenDetail} />
          ))}
          {state.searchedName !== null && state.purchases.length === 0 && (
            <p class="lc-mkt-empty">Ebből most nincs eladó tétel a piacon.</p>
          )}
        </div>
      </div>
    </div>
  );
}

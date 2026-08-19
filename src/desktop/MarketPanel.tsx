import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { MarketState } from '@/utils/marketExtract';
import { DockedPanel } from '@/components/DockedPanel';
import { getMarketTab, setMarketTab, MARKET_MINIMIZED_KEY } from '@/utils/config';
import { DatabaseOverlay } from '@/components/DatabaseOverlay';
import { ListingList, OfferableList } from '@/components/MarketRows';
import { MarketBuy } from '@/components/MarketBuy';
import { MarketActions } from '@/components/MarketActions';

export interface MarketPanelProps {
  open: boolean;
  onClose: () => void;
  state: MarketState;
}

/** The panel's two halves of the market. */
type PanelTab = 'sell' | 'buy';

/**
 * The market, docked beside the game: selling on one tab, buying on the other.
 *
 * Selling keeps the two-column split — what you can offer beside what you have
 * already offered — since the docked panel has the width for it and the task is
 * the same shape as the inventory's (move things between two lists). Buying is
 * a tab rather than a third column because it is a different job with its own
 * flow: it starts from a search, and that search reloads the game page.
 *
 * The game's own form makes you pick an item from a dropdown, then type both a
 * quantity and a price with no indication of what the market pays. Here every
 * row carries its own inputs, pre-filled.
 */
export function MarketPanel({ open, onClose, state }: MarketPanelProps): JSX.Element {
  const [detailName, setDetailName] = useState<string | undefined>(undefined);
  // One stored tab for both platforms: mobile's three selling tabs all land on
  // this panel's single selling tab, so a player moving between phone and
  // desktop keeps their place as closely as the two layouts allow.
  const [tab, setTab] = useState<PanelTab>(() => (getMarketTab() === 'buy' ? 'buy' : 'sell'));

  const select = (next: PanelTab): void => {
    setTab(next);
    setMarketTab(next === 'buy' ? 'buy' : 'offer');
  };

  return (
    <DockedPanel title="Piac" open={open} onClose={onClose} storageKey={MARKET_MINIMIZED_KEY} minimizable>
      <div class="lc-page lc-page--wide">
        <div class="lc-home-tabs">
          <button
            class={`lc-home-tab${tab === 'sell' ? ' lc-home-tab--active' : ''}`}
            onClick={() => select('sell')}
          >
            Eladás <span class="lc-home-count">{state.items.length + state.listings.length}</span>
          </button>
          <button
            class={`lc-home-tab${tab === 'buy' ? ' lc-home-tab--active' : ''}`}
            onClick={() => select('buy')}
          >
            Vétel
          </button>
        </div>

        {/* The page's own buttons, under the tabs rather than inside one: leaving
            the market and collecting what your sales earned belong to neither
            half of it. */}
        <MarketActions actions={state.actions} earnings={state.earnings} />

        {tab === 'sell' ? (
          <div class="lc-home-split-host">
            <div class="lc-home-split">
              <section class="lc-home-col">
                <header class="lc-home-col-head">
                  <h2>🎒 Felkínálható</h2>
                  <span class="lc-home-count">{state.items.length}</span>
                </header>
                <OfferableList
                  items={state.items}
                  listings={state.listings}
                  onOffer={state.offer}
                  onOpenDetail={setDetailName}
                />
              </section>

              <section class="lc-home-col">
                <header class="lc-home-col-head">
                  <h2>🏷 Felkínált tárgyaim</h2>
                  <span class="lc-home-count">{state.listings.length}</span>
                </header>
                <ListingList listings={state.listings} onOpenDetail={setDetailName} />
              </section>
            </div>
          </div>
        ) : (
          <MarketBuy state={state} onOpenDetail={setDetailName} />
        )}
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

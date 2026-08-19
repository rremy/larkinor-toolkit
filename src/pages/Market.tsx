import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { MarketState } from '@/utils/marketExtract';
import { getMarketTab, setMarketTab, type MarketTab } from '@/utils/config';
import { CapacityMeter } from '@/components/CapacityMeter';
import { NarrationPanel } from '@/components/NarrationPanel';
import { DatabaseOverlay } from '@/components/DatabaseOverlay';
import { ListingList, OfferableList, silver } from '@/components/MarketRows';
import { MarketBuy } from '@/components/MarketBuy';
import { MarketActions } from '@/components/MarketActions';

// The market as a phone page. The desktop panel can put the two selling lists
// side by side; here there is room for one at a time, so the market's four jobs
// — offer, review your offers, buy, and everything else the page can do — are
// tabs.
//
// The tab is remembered (see `getMarketTab`) because a purchase search reloads
// the game page: without it, every search would hand the player back the first
// tab and hide the offers they had just asked for.

interface TabDef {
  id: MarketTab;
  label: string;
  /** Shown beside the label; omitted for tabs whose contents have no count. */
  count?: number;
}

export interface MarketProps {
  state: MarketState;
}

export function Market({ state }: MarketProps): JSX.Element {
  const [tab, setTab] = useState<MarketTab>(() => getMarketTab() ?? 'offer');
  const [dbName, setDbName] = useState<string | undefined>(undefined);

  const select = (id: MarketTab): void => {
    setTab(id);
    setMarketTab(id);
  };

  const tabs: TabDef[] = [
    { id: 'offer', label: 'Felkínálható', count: state.items.length },
    { id: 'listings', label: 'Felkínált', count: state.listings.length },
    { id: 'buy', label: 'Vétel' },
    { id: 'other', label: 'Egyéb' },
  ];

  return (
    <div class="lc-page">
      {/* The narration first, and on every tab: it is where the game reports
          that a sale went through, and it is only printed on arrival. */}
      <NarrationPanel text={state.narration} db={null} onMonsterClick={() => {}} />

      <div class="lc-mkt-stats">
        <span class="lc-mkt-gold" title="Pénzed">💰 {silver(state.gold)}</span>
        {/* What the sales earned and nobody has collected — the reason to come
            back to the market, so it sits here rather than behind the Egyéb tab,
            and collects on tap so the money is one press away. Shown only when
            there is something to take: zero is nothing to look at.

            Seeing the figure does not depend on the button: if the page ever
            prints the amount without its control, the amount is still the answer
            to "is there anything waiting?" and is rendered as plain text. */}
        {state.earnings !== null && state.earnings > 0 && (
          state.actions.collectMoney ? (
            <button
              class="lc-mkt-earnings"
              title="Felveszed a pénzt"
              onClick={() => state.actions.collectMoney!.trigger()}
            >
              🏦 {silver(state.earnings)}
            </button>
          ) : (
            <span class="lc-mkt-earnings lc-mkt-earnings--static" title="Felvehető pénzed a piacon">
              🏦 {silver(state.earnings)}
            </span>
          )
        )}
        <CapacityMeter label="Hátizsák &amp; test" icon="🎒" used={state.weight.used} max={state.weight.max} />
      </div>

      <div class="lc-home-tabs">
        {tabs.map(({ id, label, count }) => (
          <button
            key={id}
            class={`lc-home-tab${tab === id ? ' lc-home-tab--active' : ''}`}
            onClick={() => select(id)}
          >
            {label}
            {count !== undefined && <span class="lc-home-count">{count}</span>}
          </button>
        ))}
      </div>

      {/* The tab body carries the page's side gutter: the narration and the tab
          strip above it are deliberately full-bleed, so putting the padding on
          the page itself would indent them too. */}
      <div class="lc-mkt-body">
        {tab === 'offer' && (
          <OfferableList
            items={state.items}
            listings={state.listings}
            onOffer={state.offer}
            onOpenDetail={setDbName}
          />
        )}

        {tab === 'listings' && <ListingList listings={state.listings} onOpenDetail={setDbName} />}

        {tab === 'buy' && <MarketBuy state={state} onOpenDetail={setDbName} />}

        {tab === 'other' && <MarketActions actions={state.actions} earnings={state.earnings} />}
      </div>

      <DatabaseOverlay
        open={dbName !== undefined}
        initialItemName={dbName}
        onClose={() => setDbName(undefined)}
      />
    </div>
  );
}

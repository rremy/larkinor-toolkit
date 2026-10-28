import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { ShopState } from '@/utils/shopExtract';
import { getShopTab, setShopTab, type ShopTab } from '@/utils/config';
import { NarrationPanel } from '@/components/NarrationPanel';
import { DatabaseButton } from '@/components/DatabaseButton';
import { DatabaseOverlay } from '@/components/DatabaseOverlay';
import { silver } from '@/components/MarketRows';
import { ShopActionButtons, ShopBuyList, ShopSellList } from '@/components/ShopRows';

// A shop as a phone page — the Vegyesbolt, the Fegyverbolt and the Templom,
// which share one form. Buying, selling and the page's other controls are tabs,
// remembered across the reload every trade causes. The Templom buys nothing, so
// it has no selling tab, and its prayers, insurance and collection box are its
// "other" tab.

export interface ShopProps {
  state: ShopState;
}

export function Shop({ state }: ShopProps): JSX.Element {
  const canSell = state.kind !== 'church';
  const [tab, setTab] = useState<ShopTab>(() => {
    const stored = getShopTab();
    return stored === 'sell' && !canSell ? 'buy' : stored ?? 'buy';
  });
  const [dbName, setDbName] = useState<string | undefined>(undefined);

  const select = (id: ShopTab): void => {
    setTab(id);
    setShopTab(id);
  };

  const tabs: Array<{ id: ShopTab; label: string; count?: number }> = [
    { id: 'buy', label: 'Vétel', count: state.buy.length },
    ...(canSell ? [{ id: 'sell' as const, label: 'Eladás', count: state.sell.length }] : []),
    { id: 'other', label: state.kind === 'church' ? 'Templom' : 'Egyéb' },
  ];

  return (
    <div class="lc-page">
      <NarrationPanel text={state.narration} db={null} onMonsterClick={() => {}} />

      <div class="lc-mkt-stats">
        <span class="lc-shop-title">{state.title}</span>
        <span class="lc-mkt-gold" title="Pénzed">💰 {silver(state.gold)}</span>
        {/* '' opens the database plainly: no item name to land on. */}
        <DatabaseButton onClick={() => setDbName('')} />
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

      <div class="lc-mkt-body">
        {tab === 'buy' && (
          <ShopBuyList items={state.buy} gold={state.gold} onBuy={state.purchase} onOpenDetail={setDbName} />
        )}

        {tab === 'sell' && canSell && (
          <ShopSellList
            items={state.sell}
            onSellOne={state.sellOne}
            onSellMany={state.sellMany}
            onOpenDetail={setDbName}
          />
        )}

        {tab === 'other' && (
          <div>
            {state.ailments !== null && (
              <div class="lc-shop-ailments">
                <h3>Negatív hatások</h3>
                <p>{state.ailments}</p>
              </div>
            )}
            <ShopActionButtons actions={state.actions} withOther />
          </div>
        )}
      </div>

      <DatabaseOverlay
        open={dbName !== undefined}
        initialItemName={dbName}
        onClose={() => setDbName(undefined)}
      />
    </div>
  );
}

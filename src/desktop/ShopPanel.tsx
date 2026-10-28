import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { ShopState } from '@/utils/shopExtract';
import { DockedPanel } from '@/components/DockedPanel';
import { DatabaseOverlay } from '@/components/DatabaseOverlay';
import { getShopTab, setShopTab, SHOP_MINIMIZED_KEY } from '@/utils/config';
import { ShopActionButtons, ShopBuyList, ShopSellList } from '@/components/ShopRows';

export interface ShopPanelProps {
  open: boolean;
  onClose: () => void;
  state: ShopState;
}

type PanelTab = 'buy' | 'sell';

/**
 * A shop, docked beside the game: buying on one tab, selling on the other, the
 * same rows as the phone page. The page's other controls — the Templom's prayers
 * and collection box — are left on the game page, which stays visible here and
 * already makes each of them one click.
 */
export function ShopPanel({ open, onClose, state }: ShopPanelProps): JSX.Element {
  const canSell = state.kind !== 'church';
  const [detailName, setDetailName] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<PanelTab>(() => (getShopTab() === 'sell' && canSell ? 'sell' : 'buy'));

  const select = (next: PanelTab): void => {
    setTab(next);
    setShopTab(next);
  };

  return (
    <DockedPanel title={state.title || 'Bolt'} open={open} onClose={onClose} storageKey={SHOP_MINIMIZED_KEY} minimizable>
      <div class="lc-page lc-page--wide">
        <div class="lc-home-tabs">
          <button class={`lc-home-tab${tab === 'buy' ? ' lc-home-tab--active' : ''}`} onClick={() => select('buy')}>
            Vétel <span class="lc-home-count">{state.buy.length}</span>
          </button>
          {canSell && (
            <button class={`lc-home-tab${tab === 'sell' ? ' lc-home-tab--active' : ''}`} onClick={() => select('sell')}>
              Eladás <span class="lc-home-count">{state.sell.length}</span>
            </button>
          )}
        </div>

        <ShopActionButtons actions={state.actions} />

        {tab === 'sell' && canSell ? (
          <ShopSellList
            items={state.sell}
            onSellOne={state.sellOne}
            onSellMany={state.sellMany}
            onOpenDetail={setDetailName}
          />
        ) : (
          <ShopBuyList items={state.buy} gold={state.gold} onBuy={state.purchase} onOpenDetail={setDetailName} />
        )}
      </div>

      <DatabaseOverlay
        open={detailName !== undefined}
        initialItemName={detailName}
        onClose={() => setDetailName(undefined)}
      />
    </DockedPanel>
  );
}

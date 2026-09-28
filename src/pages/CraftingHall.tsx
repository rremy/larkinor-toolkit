import { h, type JSX } from 'preact';
import type { DataLoader } from '@/shared/data';
import type { CraftingHallState } from '@/utils/craftingExtract';
import { NarrationPanel } from '@/components/NarrationPanel';
import { CraftingPanel } from '@/components/CraftingPanel';
import { HallSideSection } from '@/components/HallSideForm';
import { silver } from '@/components/MarketRows';

// A crafting hall as a phone page. The narration leads: it is where the game
// reports what a craft produced, and it is only printed on arrival.

export interface CraftingHallProps {
  state: CraftingHallState;
  loader: DataLoader;
}

export function CraftingHall({ state, loader }: CraftingHallProps): JSX.Element {
  return (
    <div class="lc-page">
      <NarrationPanel text={state.narration} db={null} onMonsterClick={() => {}} />
      <div class="lc-mkt-stats">
        <span class="lc-mkt-gold" title="Pénzed">💰 {silver(state.gold)}</span>
      </div>
      <div class="lc-mkt-body">
        <CraftingPanel state={state} loader={loader} />
        {state.side && <HallSideSection side={state.side} />}
        {state.exit && (
          <div class="lc-mkt-actions">
            <button class="lc-home-act lc-home-act--wide" onClick={() => state.exit!.trigger()}>
              <img class="lc-mkt-act-icon" src={state.exit.iconUrl} alt="" />
              {state.exit.label}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

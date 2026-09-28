import { h, type JSX } from 'preact';
import type { BuildingLobbyState } from '@/utils/craftingExtract';
import type { BuildingOption } from '@/utils/domExtract';
import { NarrationPanel } from '@/components/NarrationPanel';
import { silver } from '@/components/MarketRows';

// The Erőd's and the Mágustorony's lobbies as a phone page: nothing but the
// page's own titled controls (enter the hall, train a skill, leave), each
// labelled by the game's own title, with the exit last.

export interface BuildingLobbyProps {
  state: BuildingLobbyState;
}

function Control({ option, wide }: { option: BuildingOption; wide?: boolean }): JSX.Element {
  return (
    <button class={`lc-home-act${wide ? ' lc-home-act--wide' : ''}`} onClick={() => option.trigger()}>
      <img class="lc-mkt-act-icon" src={option.iconUrl} alt="" />
      {option.label}
    </button>
  );
}

export function BuildingLobby({ state }: BuildingLobbyProps): JSX.Element {
  return (
    <div class="lc-page">
      <NarrationPanel text={state.narration} db={null} onMonsterClick={() => {}} />
      <div class="lc-mkt-stats">
        <span class="lc-mkt-gold" title="Pénzed">💰 {silver(state.gold)}</span>
      </div>
      <div class="lc-mkt-body">
        <div class="lc-mkt-actions">
          {state.controls.map((c) => <Control key={c.label} option={c} wide />)}
          {state.exit && <Control option={state.exit} wide />}
        </div>
      </div>
    </div>
  );
}

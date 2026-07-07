import { h, type JSX } from 'preact';
import type { DungeonState } from '@/utils/domExtract';
import { StatBar } from '@/components/StatBar';
import { NavPad } from '@/components/NavPad';
import { NarrationPanel } from '@/components/NarrationPanel';
import { DungeonCell } from '@/components/DungeonCell';
import { QuestionPanel } from '@/components/QuestionPanel';

export interface DungeonProps {
  state: DungeonState;
}

export function Dungeon({ state }: DungeonProps): JSX.Element {
  return (
    <div class="lc-page lc-dungeon">
      <div class="lc-dungeon-cell-wrap">
        <DungeonCell tiles={state.tiles} />
      </div>

      <StatBar hp={state.hp} hpMax={state.hpMax} mp={state.mp} mpMax={state.mpMax} gold={state.gold} statusIcons={state.statusIcons} />

      {state.question ? (
        // Movement is blocked until the question is answered — replace the
        // controls with the question panel.
        <QuestionPanel question={state.question} />
      ) : (
        <>
          <NavPad directions={state.directions} />

          {state.buildings.length > 0 && (
            <div class="lc-section lc-buildings">
              {state.buildings.map((b, i) => (
                <button key={i} class="lc-building-btn" title={b.label} onClick={() => b.trigger()}>
                  {b.iconUrl && <img class="lc-building-icon" src={b.iconUrl} alt="" />}
                  <span class="lc-building-label">{b.label}</span>
                </button>
              ))}
            </div>
          )}

          <NarrationPanel text={state.narration} db={null} onMonsterClick={() => {}} />

          {state.actions.length > 0 && (
            <div class="lc-section">
              {state.actions.map((action, i) => (
                <button key={i} class="lc-btn" onClick={() => action.trigger()}>
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

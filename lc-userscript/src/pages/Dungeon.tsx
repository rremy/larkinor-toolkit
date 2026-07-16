import { h, type JSX } from 'preact';
import type { DungeonState } from '@/utils/domExtract';
import { StatBar } from '@/components/StatBar';
import { NavPad } from '@/components/NavPad';
import { NarrationPanel } from '@/components/NarrationPanel';
import { DungeonCell } from '@/components/DungeonCell';
import { QuestionPanel } from '@/components/QuestionPanel';
import { ConfigDrawer } from '@/components/ConfigDrawer';
import { HotkeyRow } from '@/components/HotkeyRow';
import { partitionHotkeys } from '@/utils/hotkeys';
import { useHotkeyConfig } from '@/hooks/useHotkeyConfig';

export interface DungeonProps {
  state: DungeonState;
}

export function Dungeon({ state }: DungeonProps): JSX.Element {
  const { enabled, configOpen, openConfig, closeConfig, toggleHotkey } = useHotkeyConfig();
  const { hotkeyActions, buttonActions } = partitionHotkeys(state.actions, enabled);

  return (
    <div class="lc-page lc-dungeon">
      <div class="lc-hero">
        <div class="lc-dungeon-cell-wrap">
          <DungeonCell tiles={state.tiles} />
        </div>
        <StatBar hp={state.hp} hpMax={state.hpMax} mp={state.mp} mpMax={state.mpMax} gold={state.gold} statusIcons={state.statusIcons} onConfig={openConfig} />
      </div>

      {state.question ? (
        // Movement is blocked until the question is answered — replace the
        // controls with the question panel.
        <QuestionPanel question={state.question} />
      ) : (
        <>
          <NavPad directions={state.directions} cornerLeft={state.settingsButton} cornerRight={state.restButton}>
            <HotkeyRow actions={hotkeyActions} />
          </NavPad>

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

          <NarrationPanel text={state.narration} db={null} onMonsterClick={() => {}} links={state.narrationLinks} />

          {buttonActions.length > 0 && (
            <div class="lc-section">
              {buttonActions.map((action, i) => (
                <button key={`act${i}`} class="lc-btn" onClick={() => action.trigger()}>
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {configOpen && (
        <ConfigDrawer enabled={enabled} onToggle={toggleHotkey} onClose={closeConfig} />
      )}
    </div>
  );
}

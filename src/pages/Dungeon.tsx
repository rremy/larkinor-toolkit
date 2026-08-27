import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { DungeonState } from '@/utils/domExtract';
import { StatBar } from '@/components/StatBar';
import { NavPad } from '@/components/NavPad';
import { NarrationPanel } from '@/components/NarrationPanel';
import { DungeonCell } from '@/components/DungeonCell';
import { QuestionPanel } from '@/components/QuestionPanel';
import { ConfigDrawer } from '@/components/ConfigDrawer';
import { DatabaseOverlay } from '@/components/DatabaseOverlay';
import { HotkeyRow } from '@/components/HotkeyRow';
import { partitionHotkeys } from '@/utils/hotkeys';
import { useHotkeyConfig } from '@/hooks/useHotkeyConfig';
import { findActiveQuest } from '@/utils/activeQuest';

export interface DungeonProps {
  state: DungeonState;
}

export function Dungeon({ state }: DungeonProps): JSX.Element {
  const { enabled, configOpen, openConfig, closeConfig, toggleHotkey } = useHotkeyConfig();
  const { hotkeyActions, buttonActions } = partitionHotkeys(state.actions, enabled);
  const [dbOpen, setDbOpen] = useState(false);
  // The quests shortcut carries a nonce rather than the bare 'quests' literal:
  // setting the same value again is a no-op state update, so a second press
  // would never re-navigate an overlay the player had since moved to another
  // tab. Undefined until the first press, leaving the plain database button
  // opening on the remembered route. Same shape as the desktop dock's.
  //
  // Shared between the StatBar shortcut and the narration's active-quest
  // link, rather than one nonce each, so a press from either one always
  // re-navigates regardless of which fired last. `questTargetId` is the only
  // piece the link sets — the StatBar shortcut only ever clears it — which is
  // what keeps the shortcut landing on the remembered quest instead of
  // whichever one the narration last named.
  const [questsSeq, setQuestsSeq] = useState<number | null>(null);
  const [questTargetId, setQuestTargetId] = useState<string | null>(null);

  // The game names the active royal quest in the narration; make the sentence
  // the way into the quests tab. The pref writes happen in the boot — this is
  // only the affordance.
  const activeQuest = findActiveQuest(state.narration);

  const openDatabase = () => { setQuestsSeq(null); setDbOpen(true); };
  // No `initialQuest`: the quests tab restores whichever quest the player last
  // had open, which in a maze is the one they are walking.
  const openQuests = () => { setQuestTargetId(null); setQuestsSeq(seq => (seq ?? 0) + 1); setDbOpen(true); };

  return (
    <div class="lc-page lc-dungeon">
      <div class="lc-hero">
        <div class="lc-dungeon-cell-wrap">
          <DungeonCell tiles={state.tiles} />
        </div>
        <StatBar hp={state.hp} hpMax={state.hpMax} mp={state.mp} mpMax={state.mpMax} gold={state.gold} statusIcons={state.statusIcons} onConfig={openConfig} onDatabase={openDatabase} onQuests={openQuests} />
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

          <NarrationPanel
            text={state.narration}
            db={null}
            onMonsterClick={() => {}}
            links={state.narrationLinks}
            questLink={activeQuest
              ? {
                  index: activeQuest.index,
                  length: activeQuest.length,
                  onClick: () => {
                    setQuestTargetId(activeQuest.questId);
                    setQuestsSeq(seq => (seq ?? 0) + 1);
                    setDbOpen(true);
                  },
                }
              : undefined}
          />

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

      {/* Not minimizable: docking beside the game needs desktop's spare width. */}
      <DatabaseOverlay
        open={dbOpen}
        initialTab={questsSeq === null ? undefined : 'quests'}
        initialTabKey={questsSeq ?? undefined}
        initialQuest={questTargetId ? { set: 'royal', id: questTargetId } : null}
        onClose={() => setDbOpen(false)}
      />
    </div>
  );
}

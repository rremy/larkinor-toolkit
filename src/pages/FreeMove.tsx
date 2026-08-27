import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { FreeMoveState } from '@/utils/domExtract';
import type { MonsterDatabase, Monster } from '@/shared/data/monsters';
import { StatBar } from '@/components/StatBar';
import { NavPad } from '@/components/NavPad';
import { NarrationPanel } from '@/components/NarrationPanel';
import { MonsterCard } from '@/components/MonsterCard';
import { ConfigDrawer } from '@/components/ConfigDrawer';
import { HotkeyRow } from '@/components/HotkeyRow';
import { DatabaseOverlay } from '@/components/DatabaseOverlay';
import { partitionHotkeys } from '@/utils/hotkeys';
import { useHotkeyConfig } from '@/hooks/useHotkeyConfig';
import { findActiveQuest } from '@/utils/activeQuest';

export interface FreeMoveProps {
  state: FreeMoveState;
  db: MonsterDatabase | null;
}

export function FreeMove({ state, db }: FreeMoveProps): JSX.Element {
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);
  const [dbOpen, setDbOpen] = useState(false);
  const [dbItemId, setDbItemId] = useState<number | null>(null);
  const { enabled, configOpen, openConfig, closeConfig, toggleHotkey } = useHotkeyConfig();
  // The game names the active royal quest in the narration; make the sentence
  // the way into the quests tab. The pref writes happen in the boot — this is
  // only the affordance.
  const activeQuest = findActiveQuest(state.narration);
  const [questRoute, setQuestRoute] = useState<{ id: string; seq: number } | null>(null);

  const { hotkeyActions, buttonActions } = partitionHotkeys(state.actions, enabled);

  return (
    <div class="lc-page">
      <div class="lc-hero">
        {state.locationImageUrl && (
          <img class="lc-hero-img" src={state.locationImageUrl} alt={state.locationName} />
        )}
        <StatBar hp={state.hp} hpMax={state.hpMax} mp={state.mp} mpMax={state.mpMax} gold={state.gold} statusIcons={state.statusIcons} onConfig={openConfig} onDatabase={() => { setDbItemId(null); setDbOpen(true); }} />
      </div>

      <NavPad directions={state.directions} attack={state.attack} cornerLeft={state.settingsButton} cornerRight={state.restButton}>
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
        db={db}
        onMonsterClick={setSelectedMonster}
        links={state.narrationLinks}
        questLink={activeQuest
          ? {
              index: activeQuest.index,
              length: activeQuest.length,
              onClick: () => {
                setQuestRoute((r) => ({ id: activeQuest.questId, seq: (r?.seq ?? 0) + 1 }));
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

      <MonsterCard
        monster={selectedMonster}
        onClose={() => setSelectedMonster(null)}
        onItemClick={(id) => { setSelectedMonster(null); setDbItemId(id); setDbOpen(true); }}
      />

      {configOpen && (
        <ConfigDrawer enabled={enabled} onToggle={toggleHotkey} onClose={closeConfig} />
      )}

      <DatabaseOverlay
        open={dbOpen}
        initialItemId={dbItemId ?? undefined}
        initialTab={questRoute ? 'quests' : undefined}
        initialTabKey={questRoute?.seq}
        initialQuest={questRoute ? { set: 'royal', id: questRoute.id } : null}
        onClose={() => setDbOpen(false)}
      />
    </div>
  );
}

import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { BattleState } from '@/utils/domExtract';
import type { MonsterDatabase, Monster } from '@/shared/data/monsters';
import { StatBar } from '@/components/StatBar';
import { NarrationPanel } from '@/components/NarrationPanel';
import { MonsterCard } from '@/components/MonsterCard';
import { DatabaseOverlay } from '@/components/DatabaseOverlay';
import { findActiveQuest } from '@/utils/activeQuest';

export interface BattleProps {
  state: BattleState;
  db: MonsterDatabase | null;
}

export function Battle({ state, db }: BattleProps): JSX.Element {
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);
  const [dbOpen, setDbOpen] = useState(false);
  const [dbItemId, setDbItemId] = useState<number | null>(null);
  // The game names the active royal quest in the narration; make the sentence
  // the way into the quests tab. The pref writes happen in the boot — this is
  // only the affordance.
  //
  // The MonsterCard item link is the only other opener of the overlay here,
  // and it must clear this back to null. DockedPanel unmounts DatabaseApp on
  // close, so a stale route would force-navigate the *next* open back into
  // that quest — including a later open that has nothing to do with quests
  // at all. (`initialItemId` taking precedence in DatabaseApp's guard only
  // masks the symptom on the open that sets it; it does not clear the state.)
  const activeQuest = findActiveQuest(state.narration);
  const [questRoute, setQuestRoute] = useState<{ id: string; seq: number } | null>(null);

  const dbMonster = db?.getByName(state.monsterName) ?? null;

  // The two weapon attacks share a row; the elemental spells sit in an icon row
  // below them; anything else (flee, untagged) stays stacked full-width.
  const attacks = state.actions.filter(a => a.kind === 'attack');
  const spells = state.actions.filter(a => a.kind === 'spell');
  const otherActions = state.actions.filter(a => a.kind !== 'attack' && a.kind !== 'spell');

  return (
    <div class="lc-page">
      {state.monsterImageUrl && (
        <img class="lc-hero-img" src={state.monsterImageUrl} alt={state.monsterName} />
      )}

      <div class="lc-section lc-battle-header">
        {dbMonster ? (
          <span
            class="lc-battle-monster-name lc-monster-link"
            onClick={() => setSelectedMonster(dbMonster)}
          >
            {state.monsterName}
          </span>
        ) : (
          <span class="lc-battle-monster-name">{state.monsterName}</span>
        )}

        {state.monsterHp !== null && (
          <span class="lc-battle-hp">❤ {state.monsterHp}</span>
        )}

        {dbMonster && (
          <span class="lc-battle-level-badge">Szint {dbMonster.level}</span>
        )}
      </div>

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

      <StatBar hp={state.hp} hpMax={state.hpMax} mp={state.mp} mpMax={state.mpMax} />

      {state.actions.length > 0 && (
        <div class="lc-section">
          {attacks.length > 0 && (
            <div class="lc-battle-attacks">
              {attacks.map((action, i) => (
                <button key={`atk${i}`} class="lc-btn lc-battle-attack" onClick={() => action.trigger()}>
                  {action.label}
                </button>
              ))}
            </div>
          )}
          {spells.length > 0 && (
            <div class="lc-battle-spells">
              {spells.map((action, i) => (
                <button
                  key={`sp${i}`}
                  class="lc-btn lc-battle-spell"
                  title={action.label}
                  aria-label={action.label}
                  onClick={() => action.trigger()}
                >
                  {action.iconUrl ? (
                    <img class="lc-battle-spell-icon" src={action.iconUrl} alt={action.label} />
                  ) : (
                    action.label
                  )}
                </button>
              ))}
            </div>
          )}
          {otherActions.map((action, i) => (
            <button key={`act${i}`} class="lc-btn" onClick={() => action.trigger()}>
              {action.label}
            </button>
          ))}
        </div>
      )}

      <MonsterCard
        monster={selectedMonster}
        onClose={() => setSelectedMonster(null)}
        onItemClick={(id) => { setSelectedMonster(null); setDbItemId(id); setQuestRoute(null); setDbOpen(true); }}
      />

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

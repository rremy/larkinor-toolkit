import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { BattleState } from '@/utils/domExtract';
import type { MonsterDatabase, Monster } from '@/data/monsters';
import { StatBar } from '@/components/StatBar';
import { NarrationPanel } from '@/components/NarrationPanel';
import { MonsterCard } from '@/components/MonsterCard';

export interface BattleProps {
  state: BattleState;
  db: MonsterDatabase | null;
}

export function Battle({ state, db }: BattleProps): JSX.Element {
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);

  const dbMonster = db?.getByName(state.monsterName) ?? null;

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

      <NarrationPanel text={state.narration} db={db} onMonsterClick={setSelectedMonster} />

      <StatBar hp={state.hp} hpMax={state.hpMax} mp={state.mp} mpMax={state.mpMax} />

      {state.actions.length > 0 && (
        <div class="lc-section">
          {state.actions.map((action, i) => (
            <button key={i} class="lc-btn" onClick={() => action.trigger()}>
              {action.label}
            </button>
          ))}
        </div>
      )}

      <MonsterCard monster={selectedMonster} onClose={() => setSelectedMonster(null)} />
    </div>
  );
}

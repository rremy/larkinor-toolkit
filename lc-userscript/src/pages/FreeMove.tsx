import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { FreeMoveState } from '@/utils/domExtract';
import type { MonsterDatabase, Monster } from '@/data/monsters';
import { StatBar } from '@/components/StatBar';
import { NavPad } from '@/components/NavPad';
import { NarrationPanel } from '@/components/NarrationPanel';
import { MonsterCard } from '@/components/MonsterCard';

export interface FreeMoveProps {
  state: FreeMoveState;
  db: MonsterDatabase | null;
}

export function FreeMove({ state, db }: FreeMoveProps): JSX.Element {
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);

  return (
    <div class="lc-page">
      {state.locationImageUrl && (
        <img class="lc-hero-img" src={state.locationImageUrl} alt={state.locationName} />
      )}

      <StatBar hp={state.hp} hpMax={state.hpMax} mp={state.mp} mpMax={state.mpMax} gold={state.gold} />

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

      <NarrationPanel text={state.narration} db={db} onMonsterClick={setSelectedMonster} />

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

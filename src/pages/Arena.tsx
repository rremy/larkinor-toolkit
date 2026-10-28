import { h, type JSX } from 'preact';
import type { ArenaState } from '@/utils/buildingExtract';
import { NarrationPanel } from '@/components/NarrationPanel';
import { StatBar } from '@/components/StatBar';
import { silver } from '@/components/MarketRows';
import { AmountForm, ControlButton } from '@/components/BuildingControls';

// The arena as a phone page: the fight and a rest up top — the arena's reason
// to exist — then the clone, whose bet field both of its buttons read.

export interface ArenaProps {
  state: ArenaState;
}

export function Arena({ state }: ArenaProps): JSX.Element {
  const { clone } = state;
  return (
    <div class="lc-page">
      <StatBar hp={state.hp} hpMax={state.hpMax} mp={state.mp} mpMax={state.mpMax} gold={state.gold} />
      <NarrationPanel text={state.narration} db={null} onMonsterClick={() => {}} />

      <div class="lc-mkt-body">
        <div class="lc-mkt-actions">
          <ControlButton option={state.fight} wide label="Harc az arénában" />
          <ControlButton option={state.rest} />
          <ControlButton option={state.exit} />
        </div>

        <section class="lc-bld-section">
          <h3>Klón</h3>
          <div class="lc-bld-figures lc-bld-figures--inline">
            {clone.status !== null && (
              <div class="lc-bld-figure"><span>Állapota</span><b>{clone.status}</b></div>
            )}
            {clone.winnings !== null && (
              <div class="lc-bld-figure"><span>Eddig nyert</span><b>{silver(clone.winnings)}</b></div>
            )}
          </div>
          {clone.note && <p class="lc-mkt-empty">{clone.note}</p>}
          <AmountForm action={clone.enter} caption="Klónra tett pénz" label="Benevezed" initial={clone.bet ?? 0} />
          {clone.collect && (
            <div class="lc-mkt-actions">
              <button class="lc-home-act lc-home-act--wide" title={clone.collect.label} onClick={() => clone.collect!.run(clone.bet ?? 0)}>
                <img class="lc-mkt-act-icon" src={clone.collect.iconUrl} alt="" />
                Felveszed a nyereményt
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

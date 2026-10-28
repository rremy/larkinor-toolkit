import { h, type JSX } from 'preact';
import type { BankState } from '@/utils/buildingExtract';
import { NarrationPanel } from '@/components/NarrationPanel';
import { silver } from '@/components/MarketRows';
import { AmountForm, ControlButton } from '@/components/BuildingControls';

// The bank as a phone page: what is in the account, then the two amount forms,
// then the page's fixed-amount buttons. The game's page hides the balance among
// four identical "elad" images; here each action says what it does.

export interface BankProps {
  state: BankState;
}

export function Bank({ state }: BankProps): JSX.Element {
  return (
    <div class="lc-page">
      <NarrationPanel text={state.narration} db={null} onMonsterClick={() => {}} />

      <div class="lc-bld-figures">
        <div class="lc-bld-figure">
          <span>Nálad</span>
          <b>💰 {silver(state.gold)}</b>
        </div>
        <div class="lc-bld-figure">
          <span>Számládon</span>
          <b>🏦 {state.balance === null ? '—' : silver(state.balance)}</b>
        </div>
        {state.repaid !== null && (
          <div class="lc-bld-figure">
            <span>Királynak törlesztve</span>
            <b>{silver(state.repaid)}</b>
          </div>
        )}
      </div>

      <div class="lc-mkt-body">
        <AmountForm
          action={state.deposit}
          caption="Betét"
          label="Beteszed"
          fill={{ label: 'mind', amount: state.gold }}
        />
        <AmountForm
          action={state.withdraw}
          caption="Pénz kivétel"
          label="Kiveszed"
          fill={state.balance === null ? null : { label: 'mind', amount: state.balance }}
        />

        <div class="lc-mkt-actions">
          <ControlButton option={state.depositAll} wide label="Minden pénzed beteszed" />
          <ControlButton option={state.repay} wide label="Törlesztés a királynak — 50 000" />
          <ControlButton option={state.exit} wide />
        </div>
      </div>
    </div>
  );
}

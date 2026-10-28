import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { BuildingOption } from '@/utils/domExtract';
import type { AmountAction } from '@/utils/buildingExtract';
import { silver } from '@/components/MarketRows';

// The pieces the bank, arena and quest-room pages are built from: a game control
// as a tap target, and a game control whose handler reads an amount field.

export interface ControlButtonProps {
  option: BuildingOption | null;
  wide?: boolean;
  /** Overrides the game's own title, which is sometimes a whole sentence. */
  label?: string;
}

/** A game control as a button, labelled by its title; nothing when absent. */
export function ControlButton({ option, wide, label }: ControlButtonProps): JSX.Element | null {
  if (!option) return null;
  return (
    <button class={`lc-home-act${wide ? ' lc-home-act--wide' : ''}`} title={option.label} onClick={() => option.trigger()}>
      <img class="lc-mkt-act-icon" src={option.iconUrl} alt="" />
      {label ?? option.label}
    </button>
  );
}

export interface AmountFormProps {
  action: AmountAction | null;
  /** Caption above the field. */
  caption: string;
  /** Button text, shorter than the game's title. */
  label: string;
  initial?: number;
  /** A one-tap fill, e.g. "every coin carried"; omitted when there is nothing to fill. */
  fill?: { label: string; amount: number } | null;
}

/**
 * An amount field and the control that submits it. The field is ours: typing
 * into the game's own hidden field would need it focused and visible.
 */
export function AmountForm({ action, caption, label, initial = 0, fill = null }: AmountFormProps): JSX.Element | null {
  const [amount, setAmount] = useState(initial);
  if (!action) return null;
  const valid = amount > 0;

  return (
    <div class="lc-bld-amount">
      <label class="lc-mkt-field">
        <span>{caption}</span>
        <input
          type="number"
          min={0}
          value={amount}
          onInput={(e) => {
            const n = Number((e.target as HTMLInputElement).value);
            setAmount(Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
          }}
        />
      </label>
      {fill && fill.amount > 0 && (
        <button class="lc-shop-bulk-all" title={`${silver(fill.amount)} ezüst`} onClick={() => setAmount(fill.amount)}>
          {fill.label}
        </button>
      )}
      <button
        class="lc-mkt-offer-btn"
        title={action.label}
        disabled={!valid}
        onClick={() => { if (valid) action.run(amount); }}
      >
        {label}
      </button>
    </div>
  );
}

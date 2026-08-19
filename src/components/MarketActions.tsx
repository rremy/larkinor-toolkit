import { h, type JSX } from 'preact';
import type { BuildingOption } from '@/utils/domExtract';
import type { MarketActions as Actions } from '@/utils/marketExtract';
import { silver } from '@/components/MarketRows';

// The market page's own buttons — leaving, collecting what your sales earned,
// the character page — plus whatever the page's `specTevUrlap` offers (one entry
// live: leaving the game). Kept in one place because on mobile they are a tab of
// their own: the page is replaced wholesale there, so a control we do not render
// is a control the player cannot reach.

export interface MarketActionsProps {
  actions: Actions;
  /** Uncollected sale earnings; null when the page did not state them. */
  earnings: number | null;
}

interface ActionButtonProps {
  option: BuildingOption | null;
  wide?: boolean;
  /** Overrides the button's own label (the collect button appends a figure). */
  label?: string;
  disabled?: boolean;
  /** Replaces the tooltip; used to say why the button is inactive. */
  title?: string;
}

/** Renders a game control, or nothing when the page did not print it. */
function ActionButton({ option, wide, label, disabled, title }: ActionButtonProps): JSX.Element | null {
  if (!option) return null;
  return (
    <button
      class={`lc-home-act${wide ? ' lc-home-act--wide' : ''}`}
      title={title ?? option.label}
      disabled={disabled}
      // Guarded here as well as by `disabled`, as the trading buttons are: this
      // drives a real game action, and the attribute alone leaves the invariant
      // to the DOM.
      onClick={() => { if (!disabled) option.trigger(); }}
    >
      <img class="lc-mkt-act-icon" src={option.iconUrl} alt="" />
      {label ?? option.label}
    </button>
  );
}

export function MarketActions({ actions, earnings }: MarketActionsProps): JSX.Element | null {
  const { exit, collectMoney, settings, special } = actions;
  if (!exit && !collectMoney && !settings && special.length === 0) return null;

  // Zero disables; null does not. Collecting leaves the game's own line in place
  // printing 0, so zero is a state the page states outright — whereas a line we
  // could not read says nothing about whether the button works.
  const nothingToCollect = earnings === 0;

  return (
    <div class="lc-mkt-actions">
      {/* Money first: it is the one action with a reason to be here rather than
          anywhere else, and the reason you came back to the market. */}
      <ActionButton
        option={collectMoney}
        wide
        disabled={nothingToCollect}
        // The state is spelled out in the label rather than a tooltip: a phone
        // has no hover, and this button is a whole tab of its own there — so a
        // title attribute would be the one place the answer never appears.
        label={
          nothingToCollect ? 'Nincs felvehető pénz'
            : earnings ? `${collectMoney?.label} — ${silver(earnings)}`
              : collectMoney?.label
        }
        title={nothingToCollect ? 'Nincs felvehető pénzed a piacon' : collectMoney?.label}
      />
      <ActionButton option={exit} wide />
      <ActionButton option={settings} />

      {special.map((action) => (
        <button key={action.actionKey ?? action.label} class="lc-home-act" onClick={() => action.trigger()}>
          {action.label}
        </button>
      ))}
    </div>
  );
}

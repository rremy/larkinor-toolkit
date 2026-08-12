import { h, type JSX } from 'preact';
import type { HomeState } from '@/utils/homeExtract';
import { Home } from '@/pages/Home';
import { DockedPanel } from '@/components/DockedPanel';
import { INVENTORY_MINIMIZED_KEY } from '@/utils/config';

export interface InventoryPanelProps {
  open: boolean;
  onClose: () => void;
  state: HomeState;
}

/**
 * The house/backpack inventory view, docked beside the game.
 *
 * Reuses the mobile `Home` screen's components, in its `split` layout: both
 * containers side by side, since the docked panel has the width for it. That
 * puts the receiving container's capacity in view while moving into it, and
 * removes the tab switch — which only exists because a phone has no room.
 * Columns stack when the panel itself is narrow, so both stay visible.
 *
 * `showGeneral` is off because the game's own page already exposes those actions
 * and traps as single clicks; the dock only carries what the page lacks.
 */
export function InventoryPanel({ open, onClose, state }: InventoryPanelProps): JSX.Element {
  return (
    <DockedPanel open={open} onClose={onClose} storageKey={INVENTORY_MINIMIZED_KEY} minimizable>
      <Home state={state} showGeneral={false} layout="split" />
    </DockedPanel>
  );
}

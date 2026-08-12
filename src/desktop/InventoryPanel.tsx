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
 * Reuses the mobile `Home` screen rather than a desktop-specific layout: the
 * docked panel is wide enough for the full row — quantity, name, weight, move —
 * which is the reason to prefer it over squeezing both containers into columns
 * half that width.
 *
 * `showGeneral` is off because the game's own page already exposes those actions
 * and traps as single clicks; the dock only carries what the page lacks.
 */
export function InventoryPanel({ open, onClose, state }: InventoryPanelProps): JSX.Element {
  return (
    <DockedPanel open={open} onClose={onClose} storageKey={INVENTORY_MINIMIZED_KEY} minimizable>
      <Home state={state} showGeneral={false} />
    </DockedPanel>
  );
}

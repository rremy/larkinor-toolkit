import { h, type JSX } from 'preact';
import type { DataLoader } from '@/shared/data';
import type { CraftingHallKind } from '@/shared/crafting';
import type { CraftingHallState } from '@/utils/craftingExtract';
import { DockedPanel } from '@/components/DockedPanel';
import { CraftingPanel } from '@/components/CraftingPanel';
import { CRAFTING_MINIMIZED_KEY } from '@/utils/config';

// The crafting panel, docked beside the game on desktop. The game's own form
// stays visible and usable underneath; this is the search-and-fill layer the
// form lacks. The hall's trap and spell forms are left to the page itself.

/** Panel title and dock button label, per hall. */
export const CRAFTING_TITLE: Record<CraftingHallKind, string> = {
  forge: 'Kovácsolás',
  mage: 'Varázstárgyak',
};

export interface CraftingDockPanelProps {
  open: boolean;
  onClose: () => void;
  state: CraftingHallState;
  loader: DataLoader;
}

export function CraftingDockPanel({ open, onClose, state, loader }: CraftingDockPanelProps): JSX.Element {
  return (
    <DockedPanel title={CRAFTING_TITLE[state.hall]} open={open} onClose={onClose} storageKey={CRAFTING_MINIMIZED_KEY} minimizable>
      <div class="lc-page lc-page--wide">
        <CraftingPanel state={state} loader={loader} />
      </div>
    </DockedPanel>
  );
}

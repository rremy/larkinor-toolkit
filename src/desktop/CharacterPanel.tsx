import { h, type JSX } from 'preact';
import type { CharacterPageState } from '@/utils/characterPageExtract';
import { DockedPanel } from '@/components/DockedPanel';
import { Character } from '@/pages/Character';
import { CHARACTER_MINIMIZED_KEY } from '@/utils/config';

export interface CharacterPanelProps {
  open: boolean;
  onClose: () => void;
  state: CharacterPageState;
}

/**
 * The character page's view, docked beside the game: the phone page's three
 * tabs as they are — the sortable backpack with weights and market prices, slot
 * swapping beside the worn set, attribute points — which the game's own page,
 * visible next to it, does not offer.
 */
export function CharacterPanel({ open, onClose, state }: CharacterPanelProps): JSX.Element {
  const title = state.name ? `${state.name}${state.level !== null ? ` · ${state.level}. szint` : ''}` : 'Karakterlap';
  return (
    <DockedPanel title={title} open={open} onClose={onClose} storageKey={CHARACTER_MINIMIZED_KEY} minimizable>
      <Character state={state} embedded />
    </DockedPanel>
  );
}

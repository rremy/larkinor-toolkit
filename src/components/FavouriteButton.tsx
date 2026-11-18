import { h, type JSX } from 'preact';

export interface FavouriteButtonProps {
  on: boolean;
  onToggle: () => void;
}

/**
 * The heart that marks a monster as a favourite — on the monster card and in the
 * database's monster detail. GM-free, since the standalone database draws it too.
 */
export function FavouriteButton({ on, onToggle }: FavouriteButtonProps): JSX.Element {
  return (
    <button
      type="button"
      class={`lc-fav-btn${on ? ' lc-fav-btn--on' : ''}`}
      aria-pressed={on}
      title={on ? 'Kedvenc — kiemelve a szövegben. Kattints a törléshez.' : 'Kedvencnek jelölöd: a neve kiemelve jelenik meg a szövegben'}
      onClick={onToggle}
    >
      {on ? '♥' : '♡'}
    </button>
  );
}

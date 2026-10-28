import { h, type JSX } from 'preact';
import { DbIcon } from '@/components/StatBar';

// The database's way in on pages that have no stat bar to carry it — the
// building pages, the shops, the market, home, the character page. The same
// glyph and class as the stat bar's button, so it reads as the same control.

export interface DatabaseButtonProps {
  onClick: () => void;
}

export function DatabaseButton({ onClick }: DatabaseButtonProps): JSX.Element {
  return (
    <button class="lc-statbar-btn lc-statbar-db lc-db-btn" aria-label="Adatbázis" title="Adatbázis" onClick={onClick}>
      <DbIcon />
    </button>
  );
}

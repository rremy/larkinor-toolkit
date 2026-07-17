import { h } from 'preact';
import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { DetailPanel } from '@/database/explorer/DetailPanel';
import type { Weapon } from '@/shared/data';

const weapon = {
  id: 4, name: 'bot', weight: 2, price: 6, marketPrice: null, special: 'Nincs', magical: false,
  craftableAt: 'Erőd', minLevel: 1, recipe: [], droppedBy: [], type: 'Ütő/Zúzó',
  maxDamage: 6, spread: 5, avgDamage: 3.5, vampiric: false, level: 1, availability: [],
  shops: [{ cellId: '44', owner: 'Thorgard', price: 6 }],
} satisfies Weapon;

describe('DetailPanel shop links', () => {
  it('renders the shop location as a link that opens the map cell', () => {
    const onShowCell = vi.fn();
    render(
      <DetailPanel
        tab="weapons" entity={weapon}
        onClose={() => {}} onJump={() => {}} onShowCell={onShowCell}
      />,
    );
    const link = screen.getByText(/mező 44 a térképen/);
    fireEvent.click(link);
    expect(onShowCell).toHaveBeenCalledWith('44');
  });
});

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

describe('DetailPanel markets', () => {
  const show = (entity: Weapon) => render(
    <DetailPanel tab="weapons" entity={entity} onClose={() => {}} onJump={() => {}} onShowCell={() => {}} />,
  );

  it('prices the item at every market quoting it', () => {
    const { container } = show({
      ...weapon,
      marketPrice: 260,
      marketPrices: [{ market: 'Larkinor', price: 780 }, { market: 'Thord-Artin', price: 260 }],
    });
    const stats = [...container.querySelectorAll('.stats dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    expect(stats).toContainEqual(['Piaci ár (Larkinor)', '780']);
    expect(stats).toContainEqual(['Piaci ár (Thord-Artin)', '260']);
    expect(screen.queryByText('Piaci ár (ezüst)')).toBeNull();
  });

  it('keeps the single market price where no market was captured — the standalone site', () => {
    show({ ...weapon, marketPrice: 50 });
    expect(screen.getByText('Piaci ár (ezüst)')).toBeTruthy();
  });

  it('names the market an offer stands at', () => {
    show({
      ...weapon,
      owned: 7,
      holdings: [
        { location: 'market', market: 'Larkinor', quantity: 2, capturedAt: 0 },
        { location: 'market', market: 'Thord-Artin', quantity: 5, capturedAt: 0 },
      ],
    });
    expect(screen.getByText(/piac \(Larkinor\): 2/)).toBeTruthy();
    expect(screen.getByText(/piac \(Thord-Artin\): 5/)).toBeTruthy();
  });
});

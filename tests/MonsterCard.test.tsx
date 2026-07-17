import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { MonsterCard, monsterImageUrl } from '../src/components/MonsterCard';
import type { Monster } from '../src/shared/data/monsters';

const MONSTER: Monster = {
  id: 1,
  name: 'Vérszomjas moszkitóraj',
  image: '/pic/szornyk/moszkitoraj_k.gif',
  level: 1,
  hp: 6,
  mp: 4,
  attackType: 'Szúró/Vágó',
  debuff: 'fertőzés',
  magicWeapon: false,
  location: 'Larkinor',
  drops: [{ qty: 1, name: 'szúnyogszárny', id: 51 }],
};

describe('monsterImageUrl', () => {
  it('maps the DB /pic/szornyk path to the live /szornyk URL', () => {
    expect(monsterImageUrl('/pic/szornyk/moszkitoraj_k.gif'))
      .toBe('https://l2.larkinor.hu/szornyk/moszkitoraj_k.gif');
  });

  it('leaves absolute URLs untouched', () => {
    expect(monsterImageUrl('https://x/y.gif')).toBe('https://x/y.gif');
  });

  it('returns empty string for empty input', () => {
    expect(monsterImageUrl('')).toBe('');
  });
});

describe('MonsterCard', () => {
  it('renders the monster image with the mapped live URL', () => {
    const { container } = render(<MonsterCard monster={MONSTER} onClose={vi.fn()} />);
    const img = container.querySelector('.lc-mc-img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://l2.larkinor.hu/szornyk/moszkitoraj_k.gif');
  });

  it('returns null when monster is null', () => {
    const { container } = render(<MonsterCard monster={null} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders monster name and level when a monster is provided', () => {
    render(<MonsterCard monster={MONSTER} onClose={vi.fn()} />);
    expect(screen.getByText('Vérszomjas moszkitóraj')).toBeTruthy();
    expect(screen.getByText(/Szint.*1|1.*szint/i)).toBeTruthy();
  });

  it('renders HP, MP, attack type, debuff, and drop list', () => {
    render(<MonsterCard monster={MONSTER} onClose={vi.fn()} />);
    expect(screen.getByText(/6/)).toBeTruthy();  // hp
    expect(screen.getByText('Szúró/Vágó')).toBeTruthy();
    expect(screen.getByText('fertőzés')).toBeTruthy();
    expect(screen.getByText(/szúnyogszárny/)).toBeTruthy();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<MonsterCard monster={MONSTER} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /bezár|close|×/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<MonsterCard monster={MONSTER} onClose={onClose} />);
    fireEvent.click(container.querySelector('.lc-drawer-backdrop')!);
    expect(onClose).toHaveBeenCalled();
  });
});

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

  it('renders drops as links that call onItemClick with the item id', () => {
    const onItemClick = vi.fn();
    render(<MonsterCard monster={MONSTER} onClose={vi.fn()} onItemClick={onItemClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'szúnyogszárny' }));
    expect(onItemClick).toHaveBeenCalledWith(51);
  });

  it('keeps a currency drop (id 0) as plain text, not a link', () => {
    const m: Monster = { ...MONSTER, drops: [{ qty: 2, name: 'ezüst', id: 0 }] };
    render(<MonsterCard monster={m} onClose={vi.fn()} onItemClick={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'ezüst' })).toBeNull();
    expect(screen.getByText(/ezüst/)).toBeTruthy();
  });

  it('renders as a bottom sheet by default', () => {
    const { container } = render(<MonsterCard monster={MONSTER} onClose={vi.fn()} />);
    const backdrop = container.querySelector('.lc-drawer-backdrop')!;
    expect(backdrop.classList.contains('lc-drawer-backdrop--center')).toBe(false);
  });

  it('renders as a centered modal when the modal variant is requested', () => {
    const { container } = render(
      <MonsterCard monster={MONSTER} onClose={vi.fn()} variant="modal" />
    );
    const backdrop = container.querySelector('.lc-drawer-backdrop')!;
    expect(backdrop.classList.contains('lc-drawer-backdrop--center')).toBe(true);
  });

  it('still closes on a backdrop click in the modal variant', () => {
    const onClose = vi.fn();
    const { container } = render(
      <MonsterCard monster={MONSTER} onClose={onClose} variant="modal" />
    );
    fireEvent.click(container.querySelector('.lc-drawer-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

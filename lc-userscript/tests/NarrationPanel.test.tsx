import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { NarrationPanel } from '../src/components/NarrationPanel';
import { buildMonsterDatabase, type Monster } from '../src/data/monsters';

const MONSTERS: Monster[] = [
  { id: 1, name: 'Vérszomjas moszkitóraj', image: '/pic/szornyk/moszkitoraj_k.gif', level: 1, hp: 6, mp: 4, attackType: 'Szúró', debuff: 'fertőzés', magicWeapon: false, location: 'Larkinor', drops: [] },
];

describe('NarrationPanel', () => {
  it('renders plain text when no monsters match', () => {
    const db = buildMonsterDatabase(MONSTERS);
    render(<NarrationPanel text="Egy macska fut át az úton." db={db} onMonsterClick={vi.fn()} />);
    expect(screen.getByText(/macska fut/)).toBeTruthy();
  });

  it('renders the encountered monster name as a tappable span', () => {
    const db = buildMonsterDatabase(MONSTERS);
    const { container } = render(
      <NarrationPanel text="Valami Vérszomjas moszkitóraj csámborog a közelben!" db={db} onMonsterClick={vi.fn()} />
    );
    const link = container.querySelector('.lc-monster-link');
    expect(link).not.toBeNull();
    expect(link?.textContent).toBe('Vérszomjas moszkitóraj');
  });

  it('calls onMonsterClick with the matched monster when tapped', () => {
    const db = buildMonsterDatabase(MONSTERS);
    const handler = vi.fn();
    const { container } = render(
      <NarrationPanel text="Vérszomjas moszkitóraj feléd indul!" db={db} onMonsterClick={handler} />
    );
    fireEvent.click(container.querySelector('.lc-monster-link')!);
    expect(handler).toHaveBeenCalledWith(MONSTERS[0]);
  });

  it('leaves an encounter name plain when it is not in the database', () => {
    const db = buildMonsterDatabase(MONSTERS);
    const { container } = render(
      <NarrationPanel text="Valami Ismeretlen szörny csámborog a közelben!" db={db} onMonsterClick={vi.fn()} />
    );
    expect(container.querySelector('.lc-monster-link')).toBeNull();
    expect(container.querySelector('.lc-narration')?.textContent).toContain('Ismeretlen szörny');
  });

  it('renders plain text when db is null', () => {
    render(<NarrationPanel text="Valami szöveg." db={null} onMonsterClick={vi.fn()} />);
    expect(screen.getByText(/Valami szöveg/)).toBeTruthy();
  });

  it('renders empty text gracefully', () => {
    const db = buildMonsterDatabase(MONSTERS);
    const { container } = render(<NarrationPanel text="" db={db} onMonsterClick={vi.fn()} />);
    expect(container.querySelector('.lc-narration')?.textContent).toBe('');
  });
});

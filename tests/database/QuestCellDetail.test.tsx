import { h } from 'preact';
import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { QuestCellDetail } from '@/database/quests/QuestCellDetail';
import { buildMonsterDatabase } from '@/shared/data';
import type { QuestCell, Edge } from '@/shared/data';

const openEdges = (): Record<'N'|'E'|'S'|'W', Edge> => ({
  N: { kind: 'open' }, E: { kind: 'open' }, S: { kind: 'open' }, W: { kind: 'open' },
});

function cell(partial: Partial<QuestCell>): QuestCell {
  return {
    row: 0, col: 0, edges: openEdges(), monsterId: null, monsterName: null,
    boss: false, key: null, questItem: false, portal: null, trap: false,
    death: false, narration: '', drops: null, hasQuestion: false, question: null, rawImage: '',
    ...partial,
  };
}

const monsters = buildMonsterDatabase([{
  id: 7, name: 'Csontváz', image: '/pic/szornyk/csontvaz_k.gif', level: 3, hp: 20,
  mp: 5, attackType: '', debuff: '', magicWeapon: false, location: '', drops: [],
}]);

describe('QuestCellDetail', () => {
  it('prompts when nothing is selected', () => {
    render(<QuestCellDetail cell={null} monsters={monsters} onJumpToMonster={() => {}} />);
    expect(screen.getByText(/Válassz egy mezőt/)).toBeTruthy();
  });

  it('shows the position, narration and drops', () => {
    render(<QuestCellDetail monsters={monsters} onJumpToMonster={() => {}}
      cell={cell({ row: 2, col: 1, narration: 'Erős zümmögést hallasz.', drops: '2 db szúnyogszárny' })} />);
    expect(screen.getByText('3. sor, 2. oszlop')).toBeTruthy();
    expect(screen.getByText('Erős zümmögést hallasz.')).toBeTruthy();
    expect(screen.getByText('2 db szúnyogszárny')).toBeTruthy();
  });

  it('links a resolved monster to its database entry', () => {
    const onJumpToMonster = vi.fn();
    render(<QuestCellDetail monsters={monsters} onJumpToMonster={onJumpToMonster}
      cell={cell({ monsterId: 7, monsterName: 'Csontváz' })} />);
    fireEvent.click(screen.getByText('Csontváz'));
    expect(onJumpToMonster).toHaveBeenCalledWith(7);
  });

  it('shows an unresolved sprite as plain text, not a dead link', () => {
    const { container } = render(
      <QuestCellDetail monsters={monsters} onJumpToMonster={() => {}}
        cell={cell({ monsterId: null, monsterName: 'ismeretlen_k' })} />,
    );
    expect(screen.getByText('ismeretlen_k')).toBeTruthy();
    expect(container.querySelector('.quest-monster-link')).toBeNull();
  });

  it('names the key the cell yields and its other markers', () => {
    render(<QuestCellDetail monsters={monsters} onJumpToMonster={() => {}}
      cell={cell({ key: 'arany', questItem: true, trap: true, portal: 'exit' })} />);
    expect(screen.getByText(/aranykulcs/)).toBeTruthy();
    expect(screen.getByText(/küldetés tárgy/)).toBeTruthy();
    expect(screen.getByText(/csapda/)).toBeTruthy();
    expect(screen.getByText(/kijárat/)).toBeTruthy();
  });

  it('renders a question through the card', () => {
    const { container } = render(
      <QuestCellDetail monsters={monsters} onJumpToMonster={() => {}}
        cell={cell({ question: { prompt: 'Mit teszel?', choices: [
          { index: 1, text: 'Mész', outcome: 'semmi' },
          { index: 2, text: 'Iszol', outcome: '3 méreg' },
        ] } })} />,
    );
    expect(container.querySelector('.quest-question')).toBeTruthy();
    expect(container.querySelectorAll('.quest-choice')).toHaveLength(2);
  });

  it('offers a cleared toggle for the selected cell', () => {
    const onToggle = vi.fn();
    const target = cell({ row: 2, col: 3, monsterId: 1 });
    render(<QuestCellDetail cell={target} monsters={monsters} onJumpToMonster={() => {}}
      cleared={false} onToggleCleared={onToggle} />);

    const button = screen.getByRole('button', { name: /Teljesítve/ });
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(target);
  });

  it('offers to undo it when the cell is already cleared', () => {
    render(<QuestCellDetail cell={cell({ row: 2, col: 3 })} monsters={monsters}
      onJumpToMonster={() => {}} cleared onToggleCleared={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Visszavonás/ })).toBeTruthy();
  });

  it('omits the toggle when no handler is supplied (standalone read-only use)', () => {
    render(<QuestCellDetail cell={cell({ row: 2, col: 3 })} monsters={monsters} onJumpToMonster={() => {}} />);
    expect(screen.queryByRole('button', { name: /Teljesítve/ })).toBeNull();
  });
});

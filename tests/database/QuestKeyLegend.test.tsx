import { h } from 'preact';
import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { QuestKeyLegend } from '@/database/quests/QuestKeyLegend';
import { buildMonsterDatabase } from '@/shared/data';
import type { Quest, QuestCell, Edge } from '@/shared/data';

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
  id: 7, name: 'Csontváz', image: '/pic/szornyk/csontvaz_k.gif', level: 1, hp: 1,
  mp: 1, attackType: '', debuff: '', magicWeapon: false, location: '', drops: [],
}]);

/** Iron door present with its key; gold door present with no key anywhere. */
const quest: Quest = {
  id: 1, description: '', reward: '', rows: 2, cols: 2,
  cells: [
    cell({ row: 0, col: 0, edges: { ...openEdges(), E: { kind: 'door', lock: 'vas' } } }),
    cell({ row: 0, col: 1, edges: { ...openEdges(), S: { kind: 'door', lock: 'arany' } } }),
    cell({ row: 1, col: 0, key: 'vas', monsterId: 7, monsterName: 'Csontváz' }),
    cell({ row: 1, col: 1 }),
  ],
};

describe('QuestKeyLegend', () => {
  it('lists every lock that gates a door', () => {
    render(<QuestKeyLegend quest={quest} monsters={monsters} activeLock={null}
                           onHoverLock={() => {}} onSelectCell={() => {}} />);
    expect(screen.getByText('vaskulcs')).toBeTruthy();
    expect(screen.getByText('aranykulcs')).toBeTruthy();
  });

  it('names where the key is, with the monster holding it', () => {
    render(<QuestKeyLegend quest={quest} monsters={monsters} activeLock={null}
                           onHoverLock={() => {}} onSelectCell={() => {}} />);
    expect(screen.getByText(/2\. sor, 1\. oszlop/)).toBeTruthy();
    expect(screen.getByText(/Csontváz/)).toBeTruthy();
  });

  it('says so explicitly when the quest holds no key for a lock', () => {
    render(<QuestKeyLegend quest={quest} monsters={monsters} activeLock={null}
                           onHoverLock={() => {}} onSelectCell={() => {}} />);
    expect(screen.getByText('nincs kulcs ebben a küldetésben')).toBeTruthy();
  });

  it('reports hover so the grid can highlight the key cell', () => {
    const onHoverLock = vi.fn();
    const { container } = render(
      <QuestKeyLegend quest={quest} monsters={monsters} activeLock={null}
                      onHoverLock={onHoverLock} onSelectCell={() => {}} />,
    );
    fireEvent.mouseEnter(container.querySelector('.quest-legend-row') as HTMLElement);
    expect(onHoverLock).toHaveBeenCalledWith('vas');
  });

  it('jumps to the key cell when its location is clicked', () => {
    const onSelectCell = vi.fn();
    render(<QuestKeyLegend quest={quest} monsters={monsters} activeLock={null}
                           onHoverLock={() => {}} onSelectCell={onSelectCell} />);
    fireEvent.click(screen.getByText(/2\. sor, 1\. oszlop/));
    expect(onSelectCell).toHaveBeenCalledWith(expect.objectContaining({ row: 1, col: 0 }));
  });

  it('marks the active lock row', () => {
    const { container } = render(
      <QuestKeyLegend quest={quest} monsters={monsters} activeLock="vas"
                      onHoverLock={() => {}} onSelectCell={() => {}} />,
    );
    expect(container.querySelectorAll('.quest-legend-row.active')).toHaveLength(1);
  });

  it('shows a placeholder when the quest has no locked doors at all', () => {
    // Real cases: quests 3, 5, 9, 14, 23, 33.
    const lockless: Quest = {
      id: 2, description: '', reward: '', rows: 1, cols: 1,
      cells: [cell({ row: 0, col: 0 })],
    };
    const { container } = render(
      <QuestKeyLegend quest={lockless} monsters={monsters} activeLock={null}
                      onHoverLock={() => {}} onSelectCell={() => {}} />,
    );
    expect(screen.getByText('Ebben a küldetésben nincs zárt ajtó.')).toBeTruthy();
    expect(container.querySelector('.quest-legend-row')).toBeNull();
  });
});

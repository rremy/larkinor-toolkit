import { h } from 'preact';
import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { QuestGrid } from '@/database/quests/QuestGrid';
import { buildMonsterDatabase } from '@/shared/data';
import type { Quest, QuestCell, Edge } from '@/shared/data';

const openEdges = (): Record<'N'|'E'|'S'|'W', Edge> => ({
  N: { kind: 'open' }, E: { kind: 'open' }, S: { kind: 'open' }, W: { kind: 'open' },
});

function cell(partial: Partial<QuestCell>): QuestCell {
  return {
    row: 0, col: 0, edges: openEdges(), monsterId: null, monsterName: null,
    boss: false, key: null, questItem: false, portal: null, trap: false,
    death: false, narration: '', drops: null, question: null, rawImage: '',
    ...partial,
  };
}

const monsters = buildMonsterDatabase([{
  id: 1, name: 'Vérszomjas moszkitóraj', image: '/pic/szornyk/moszkitoraj_k.gif',
  level: 1, hp: 6, mp: 4, attackType: '', debuff: '', magicWeapon: false,
  location: 'Larkinor', drops: [],
}]);

const quest: Quest = {
  id: 1, description: 'd', reward: 'r', rows: 2, cols: 2,
  cells: [
    cell({ row: 0, col: 0, portal: 'entrance' }),
    cell({ row: 0, col: 1, edges: { ...openEdges(), E: { kind: 'door', lock: 'vas' }, N: { kind: 'wall' } } }),
    cell({ row: 1, col: 0, monsterId: 1, monsterName: 'Vérszomjas moszkitóraj' }),
    cell({ row: 1, col: 1, key: 'vas', question: { prompt: 'Mit teszel?', choices: [] } }),
  ],
};

describe('QuestGrid', () => {
  it('renders one tile per cell without using a table', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}} />,
    );
    expect(container.querySelectorAll('.quest-cell')).toHaveLength(4);
    expect(container.querySelector('table')).toBeNull();
  });

  it('marks walls and doors as edge modifiers', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}} />,
    );
    expect(container.querySelector('.quest-edge.N.wall')).toBeTruthy();
    expect(container.querySelector('.quest-edge.E.door.lock-vas')).toBeTruthy();
  });

  it('marks a szel edge and labels it as the edge of the maze, not a passage', () => {
    const szelQuest: Quest = {
      ...quest,
      cells: [
        ...quest.cells.slice(0, 3),
        cell({ row: 1, col: 1, edges: { ...openEdges(), E: { kind: 'szel' } } }),
      ],
    };
    const { container } = render(
      <QuestGrid quest={szelQuest} monsters={monsters} selected={null} onSelect={() => {}} />,
    );
    const edge = container.querySelector('.quest-edge.E.szel');
    expect(edge).toBeTruthy();
    expect(edge?.getAttribute('title')).toBe('labirintus széle');
  });

  it('makes doors focusable so the key hint is keyboard-reachable', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}} />,
    );
    const door = container.querySelector('.quest-edge.door') as HTMLElement;
    expect(door.getAttribute('tabindex')).toBe('0');
  });

  it('renders the monster sprite from the live asset host', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}} />,
    );
    const img = container.querySelector('img.quest-sprite') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://l2.larkinor.hu/szornyk/moszkitoraj_k.gif');
    expect(img.getAttribute('alt')).toBe('Vérszomjas moszkitóraj');
  });

  it('badges key, question and entrance cells', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={() => {}} />,
    );
    expect(container.querySelector('.quest-badge.key')).toBeTruthy();
    expect(container.querySelector('.quest-badge.question')).toBeTruthy();
    expect(container.querySelector('.quest-badge.entrance')).toBeTruthy();
  });

  it('reports the clicked cell', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={null} onSelect={onSelect} />,
    );
    fireEvent.click(container.querySelectorAll('.quest-cell')[2]);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ row: 1, col: 0 }));
  });

  it('marks the selected cell and cells holding a highlighted lock key', () => {
    const { container } = render(
      <QuestGrid quest={quest} monsters={monsters} selected={quest.cells[0]}
                 onSelect={() => {}} highlightLock="vas" />,
    );
    expect(container.querySelectorAll('.quest-cell.selected')).toHaveLength(1);
    expect(container.querySelectorAll('.quest-cell.key-hit')).toHaveLength(1);
  });
});

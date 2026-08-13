import { h } from 'preact';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { QuestView } from '@/database/quests/QuestView';
import { buildMonsterDatabase } from '@/shared/data';
import type { DataLoader, Quest, QuestCell, Edge } from '@/shared/data';

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

const quests: Quest[] = [
  {
    id: 1, description: 'Gründen borospincéje', reward: '20 db ezüst', rows: 1, cols: 2,
    cells: [
      cell({ row: 0, col: 0, edges: { ...openEdges(), E: { kind: 'door', lock: 'vas' } } }),
      cell({ row: 0, col: 1, key: 'vas' }),
    ],
  },
  { id: 2, description: 'Kalózbanda a városfalnál', reward: '400 db ezüst', rows: 1, cols: 1, cells: [cell({})] },
  {
    id: 3, description: 'Nekrodénusz kastélya', reward: '10 db arany', rows: 1, cols: 1,
    cells: [cell({ edges: { ...openEdges(), N: { kind: 'szel' } } })],
  },
];

function makeLoader(): DataLoader {
  return {
    loadWeapons: async () => [], loadArmors: async () => [], loadItems: async () => [],
    loadMonsters: async () => buildMonsterDatabase([]),
    loadMap: async () => ({ cells: [] }),
    loadItemShops: async () => ({ shops: [] }),
    loadWeaponShops: async () => ({ shops: [] }),
    loadQuests: async () => quests,
  };
}

describe('QuestView', () => {
  // The description appears twice — in the picker row and in the header — so
  // these assertions use findAllByText rather than the single-match variant.
  it('lists the quests and shows the selected one', async () => {
    render(<QuestView loader={makeLoader()} questId={1}
                      onSelectQuest={() => {}} onJumpToMonster={() => {}} />);
    expect((await screen.findAllByText(/Gründen borospincéje/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/20 db ezüst/)).toBeTruthy();
  });

  it('defaults to the first quest when none is routed', async () => {
    render(<QuestView loader={makeLoader()} questId={null}
                      onSelectQuest={() => {}} onJumpToMonster={() => {}} />);
    expect(await screen.findByText('1. küldetés')).toBeTruthy();
  });

  it('filters the picker accent-insensitively', async () => {
    const { container } = render(
      <QuestView loader={makeLoader()} questId={1}
                 onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
    );
    await screen.findAllByText(/Gründen borospincéje/);
    const search = container.querySelector('.quest-search input') as HTMLInputElement;
    fireEvent.input(search, { target: { value: 'kaloz' } });
    await waitFor(() => {
      expect(container.querySelectorAll('.quest-pick')).toHaveLength(1);
    });
    expect(screen.getByText(/Kalózbanda/)).toBeTruthy();
  });

  it('reports the picked quest', async () => {
    const onSelectQuest = vi.fn();
    render(<QuestView loader={makeLoader()} questId={1}
                      onSelectQuest={onSelectQuest} onJumpToMonster={() => {}} />);
    await screen.findByText(/Kalózbanda/);
    fireEvent.click(screen.getByText(/Kalózbanda/));
    expect(onSelectQuest).toHaveBeenCalledWith(2);
  });

  it('highlights the key cell when a door is hovered', async () => {
    const { container } = render(
      <QuestView loader={makeLoader()} questId={1}
                 onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
    );
    await screen.findAllByText(/Gründen borospincéje/);
    expect(container.querySelectorAll('.quest-cell.key-hit')).toHaveLength(0);
    fireEvent.mouseEnter(container.querySelector('.quest-edge.door') as HTMLElement);
    await waitFor(() => {
      expect(container.querySelectorAll('.quest-cell.key-hit')).toHaveLength(1);
    });
  });

  // Hover is unusable on touch and unreachable by keyboard, so the door's
  // focus and click handlers are the paths that actually matter for
  // accessibility. A regression that dropped onFocus or onClick while
  // leaving tabIndex/role intact would otherwise slip through unnoticed.
  it('highlights the key cell when a door is focused', async () => {
    const { container } = render(
      <QuestView loader={makeLoader()} questId={1}
                 onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
    );
    await screen.findAllByText(/Gründen borospincéje/);
    expect(container.querySelectorAll('.quest-cell.key-hit')).toHaveLength(0);
    fireEvent.focus(container.querySelector('.quest-edge.door') as HTMLElement);
    await waitFor(() => {
      expect(container.querySelectorAll('.quest-cell.key-hit')).toHaveLength(1);
    });
  });

  it('highlights the key cell when a door is clicked, without selecting the cell underneath', async () => {
    const { container } = render(
      <QuestView loader={makeLoader()} questId={1}
                 onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
    );
    await screen.findAllByText(/Gründen borospincéje/);
    expect(container.querySelectorAll('.quest-cell.key-hit')).toHaveLength(0);
    fireEvent.click(container.querySelector('.quest-edge.door') as HTMLElement);
    await waitFor(() => {
      expect(container.querySelectorAll('.quest-cell.key-hit')).toHaveLength(1);
    });
    // Clicking the door must not bubble to the cell's own onClick — the
    // click is a lock probe, not a cell selection.
    expect(container.querySelectorAll('.quest-cell.selected')).toHaveLength(0);
  });

  it('shows the szel caption only for a quest that actually has one', async () => {
    const { container, rerender } = render(
      <QuestView loader={makeLoader()} questId={1}
                 onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
    );
    await screen.findByText('1. küldetés');
    expect(container.querySelector('.quest-szel-note')).toBeNull();

    rerender(
      <QuestView loader={makeLoader()} questId={3}
                 onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
    );
    await screen.findByText('3. küldetés');
    expect(container.querySelector('.quest-szel-note')?.textContent).toMatch(/labirintus széle/);
  });

  it('summarises the quest contents', async () => {
    const { container } = render(
      <QuestView loader={makeLoader()} questId={1}
                 onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
    );
    await screen.findByText('1. küldetés');
    // The summary is built from several interpolations, so assert on the
    // container's text rather than matching a single text node.
    const stats = container.querySelector('.quest-stats') as HTMLElement;
    expect(stats.textContent).toMatch(/1 kulcs/);
    expect(stats.textContent).toMatch(/1×2/);
  });
});

import { h } from 'preact';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { QuestView } from '@/database/quests/QuestView';
import { buildMonsterDatabase } from '@/shared/data';
import type { DataLoader, Quest, QuestCell, Edge } from '@/shared/data';
import type { PrefStore } from '@/database/DatabaseApp';
import { LEGACY_QUEST_SELECTED_PREF_KEY, QUEST_SET_PREF_KEY, questSelectedKey } from '@/shared/prefKeys';

/** An in-memory PrefStore stand-in, for tests that don't care which real one backs it. */
function makePrefStore(initial: Record<string, string> = {}): PrefStore {
  const store: Record<string, string> = { ...initial };
  return {
    read: (key) => store[key] ?? null,
    write: (key, value) => { store[key] = value; },
  };
}

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

const quests: Quest[] = [
  {
    id: '1', set: 'royal', title: '1', description: 'Gründen borospincéje', reward: '20 db ezüst', rows: 1, cols: 2,
    cells: [
      cell({ row: 0, col: 0, edges: { ...openEdges(), E: { kind: 'door', lock: 'vas' } } }),
      cell({ row: 0, col: 1, key: 'vas' }),
    ],
  },
  { id: '2', set: 'royal', title: '2', description: 'Kalózbanda a városfalnál', reward: '400 db ezüst', rows: 1, cols: 1, cells: [cell({})] },
  {
    id: '3', set: 'royal', title: '3', description: 'Nekrodénusz kastélya', reward: '10 db arany', rows: 1, cols: 1,
    cells: [cell({ edges: { ...openEdges(), N: { kind: 'szel' } } })],
  },
];

const tavernQuests: Quest[] = [
  {
    id: 'GOMB', set: 'tavern', title: 'GÖMB', description: 'Egy gömbölyű terem', reward: '5 db réz', rows: 1, cols: 1,
    cells: [cell({})],
  },
  {
    id: 'MASIK', set: 'tavern', title: 'MÁSIK', description: 'Egy másik terem', reward: '5 db réz', rows: 1, cols: 1,
    cells: [cell({})],
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
    loadTavernQuests: async () => tavernQuests,
  };
}

describe('QuestView', () => {
  // The description appears twice — in a chip's title attribute and in the
  // header — so these assertions use findAllByText rather than the
  // single-match variant.
  it('lists the quests and shows the selected one', async () => {
    render(<QuestView loader={makeLoader()} questSet={null} questId="1"
                      onSelectQuest={() => {}} onJumpToMonster={() => {}} />);
    expect((await screen.findAllByText(/Gründen borospincéje/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/20 db ezüst/)).toBeTruthy();
  });

  it('defaults to the first quest when none is routed', async () => {
    render(<QuestView loader={makeLoader()} questSet={null} questId={null}
                      onSelectQuest={() => {}} onJumpToMonster={() => {}} />);
    expect(await screen.findByText('1. küldetés')).toBeTruthy();
  });

  it('renders a numbered chip per quest, with the active one marked', async () => {
    const { container } = render(
      <QuestView loader={makeLoader()} questSet={null} questId="1"
                 onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
    );
    await screen.findAllByText(/Gründen borospincéje/);
    const chips = container.querySelectorAll('.quest-chip');
    expect(chips).toHaveLength(quests.length);
    expect(chips[0].textContent).toBe('1');
    expect(chips[0].classList.contains('active')).toBe(true);
    expect(chips[1].classList.contains('active')).toBe(false);
    // Hovering doesn't identify a quest by number alone — the description
    // stays reachable as a tooltip.
    expect(chips[1].getAttribute('title')).toBe('Kalózbanda a városfalnál');
  });

  it('reports the picked quest when a chip is clicked', async () => {
    const onSelectQuest = vi.fn();
    const { container } = render(
      <QuestView loader={makeLoader()} questSet={null} questId="1"
                      onSelectQuest={onSelectQuest} onJumpToMonster={() => {}} />);
    await screen.findAllByText(/Gründen borospincéje/);
    const chips = container.querySelectorAll('.quest-chip');
    fireEvent.click(chips[1]);
    expect(onSelectQuest).toHaveBeenCalledWith('royal', '2');
  });

  it('highlights the key cell when a door is hovered', async () => {
    const { container } = render(
      <QuestView loader={makeLoader()} questSet={null} questId="1"
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
      <QuestView loader={makeLoader()} questSet={null} questId="1"
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
      <QuestView loader={makeLoader()} questSet={null} questId="1"
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

  it('marks a key badge with its lock type, for the door↔key colour association', async () => {
    const { container } = render(
      <QuestView loader={makeLoader()} questSet={null} questId="1"
                 onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
    );
    await screen.findAllByText(/Gründen borospincéje/);
    const badge = container.querySelector('.quest-badge.key');
    expect(badge).toBeTruthy();
    expect(badge?.classList.contains('lock-vas')).toBe(true);
  });

  it('shows the szel caption only for a quest that actually has one', async () => {
    const { container, rerender } = render(
      <QuestView loader={makeLoader()} questSet={null} questId="1"
                 onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
    );
    await screen.findByText('1. küldetés');
    expect(container.querySelector('.quest-szel-note')).toBeNull();

    rerender(
      <QuestView loader={makeLoader()} questSet={null} questId="3"
                 onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
    );
    await screen.findByText('3. küldetés');
    expect(container.querySelector('.quest-szel-note')?.textContent).toMatch(/labirintus széle/);
  });

  describe('remembered zoom', () => {
    it('initialises the zoom from a supplied PrefStore', async () => {
      const prefStore = makePrefStore({ 'lc-quest-tile-size': '72' });
      render(
        <QuestView loader={makeLoader()} questSet={null} questId="1" prefStore={prefStore}
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      const select = await screen.findByLabelText('Méret') as HTMLSelectElement;
      expect(select.value).toBe('72');
    });

    it('writes the new zoom to the store when it is changed', async () => {
      const prefStore = makePrefStore();
      render(
        <QuestView loader={makeLoader()} questSet={null} questId="1" prefStore={prefStore}
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      const select = await screen.findByLabelText('Méret') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: '40' } });
      expect(prefStore.read('lc-quest-tile-size')).toBe('40');
    });

    it('survives an unmount/remount through the same store (the actual round trip)', async () => {
      const prefStore = makePrefStore();
      const { unmount } = render(
        <QuestView loader={makeLoader()} questSet={null} questId="1" prefStore={prefStore}
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      const select = await screen.findByLabelText('Méret') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: '40' } });
      unmount();

      render(
        <QuestView loader={makeLoader()} questSet={null} questId="1" prefStore={prefStore}
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      const selectAfterRemount = await screen.findByLabelText('Méret') as HTMLSelectElement;
      expect(selectAfterRemount.value).toBe('40');
    });

    it('falls back to the default zoom when the stored value is not one of the offered sizes', async () => {
      // A stale value from a build that offered a different size list (or a
      // hand-edited one) must not hand the grid an unusable tile size.
      const prefStore = makePrefStore({ 'lc-quest-tile-size': '999' });
      render(
        <QuestView loader={makeLoader()} questSet={null} questId="1" prefStore={prefStore}
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      const select = await screen.findByLabelText('Méret') as HTMLSelectElement;
      expect(select.value).toBe('56');
    });

    it('works with no prefStore at all, defaulting the zoom as before', async () => {
      render(
        <QuestView loader={makeLoader()} questSet={null} questId="1"
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      const select = await screen.findByLabelText('Méret') as HTMLSelectElement;
      expect(select.value).toBe('56');
      fireEvent.change(select, { target: { value: '40' } });
      expect(select.value).toBe('40');
    });
  });

  describe('quest set switcher', () => {
    it('renders both set buttons with the royal set active by default', async () => {
      render(<QuestView loader={makeLoader()} questSet={null} questId={null}
        onSelectQuest={vi.fn()} onJumpToMonster={vi.fn()} />);
      expect((await screen.findByRole('button', { name: 'Királyi' })).getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByRole('button', { name: 'Kocsmai' }).getAttribute('aria-pressed')).toBe('false');
    });

    it('loads the tavern set and shows its titles as chips', async () => {
      render(<QuestView loader={makeLoader()} questSet="tavern" questId={null}
        onSelectQuest={vi.fn()} onJumpToMonster={vi.fn()} />);
      expect(await screen.findByRole('button', { name: 'GÖMB' })).toBeTruthy();
    });

    it('selects the first quest of the set when switching', async () => {
      const onSelectQuest = vi.fn();
      render(<QuestView loader={makeLoader()} questSet="royal" questId="1"
        onSelectQuest={onSelectQuest} onJumpToMonster={vi.fn()} />);
      fireEvent.click(await screen.findByRole('button', { name: 'Kocsmai' }));
      await waitFor(() => expect(onSelectQuest).toHaveBeenCalledWith('tavern', 'GOMB'));
    });

    it('renders the tavern header from the title, not as a numbered quest', async () => {
      render(<QuestView loader={makeLoader()} questSet="tavern" questId="GOMB"
        onSelectQuest={vi.fn()} onJumpToMonster={vi.fn()} />);
      expect(await screen.findByRole('heading', { name: 'GÖMB' })).toBeTruthy();
    });
  });

  describe('per-set persistence', () => {
    // The whole reason the keys are per-set: the in-game overlay remounts on
    // every page load, and coming back to royal must not dump you on quest 1.
    it('remembers a separate selection for each set', async () => {
      const prefStore = makePrefStore({});
      const { rerender } = render(<QuestView loader={makeLoader()} questSet="royal" questId="3"
        prefStore={prefStore} onSelectQuest={vi.fn()} onJumpToMonster={vi.fn()} />);
      await waitFor(() => expect(prefStore.read(questSelectedKey('royal'))).toBe('3'));

      rerender(<QuestView loader={makeLoader()} questSet="tavern" questId="GOMB"
        prefStore={prefStore} onSelectQuest={vi.fn()} onJumpToMonster={vi.fn()} />);
      await waitFor(() => expect(prefStore.read(questSelectedKey('tavern'))).toBe('GOMB'));
      expect(prefStore.read(questSelectedKey('royal'))).toBe('3');
    });

    it('records which set was last shown', async () => {
      const prefStore = makePrefStore({});
      render(<QuestView loader={makeLoader()} questSet="tavern" questId="GOMB"
        prefStore={prefStore} onSelectQuest={vi.fn()} onJumpToMonster={vi.fn()} />);
      await waitFor(() => expect(prefStore.read(QUEST_SET_PREF_KEY)).toBe('tavern'));
    });

    it('restores both the set and its selection on a bare route', async () => {
      const onSelectQuest = vi.fn();
      const prefStore = makePrefStore({
        [QUEST_SET_PREF_KEY]: 'tavern',
        [questSelectedKey('tavern')]: 'GOMB',
      });
      render(<QuestView loader={makeLoader()} questSet={null} questId={null}
        prefStore={prefStore} onSelectQuest={onSelectQuest} onJumpToMonster={vi.fn()} />);
      await waitFor(() => expect(onSelectQuest).toHaveBeenCalledWith('tavern', 'GOMB'));
    });

    // Falls back within the stored set, which is exactly what a selection key
    // alone could not express.
    it('falls back to the first quest of the stored set when the id is stale', async () => {
      const onSelectQuest = vi.fn();
      const prefStore = makePrefStore({
        [QUEST_SET_PREF_KEY]: 'tavern',
        [questSelectedKey('tavern')]: 'DELETED',
      });
      render(<QuestView loader={makeLoader()} questSet={null} questId={null}
        prefStore={prefStore} onSelectQuest={onSelectQuest} onJumpToMonster={vi.fn()} />);
      await waitFor(() => expect(onSelectQuest).toHaveBeenCalledWith('tavern', 'GOMB'));
    });

    it('seeds the royal selection from the pre-switcher key', async () => {
      const onSelectQuest = vi.fn();
      const prefStore = makePrefStore({ [LEGACY_QUEST_SELECTED_PREF_KEY]: '2' });
      render(<QuestView loader={makeLoader()} questSet={null} questId={null}
        prefStore={prefStore} onSelectQuest={onSelectQuest} onJumpToMonster={vi.fn()} />);
      await waitFor(() => expect(onSelectQuest).toHaveBeenCalledWith('royal', '2'));
    });
  });

  it('summarises the quest contents', async () => {
    const { container } = render(
      <QuestView loader={makeLoader()} questSet={null} questId="1"
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

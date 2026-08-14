import { h } from 'preact';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { QuestView } from '@/database/quests/QuestView';
import { buildMonsterDatabase } from '@/shared/data';
import type { DataLoader, Quest, QuestCell, Edge } from '@/shared/data';
import type { PrefStore } from '@/database/DatabaseApp';
import { LEGACY_QUEST_SELECTED_PREF_KEY } from '@/shared/prefKeys';

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
  // The description appears twice — in a chip's title attribute and in the
  // header — so these assertions use findAllByText rather than the
  // single-match variant.
  it('lists the quests and shows the selected one', async () => {
    render(<QuestView loader={makeLoader()} questId="1"
                      onSelectQuest={() => {}} onJumpToMonster={() => {}} />);
    expect((await screen.findAllByText(/Gründen borospincéje/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/20 db ezüst/)).toBeTruthy();
  });

  it('defaults to the first quest when none is routed', async () => {
    render(<QuestView loader={makeLoader()} questId={null}
                      onSelectQuest={() => {}} onJumpToMonster={() => {}} />);
    expect(await screen.findByText('1. küldetés')).toBeTruthy();
  });

  it('renders a numbered chip per quest, with the active one marked', async () => {
    const { container } = render(
      <QuestView loader={makeLoader()} questId="1"
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
      <QuestView loader={makeLoader()} questId="1"
                      onSelectQuest={onSelectQuest} onJumpToMonster={() => {}} />);
    await screen.findAllByText(/Gründen borospincéje/);
    const chips = container.querySelectorAll('.quest-chip');
    fireEvent.click(chips[1]);
    expect(onSelectQuest).toHaveBeenCalledWith('2');
  });

  it('highlights the key cell when a door is hovered', async () => {
    const { container } = render(
      <QuestView loader={makeLoader()} questId="1"
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
      <QuestView loader={makeLoader()} questId="1"
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
      <QuestView loader={makeLoader()} questId="1"
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
      <QuestView loader={makeLoader()} questId="1"
                 onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
    );
    await screen.findAllByText(/Gründen borospincéje/);
    const badge = container.querySelector('.quest-badge.key');
    expect(badge).toBeTruthy();
    expect(badge?.classList.contains('lock-vas')).toBe(true);
  });

  it('shows the szel caption only for a quest that actually has one', async () => {
    const { container, rerender } = render(
      <QuestView loader={makeLoader()} questId="1"
                 onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
    );
    await screen.findByText('1. küldetés');
    expect(container.querySelector('.quest-szel-note')).toBeNull();

    rerender(
      <QuestView loader={makeLoader()} questId="3"
                 onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
    );
    await screen.findByText('3. küldetés');
    expect(container.querySelector('.quest-szel-note')?.textContent).toMatch(/labirintus széle/);
  });

  describe('remembered zoom', () => {
    it('initialises the zoom from a supplied PrefStore', async () => {
      const prefStore = makePrefStore({ 'lc-quest-tile-size': '72' });
      render(
        <QuestView loader={makeLoader()} questId="1" prefStore={prefStore}
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      const select = await screen.findByLabelText('Méret') as HTMLSelectElement;
      expect(select.value).toBe('72');
    });

    it('writes the new zoom to the store when it is changed', async () => {
      const prefStore = makePrefStore();
      render(
        <QuestView loader={makeLoader()} questId="1" prefStore={prefStore}
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      const select = await screen.findByLabelText('Méret') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: '40' } });
      expect(prefStore.read('lc-quest-tile-size')).toBe('40');
    });

    it('survives an unmount/remount through the same store (the actual round trip)', async () => {
      const prefStore = makePrefStore();
      const { unmount } = render(
        <QuestView loader={makeLoader()} questId="1" prefStore={prefStore}
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      const select = await screen.findByLabelText('Méret') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: '40' } });
      unmount();

      render(
        <QuestView loader={makeLoader()} questId="1" prefStore={prefStore}
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
        <QuestView loader={makeLoader()} questId="1" prefStore={prefStore}
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      const select = await screen.findByLabelText('Méret') as HTMLSelectElement;
      expect(select.value).toBe('56');
    });

    it('works with no prefStore at all, defaulting the zoom as before', async () => {
      render(
        <QuestView loader={makeLoader()} questId="1"
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      const select = await screen.findByLabelText('Méret') as HTMLSelectElement;
      expect(select.value).toBe('56');
      fireEvent.change(select, { target: { value: '40' } });
      expect(select.value).toBe('40');
    });
  });

  describe('remembered selection', () => {
    it('restores the stored quest when questId is null (tab switch / bare route)', async () => {
      const prefStore = makePrefStore({ [LEGACY_QUEST_SELECTED_PREF_KEY]: '2' });
      const onSelectQuest = vi.fn();
      render(
        <QuestView loader={makeLoader()} questId={null} prefStore={prefStore}
                   onSelectQuest={onSelectQuest} onJumpToMonster={() => {}} />,
      );
      await waitFor(() => expect(onSelectQuest).toHaveBeenCalledWith('2'));
    });

    it('writes the quest id to the store whenever the selected quest changes', async () => {
      const prefStore = makePrefStore();
      const { rerender } = render(
        <QuestView loader={makeLoader()} questId="1" prefStore={prefStore}
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      await waitFor(() => expect(prefStore.read(LEGACY_QUEST_SELECTED_PREF_KEY)).toBe('1'));

      // Simulates the parent navigating after a chip click — QuestView itself
      // doesn't own the selection, so the prop change stands in for that.
      rerender(
        <QuestView loader={makeLoader()} questId="2" prefStore={prefStore}
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      await waitFor(() => expect(prefStore.read(LEGACY_QUEST_SELECTED_PREF_KEY)).toBe('2'));
    });

    it('falls back to the first quest when the stored id does not exist in the data', async () => {
      const prefStore = makePrefStore({ [LEGACY_QUEST_SELECTED_PREF_KEY]: '999' });
      const onSelectQuest = vi.fn();
      render(
        <QuestView loader={makeLoader()} questId={null} prefStore={prefStore}
                   onSelectQuest={onSelectQuest} onJumpToMonster={() => {}} />,
      );
      expect(await screen.findByText('1. küldetés')).toBeTruthy();
      // A stale id must never leave the tab broken, but it also must not be
      // treated as a valid selection to restore.
      expect(onSelectQuest).not.toHaveBeenCalled();
    });

    it('an explicit questId wins over the stored value and overwrites it', async () => {
      const prefStore = makePrefStore({ [LEGACY_QUEST_SELECTED_PREF_KEY]: '2' });
      const onSelectQuest = vi.fn();
      render(
        <QuestView loader={makeLoader()} questId="3" prefStore={prefStore}
                   onSelectQuest={onSelectQuest} onJumpToMonster={() => {}} />,
      );
      expect(await screen.findByText('3. küldetés')).toBeTruthy();
      // The store is a fallback, never an override, for a non-null questId.
      expect(onSelectQuest).not.toHaveBeenCalled();
      await waitFor(() => expect(prefStore.read(LEGACY_QUEST_SELECTED_PREF_KEY)).toBe('3'));
    });

    it('works with no prefStore at all', async () => {
      const onSelectQuest = vi.fn();
      render(
        <QuestView loader={makeLoader()} questId={null}
                   onSelectQuest={onSelectQuest} onJumpToMonster={() => {}} />,
      );
      expect(await screen.findByText('1. küldetés')).toBeTruthy();
      expect(onSelectQuest).not.toHaveBeenCalled();
    });

    // The actual round trip: not just that write() was called, but that a
    // fresh mount reading from the same store comes back with the quest that
    // was selected before the unmount — mirrors the tile-size round trip
    // above, for the same reason: only this proves persistence actually works.
    it('survives an unmount/remount through the same store (the actual round trip)', async () => {
      const prefStore = makePrefStore();
      const { unmount } = render(
        <QuestView loader={makeLoader()} questId="3" prefStore={prefStore}
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      await screen.findByText('3. küldetés');
      await waitFor(() => expect(prefStore.read(LEGACY_QUEST_SELECTED_PREF_KEY)).toBe('3'));
      unmount();

      const onSelectQuest = vi.fn();
      render(
        <QuestView loader={makeLoader()} questId={null} prefStore={prefStore}
                   onSelectQuest={onSelectQuest} onJumpToMonster={() => {}} />,
      );
      await waitFor(() => expect(onSelectQuest).toHaveBeenCalledWith('3'));
    });

    // Guards against the render-loop hazard called out in task 19: restoring
    // must fire onSelectQuest exactly once, even across an unrelated parent
    // re-render (a fresh onSelectQuest closure, same null questId — exactly
    // what DatabaseApp's inline arrow function produces on every render).
    it('calls onSelectQuest exactly once when restoring, even across an unrelated re-render', async () => {
      const prefStore = makePrefStore({ [LEGACY_QUEST_SELECTED_PREF_KEY]: '2' });
      const onSelectQuest = vi.fn();
      const { rerender } = render(
        <QuestView loader={makeLoader()} questId={null} prefStore={prefStore}
                   onSelectQuest={onSelectQuest} onJumpToMonster={() => {}} />,
      );
      await waitFor(() => expect(onSelectQuest).toHaveBeenCalledTimes(1));

      const onSelectQuestAfterRerender = vi.fn();
      rerender(
        <QuestView loader={makeLoader()} questId={null} prefStore={prefStore}
                   onSelectQuest={onSelectQuestAfterRerender} onJumpToMonster={() => {}} />,
      );
      expect(onSelectQuestAfterRerender).not.toHaveBeenCalled();
      expect(onSelectQuest).toHaveBeenCalledTimes(1);
    });
  });

  it('summarises the quest contents', async () => {
    const { container } = render(
      <QuestView loader={makeLoader()} questId="1"
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

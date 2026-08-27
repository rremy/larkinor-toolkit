import { h } from 'preact';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { QuestView } from '@/database/quests/QuestView';
import { buildMonsterDatabase } from '@/shared/data';
import type { DataLoader, Quest, QuestCell, Edge } from '@/shared/data';
import type { PrefStore } from '@/database/DatabaseApp';
import { LEGACY_QUEST_SELECTED_PREF_KEY, QUEST_SET_PREF_KEY, questClearedKey, questSelectedKey } from '@/shared/prefKeys';
import { parseCleared, serialiseCleared } from '@/shared/questCleared';

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

/**
 * `overrides` lets a test replace `loadQuests`/`loadTavernQuests` with its own
 * `vi.fn()` — to assert call counts, or to return a deferred promise the test
 * resolves manually to control fetch timing for a race scenario. Everything
 * not overridden defaults to a `vi.fn()` wrapper too, so plain `makeLoader()`
 * callers can still inspect call counts without opting in explicitly.
 */
function makeLoader(overrides: Partial<DataLoader> = {}): DataLoader {
  return {
    loadWeapons: async () => [], loadArmors: async () => [], loadItems: async () => [],
    loadMonsters: async () => buildMonsterDatabase([]),
    loadMap: async () => ({ cells: [] }),
    loadItemShops: async () => ({ shops: [] }),
    loadWeaponShops: async () => ({ shops: [] }),
    loadQuests: vi.fn(async () => quests),
    loadTavernQuests: vi.fn(async () => tavernQuests),
    ...overrides,
  };
}

/** A promise a test can resolve on its own schedule, to control fetch timing. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
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

    // The on-demand fetch exists to avoid ever loading both ~1.5MB/~1.2MB
    // files at once; a rapid double click on the same uncached target must
    // not defeat that by issuing the request twice.
    it('shares one fetch when the same uncached target is clicked twice before it resolves', async () => {
      const onSelectQuest = vi.fn();
      const loader = makeLoader();
      render(<QuestView loader={loader} questSet="royal" questId="1"
        onSelectQuest={onSelectQuest} onJumpToMonster={vi.fn()} />);
      const kocsmaiBtn = await screen.findByRole('button', { name: 'Kocsmai' });
      fireEvent.click(kocsmaiBtn);
      fireEvent.click(kocsmaiBtn);
      await waitFor(() => expect(onSelectQuest).toHaveBeenCalledWith('tavern', 'GOMB'));
      expect(loader.loadTavernQuests).toHaveBeenCalledTimes(1);
    });

    // The race this guards against: a slow fetch for a set the user is
    // switching *away from* (in spirit — here, away from *to*, but the same
    // shape) must not land after the user has already navigated elsewhere by
    // a different path (a direct chip click), yanking them back out of where
    // they now are. A deferred promise pins the fetch open so the test can
    // interleave the "meanwhile" navigation deterministically, without a timer.
    it('drops a stale switch result superseded by a navigation that lands first', async () => {
      const onSelectQuest = vi.fn();
      const royal = deferred<Quest[]>();
      const loader = makeLoader({ loadQuests: vi.fn(() => royal.promise) });
      const { rerender } = render(
        <QuestView loader={loader} questSet="tavern" questId="MASIK"
          onSelectQuest={onSelectQuest} onJumpToMonster={vi.fn()} />,
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Királyi' }));
      expect(loader.loadQuests).toHaveBeenCalledTimes(1);

      // Before the royal fetch resolves, a direct chip click already landed a
      // different navigation — simulated the same way every other
      // persistence test simulates the parent feeding a new route back in.
      rerender(
        <QuestView loader={loader} questSet="tavern" questId="GOMB"
          onSelectQuest={onSelectQuest} onJumpToMonster={vi.fn()} />,
      );

      royal.resolve(quests);
      // Flush the microtask queue enough times for changeSet's continuation
      // (the `await fetchSet` and the checks after it) to run to completion.
      await royal.promise;
      await Promise.resolve();
      await Promise.resolve();

      expect(onSelectQuest).not.toHaveBeenCalledWith('royal', expect.anything());
    });

    // The race this guards against: clicking Kocsmai (starts a slow fetch),
    // then clicking straight back to Királyi before that fetch resolves, must
    // land on Királyi — the user's last click — not get silently overridden
    // when the abandoned tavern fetch finally resolves. This only holds if
    // the same-set click still bumps navGenerationRef; otherwise the tavern
    // fetch's generation check never notices it was superseded.
    it('does not let a same-set click-back get overridden by the fetch it was meant to abandon', async () => {
      const onSelectQuest = vi.fn();
      const tavern = deferred<Quest[]>();
      const loader = makeLoader({ loadTavernQuests: vi.fn(() => tavern.promise) });
      render(
        <QuestView loader={loader} questSet="royal" questId="1"
          onSelectQuest={onSelectQuest} onJumpToMonster={vi.fn()} />,
      );

      // Click away to tavern: kicks off the deferred fetch.
      fireEvent.click(await screen.findByRole('button', { name: 'Kocsmai' }));
      expect(loader.loadTavernQuests).toHaveBeenCalledTimes(1);

      // Click straight back to royal before the tavern fetch resolves. Since
      // `activeSet` is still 'royal' at this point (no navigation landed
      // yet), this is a same-set click from `changeSet`'s point of view.
      fireEvent.click(await screen.findByRole('button', { name: 'Királyi' }));

      // Now let the abandoned tavern fetch resolve.
      tavern.resolve(tavernQuests);
      await tavern.promise;
      await Promise.resolve();
      await Promise.resolve();

      expect(onSelectQuest).not.toHaveBeenCalledWith('tavern', expect.anything());
    });

    // The switcher used to render only after the loading/empty early returns,
    // so a stored set whose fetch fails (or comes back empty) left the user
    // wedged with no way back — worse in-game, where the overlay remounts on
    // every action and re-derives the same stuck set every time. It must now
    // render even while stuck on "Betöltés…", and clicking it must still work.
    it('keeps the switcher reachable and clickable when the active set fails to load', async () => {
      const onSelectQuest = vi.fn();
      const loader = makeLoader({ loadTavernQuests: vi.fn(() => Promise.reject(new Error('boom'))) });
      render(<QuestView loader={loader} questSet="tavern" questId={null}
        onSelectQuest={onSelectQuest} onJumpToMonster={vi.fn()} />);

      // Stuck: the failed fetch never populates `bySet.tavern`, so the view
      // stays on the "Betöltés…" state — but the switcher must still be there.
      const royalBtn = await screen.findByRole('button', { name: 'Királyi' });
      expect(screen.getByText('Betöltés…')).toBeTruthy();

      fireEvent.click(royalBtn);
      await waitFor(() => expect(onSelectQuest).toHaveBeenCalledWith('royal', '1'));
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

    // Regression guard for `restoredQuestRef`'s reset effect (the one keyed
    // on `[activeSet]`). Its guard only lets the restore-from-store effect
    // fire once per mount unless something flips it back — without the reset
    // effect, having already restored once on royal would permanently block
    // ever restoring again after navigating to a bare route on tavern.
    it('restores the new set\'s own selection after navigating to a bare route on a different set', async () => {
      const onSelectQuest = vi.fn();
      const prefStore = makePrefStore({
        [QUEST_SET_PREF_KEY]: 'royal',
        [questSelectedKey('royal')]: '2',
        [questSelectedKey('tavern')]: 'GOMB',
      });
      const { rerender } = render(<QuestView loader={makeLoader()} questSet="royal" questId={null}
        prefStore={prefStore} onSelectQuest={onSelectQuest} onJumpToMonster={vi.fn()} />);
      // First restore: fires on royal, latching `restoredQuestRef`.
      await waitFor(() => expect(onSelectQuest).toHaveBeenCalledWith('royal', '2'));

      // A bare `#quests/tavern` route lands here with questId null again, on
      // a different set. Without the reset effect, the latch from the royal
      // restore above would suppress this one entirely.
      rerender(<QuestView loader={makeLoader()} questSet="tavern" questId={null}
        prefStore={prefStore} onSelectQuest={onSelectQuest} onJumpToMonster={vi.fn()} />);
      await waitFor(() => expect(onSelectQuest).toHaveBeenCalledWith('tavern', 'GOMB'));
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

  describe('collapsible details', () => {
    // The collapse itself is a media-query affair — the toggle is display:none
    // at full width and only the narrow-viewport block hides the folded block.
    // So these assert the state the stylesheet keys off (the
    // `details-collapsed` class and `aria-expanded`), which is all jsdom can
    // see.
    it('starts collapsed, with a toggle offering the details', async () => {
      const { container } = render(
        <QuestView loader={makeLoader()} questSet={null} questId="1"
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      await screen.findAllByText(/Gründen borospincéje/);
      const toggle = container.querySelector('.quest-details-toggle') as HTMLButtonElement;
      expect(toggle).not.toBeNull();
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(container.querySelector('.quest-header')!.classList.contains('details-collapsed')).toBe(true);
    });

    it('expands and re-collapses on the toggle', async () => {
      const { container } = render(
        <QuestView loader={makeLoader()} questSet={null} questId="1"
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      await screen.findAllByText(/Gründen borospincéje/);
      const toggle = container.querySelector('.quest-details-toggle') as HTMLButtonElement;
      const header = container.querySelector('.quest-header')!;

      fireEvent.click(toggle);
      expect(header.classList.contains('details-collapsed')).toBe(false);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');

      fireEvent.click(toggle);
      expect(header.classList.contains('details-collapsed')).toBe(true);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
    });

    it('points the toggle at the block it controls', async () => {
      const { container } = render(
        <QuestView loader={makeLoader()} questSet={null} questId="1"
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      await screen.findAllByText(/Gründen borospincéje/);
      const controls = container.querySelector('.quest-details-toggle')!.getAttribute('aria-controls');
      expect(controls).toBeTruthy();
      expect(container.querySelector('.quest-details')!.id).toBe(controls);
    });

    it('folds the description, the reward and the stats away together', async () => {
      const { container } = render(
        <QuestView loader={makeLoader()} questSet={null} questId="1"
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      await screen.findAllByText(/Gründen borospincéje/);
      const details = container.querySelector('.quest-details')!;
      expect(details.querySelector('.quest-description')).not.toBeNull();
      expect(details.querySelector('.quest-reward')).not.toBeNull();
      expect(details.querySelector('.quest-stats')).not.toBeNull();
    });

    it('keeps the zoom control out of the fold, so the maze stays resizable while collapsed', async () => {
      const { container } = render(
        <QuestView loader={makeLoader()} questSet={null} questId="1"
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      await screen.findAllByText(/Gründen borospincéje/);
      expect(container.querySelector('.quest-details .quest-zoom')).toBeNull();
      expect(container.querySelector('.quest-header .quest-zoom')).not.toBeNull();
    });

    it('survives an unmount/remount through the same store (the reload on every game action)', async () => {
      const prefStore = makePrefStore();
      const first = render(
        <QuestView loader={makeLoader()} questSet={null} questId="1" prefStore={prefStore}
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      await screen.findAllByText(/Gründen borospincéje/);
      fireEvent.click(first.container.querySelector('.quest-details-toggle') as HTMLButtonElement);
      first.unmount();

      const second = render(
        <QuestView loader={makeLoader()} questSet={null} questId="1" prefStore={prefStore}
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      await screen.findAllByText(/Gründen borospincéje/);
      expect(second.container.querySelector('.quest-header')!.classList.contains('details-collapsed')).toBe(false);
    });

    it('collapses by default when no store is wired up at all', async () => {
      const { container } = render(
        <QuestView loader={makeLoader()} questSet={null} questId="1"
                   onSelectQuest={() => {}} onJumpToMonster={() => {}} />,
      );
      await screen.findAllByText(/Gründen borospincéje/);
      expect(container.querySelector('.quest-header')!.classList.contains('details-collapsed')).toBe(true);
    });
  });

  describe('cleared cells', () => {
    it('persists a cleared cell per quest and offers a reset', async () => {
      const prefStore = makePrefStore({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '1' });
      const { container } = render(<QuestView loader={makeLoader()} questSet="royal" questId="1"
        prefStore={prefStore} onSelectQuest={() => {}} onJumpToMonster={() => {}} />);

      // Queried by coordinate attributes rather than by title: the tile's title
      // is a composed Hungarian label (`1. sor, 1. oszlop — …`) that these tests
      // have no reason to depend on.
      const tile = await waitFor(() => {
        const el = container.querySelector('.quest-cell[data-row="0"][data-col="0"]');
        expect(el).not.toBeNull();
        return el!;
      });
      fireEvent.click(tile);
      fireEvent.click(screen.getByRole('button', { name: /Teljesítve/ }));

      await waitFor(() => expect(
        parseCleared(prefStore.read(questClearedKey('royal', '1'))),
      ).toEqual(new Set(['0,0'])));
      expect(screen.getByText(/Teljesített: 1/)).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: /Visszaállítás/ }));
      await waitFor(() => expect(
        parseCleared(prefStore.read(questClearedKey('royal', '1'))),
      ).toEqual(new Set()));
    });

    it('renders cells the store already marks as cleared', async () => {
      const prefStore = makePrefStore({
        [QUEST_SET_PREF_KEY]: 'royal',
        [questSelectedKey('royal')]: '1',
        [questClearedKey('royal', '1')]: serialiseCleared(new Set(['0,1'])),
      });
      const { container } = render(<QuestView loader={makeLoader()} questSet="royal" questId="1"
        prefStore={prefStore} onSelectQuest={() => {}} onJumpToMonster={() => {}} />);

      await waitFor(() => expect(
        container.querySelector('.quest-cell[data-row="0"][data-col="1"]')?.classList.contains('cleared'),
      ).toBe(true));
    });

    it('shows no reset control when nothing is cleared', async () => {
      const prefStore = makePrefStore({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '1' });
      const { container } = render(<QuestView loader={makeLoader()} questSet="royal" questId="1"
        prefStore={prefStore} onSelectQuest={() => {}} onJumpToMonster={() => {}} />);

      await waitFor(() => expect(container.querySelector('.quest-cell')).not.toBeNull());
      expect(screen.queryByRole('button', { name: /Visszaállítás/ })).toBeNull();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { h } from 'preact';
import { render, screen, waitFor } from '@testing-library/preact';
import { readFileSync } from 'node:fs';
import { QuestGrid } from '@/database/quests/QuestGrid';
import { QuestView } from '@/database/quests/QuestView';
import { buildMonsterDatabase, type DataLoader, type Quest } from '@/shared/data';
import { QUEST_POSITION_PREF_KEY, QUEST_SET_PREF_KEY, questSelectedKey } from '@/shared/prefKeys';
import { serialiseQuestPosition, type QuestPosition } from '@/shared/questPosition';

const royal: Quest[] = JSON.parse(readFileSync('static/db/quests.json', 'utf-8'));
const quest35 = royal.find((q) => q.id === '35')!;

const monsters = buildMonsterDatabase([]);

const AT_0_6: QuestPosition = {
  set: 'royal', questId: '35', cells: [{ row: 0, col: 6 }], exact: true, source: 'narration',
};

const cellAt = (row: number, col: number) =>
  document.querySelector(`.quest-cell[data-row="${row}"][data-col="${col}"]`)!;

describe('QuestGrid position marker', () => {
  it('marks an exact position confidently, with a pin', () => {
    render(h(QuestGrid, { quest: quest35, monsters, selected: null, onSelect: () => {}, position: AT_0_6 }));

    const here = cellAt(0, 6);
    expect(here.className).toContain('here');
    expect(here.className).not.toContain('maybe-here');
    expect(here.getAttribute('title')).toContain('itt vagy');
    expect(here.querySelector('.quest-badge.here')).not.toBeNull();
  });

  it('marks several candidates tentatively, with no pin', () => {
    const ambiguous: QuestPosition = {
      set: 'royal', questId: '35', cells: [{ row: 0, col: 6 }, { row: 1, col: 1 }], exact: false, source: 'narration',
    };
    render(h(QuestGrid, { quest: quest35, monsters, selected: null, onSelect: () => {}, position: ambiguous }));

    for (const [row, col] of [[0, 6], [1, 1]]) {
      const cell = cellAt(row, col);
      expect(cell.className).toContain('maybe-here');
      expect(cell.getAttribute('title')).toContain('talán itt vagy');
      // Three pins would read as three players rather than one uncertainty.
      expect(cell.querySelector('.quest-badge.here')).toBeNull();
    }
  });

  it('marks nothing without a position', () => {
    render(h(QuestGrid, { quest: quest35, monsters, selected: null, onSelect: () => {}, position: null }));
    expect(document.querySelector('.quest-cell.here')).toBeNull();
    expect(document.querySelector('.quest-cell.maybe-here')).toBeNull();
  });

  it('leaves the coordinate title alone on every other cell', () => {
    render(h(QuestGrid, { quest: quest35, monsters, selected: null, onSelect: () => {}, position: AT_0_6 }));
    expect(cellAt(0, 5).getAttribute('title')).toBe('1. sor, 6. oszlop');
  });
});

function makeLoader(): DataLoader {
  return {
    loadQuests: async () => royal,
    loadTavernQuests: async () => [],
    loadMonsters: async () => monsters,
    loadWeapons: async () => [],
    loadArmors: async () => [],
    loadItems: async () => [],
    loadMap: async () => ({}) as never,
    loadItemShops: async () => ({}) as never,
    loadWeaponShops: async () => ({}) as never,
  } as DataLoader;
}

function makePrefStore(initial: Record<string, string>) {
  const store = new Map(Object.entries(initial));
  return { read: (k: string) => store.get(k) ?? null, write: (k: string, v: string) => { store.set(k, v); } };
}

describe('QuestView reading the stored position', () => {
  beforeEach(() => {
    // Follows MapView's pattern; jsdom implements neither.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  const mount = (prefs: Record<string, string>) => render(h(QuestView, {
    loader: makeLoader(),
    questSet: 'royal',
    questId: '35',
    prefStore: makePrefStore(prefs),
    onSelectQuest: () => {},
    onJumpToMonster: () => {},
  }));

  it('marks the stored cell and opens its detail panel', async () => {
    mount({
      [QUEST_SET_PREF_KEY]: 'royal',
      [questSelectedKey('royal')]: '35',
      [QUEST_POSITION_PREF_KEY]: serialiseQuestPosition(AT_0_6),
    });

    await waitFor(() => expect(document.querySelector('.quest-cell.here')).not.toBeNull());
    expect(cellAt(0, 6).className).toContain('here');
    // Selecting the cell hands over its detail panel for free.
    await waitFor(() => expect(screen.getByText('1. sor, 7. oszlop')).toBeTruthy());
    expect(cellAt(0, 6).className).toContain('selected');
  });

  // The grid cannot tell a foreign coordinate from a local one, so a position
  // detected elsewhere must never be drawn onto the maze on screen.
  it('ignores a position belonging to another quest', async () => {
    mount({
      [QUEST_SET_PREF_KEY]: 'royal',
      [questSelectedKey('royal')]: '35',
      [QUEST_POSITION_PREF_KEY]: serialiseQuestPosition({ ...AT_0_6, questId: '12' }),
    });

    await waitFor(() => expect(document.querySelector('.quest-cell')).not.toBeNull());
    expect(document.querySelector('.quest-cell.here')).toBeNull();
  });

  it('ignores a position belonging to the other set', async () => {
    mount({
      [QUEST_SET_PREF_KEY]: 'royal',
      [questSelectedKey('royal')]: '35',
      [QUEST_POSITION_PREF_KEY]: serialiseQuestPosition({ ...AT_0_6, set: 'tavern' }),
    });

    await waitFor(() => expect(document.querySelector('.quest-cell')).not.toBeNull());
    expect(document.querySelector('.quest-cell.here')).toBeNull();
  });

  it('marks nothing when no position is stored', async () => {
    mount({ [QUEST_SET_PREF_KEY]: 'royal', [questSelectedKey('royal')]: '35' });

    await waitFor(() => expect(document.querySelector('.quest-cell')).not.toBeNull());
    expect(document.querySelector('.quest-cell.here')).toBeNull();
  });

  it('marks nothing when the stored position is corrupt', async () => {
    mount({
      [QUEST_SET_PREF_KEY]: 'royal',
      [questSelectedKey('royal')]: '35',
      [QUEST_POSITION_PREF_KEY]: '{"version":1,"set":"royal"',
    });

    await waitFor(() => expect(document.querySelector('.quest-cell')).not.toBeNull());
    expect(document.querySelector('.quest-cell.here')).toBeNull();
  });

  // An ambiguous match has no single cell to show, and picking one would undo
  // the honesty of the tentative marker.
  it('selects nothing for an ambiguous position', async () => {
    mount({
      [QUEST_SET_PREF_KEY]: 'royal',
      [questSelectedKey('royal')]: '35',
      [QUEST_POSITION_PREF_KEY]: serialiseQuestPosition({
        set: 'royal', questId: '35', cells: [{ row: 0, col: 6 }, { row: 1, col: 1 }], exact: false, source: 'narration',
      }),
    });

    await waitFor(() => expect(document.querySelector('.quest-cell.maybe-here')).not.toBeNull());
    expect(document.querySelector('.quest-cell.selected')).toBeNull();
  });

  // A coordinate outside the maze must not crash the view or select anything.
  it('survives a stored cell the quest does not contain', async () => {
    mount({
      [QUEST_SET_PREF_KEY]: 'royal',
      [questSelectedKey('royal')]: '35',
      [QUEST_POSITION_PREF_KEY]: serialiseQuestPosition({ ...AT_0_6, cells: [{ row: 99, col: 99 }] }),
    });

    await waitFor(() => expect(document.querySelector('.quest-cell')).not.toBeNull());
    expect(document.querySelector('.quest-cell.selected')).toBeNull();
  });
});

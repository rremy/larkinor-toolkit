import { h } from 'preact';
import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseApp, parseRoute, serializeRoute } from '@/database/DatabaseApp';
import type { DataLoader, QuestCell } from '@/shared/data';

// Shared by every quest fixture below: a fully-populated 1x1 grid, so the
// exact geometry never matters to a test that only checks which quest/tab
// rendered.
const TEST_CELL: QuestCell = {
  row: 0, col: 0,
  edges: { N: { kind: 'open' }, E: { kind: 'open' }, S: { kind: 'open' }, W: { kind: 'open' } },
  monsterId: null, monsterName: null, boss: false, key: null, questItem: false,
  portal: null, trap: false, death: false, narration: '', drops: null, hasQuestion: false,
  question: null, rawImage: '',
};

// Minimal stub loader — these tests only exercise tab navigation, never wait
// on the resolved data, so the exact payload shape doesn't matter.
const stubLoader: DataLoader = {
  loadWeapons: () => Promise.resolve([]),
  loadArmors: () => Promise.resolve([]),
  loadItems: () => Promise.resolve([]),
  loadMonsters: () => Promise.resolve({
    byName: new Map(), byId: new Map(),
    getByName: () => undefined, getById: () => undefined,
  }),
  loadMap: () => Promise.resolve({} as never),
  loadItemShops: () => Promise.resolve({} as never),
  loadWeaponShops: () => Promise.resolve({} as never),
  loadQuests: () => Promise.resolve([{
    id: '12', set: 'royal', title: '12', description: 'Teszt küldetés', reward: '1 db ezüst', rows: 1, cols: 1,
    cells: [TEST_CELL],
  }]),
  loadTavernQuests: () => Promise.resolve([
    {
      id: 'GOMB', set: 'tavern', title: 'GÖMB', description: 'Teszt küldetés', reward: '1 db ezüst',
      rows: 1, cols: 1, cells: [TEST_CELL],
    },
    {
      id: 'GY.I.K.', set: 'tavern', title: 'GY.I.K.', description: 'Teszt küldetés', reward: '1 db ezüst',
      rows: 1, cols: 1, cells: [TEST_CELL],
    },
  ]),
};

describe('DatabaseApp routing', () => {
  beforeEach(() => { location.hash = ''; });
  afterEach(() => { location.hash = ''; });

  it('hash mode: initializes route from location.hash and updates it on navigate', () => {
    location.hash = '#armors';
    render(<DatabaseApp loader={stubLoader} routing="hash" />);
    expect(screen.getByText('Vértek').className).toContain('active');

    fireEvent.click(screen.getByText('Szörnyek'));
    expect(location.hash).toBe('#monsters');
  });

  it('hash mode is the default when `routing` is omitted', () => {
    render(<DatabaseApp loader={stubLoader} />);
    // No hash present yet → defaults to weapons and writes it to the URL.
    expect(location.hash).toBe('#weapons');
  });

  it('memory mode: never reads or writes location.hash', () => {
    location.hash = '#monsters/7';
    render(<DatabaseApp loader={stubLoader} routing="memory" />);
    // Ignores the pre-existing hash — starts at the hard-coded default route.
    expect(screen.getByText('Fegyverek').className).toContain('active');
    expect(location.hash).toBe('#monsters/7');

    fireEvent.click(screen.getByText('Vértek'));
    expect(screen.getByText('Vértek').className).toContain('active');
    expect(location.hash).toBe('#monsters/7');
  });

  it('renders the quest tab and routes to a quest', async () => {
    location.hash = '#quests/1';
    render(<DatabaseApp loader={stubLoader} />);
    expect(await screen.findByText('Küldetések')).toBeTruthy();

    // The tab label alone proves nothing — it renders unconditionally from
    // TABS regardless of which branch the route body takes. Pin the actual
    // QuestView render: its description text (which appears twice — once in
    // the quest picker row, once in the header — so use findAllByText) and
    // its grid wrapper, neither of which exists unless QuestView mounted.
    expect((await screen.findAllByText('Teszt küldetés')).length).toBeGreaterThan(0);
    expect(document.querySelector('.quest-grid-wrap')).toBeTruthy();
  });

  it('threads an injected prefStore through to the quest view', async () => {
    location.hash = '#quests/1';
    const store: Record<string, string> = { 'lc-quest-tile-size': '72' };
    const prefStore = {
      read: (key: string) => store[key] ?? null,
      write: (key: string, value: string) => { store[key] = value; },
    };
    render(<DatabaseApp loader={stubLoader} prefStore={prefStore} />);
    const select = await screen.findByLabelText('Méret') as HTMLSelectElement;
    expect(select.value).toBe('72');
  });
});

describe('quest routing', () => {
  beforeEach(() => { location.hash = ''; });
  afterEach(() => { location.hash = ''; });

  it('reads a legacy #quests/12 as royal quest 12', async () => {
    location.hash = '#quests/12';
    render(<DatabaseApp loader={stubLoader} />);
    await screen.findByText('12. küldetés');
  });

  it('routes #quests/royal/12 to royal quest 12', async () => {
    location.hash = '#quests/royal/12';
    render(<DatabaseApp loader={stubLoader} />);
    await screen.findByText('12. küldetés');
  });

  // QuestView isn't set-aware yet (task 7 wires that up), so a tavern route
  // can't render the tavern quest itself here — the only thing this task can
  // prove is that the widened grammar accepts the slug and lands on the
  // quests tab, rather than failing to parse and falling back to the default
  // (weapons) tab.
  it('accepts #quests/tavern/GOMB and keeps the quests tab active', async () => {
    location.hash = '#quests/tavern/GOMB';
    render(<DatabaseApp loader={stubLoader} />);
    expect(await screen.findByText('Küldetések')).toBeTruthy();
    expect(screen.getByText('Küldetések').className).toContain('active');
    expect(screen.getByText('Fegyverek').className).not.toContain('active');
  });

  // The important case: a slug carrying dots and mixed case, which the old
  // `-?\d+` grammar rejected outright.
  it('accepts a slug containing dots and mixed case', async () => {
    location.hash = '#quests/tavern/GY.I.K.';
    render(<DatabaseApp loader={stubLoader} />);
    expect(await screen.findByText('Küldetések')).toBeTruthy();
    expect(screen.getByText('Küldetések').className).toContain('active');
    expect(screen.getByText('Fegyverek').className).not.toContain('active');
  });

  // Ruling: a null/empty quest id must round-trip through a bare
  // `#quests/<set>` hash, not an unparseable trailing slash.
  it('serialises a null/empty quest id without a trailing slash and parses it back', () => {
    expect(serializeRoute('quests', 'tavern', null)).toBe('quests/tavern');
    expect(serializeRoute('quests', 'tavern', '')).toBe('quests/tavern');
    expect(parseRoute('quests/tavern')).toEqual({
      tab: 'quests', id: null, cell: null, set: 'tavern', quest: null,
    });
  });
});

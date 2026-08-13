import { h } from 'preact';
import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseApp } from '@/database/DatabaseApp';
import type { DataLoader } from '@/shared/data';

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
    id: 1, description: 'Teszt küldetés', reward: '1 db ezüst', rows: 1, cols: 1,
    cells: [{
      row: 0, col: 0,
      edges: { N: { kind: 'open' }, E: { kind: 'open' }, S: { kind: 'open' }, W: { kind: 'open' } },
      monsterId: null, monsterName: null, boss: false, key: null, questItem: false,
      portal: null, trap: false, death: false, narration: '', drops: null,
      question: null, rawImage: '',
    }],
  }]),
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
});

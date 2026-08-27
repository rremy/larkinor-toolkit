import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { Dungeon } from '../src/pages/Dungeon';
import type { DungeonState } from '../src/utils/domExtract';
import { setEnabledHotkeys } from '../src/utils/config';
import { USERSCRIPT_DATA_BASE_URL } from '../src/shared/publicUrl';

function buildState(overrides: Partial<DungeonState> = {}): DungeonState {
  return {
    playerName: 'Remy',
    gold: 42,
    hp: 303, hpMax: 303, mp: 286, mpMax: 286,
    statusIcons: [],
    tiles: [{ imageUrl: 'https://x/talaj.gif', left: 0, top: 0, width: 150, height: 150, z: 3 }],
    directions: [{ dir: 'north', label: 'Észak', trigger: vi.fn() }],
    buildings: [],
    settingsButton: null,
    restButton: null,
    actions: [],
    narration: 'Továbbjöttél keletre.',
    narrationLinks: [],
    question: null,
    ...overrides,
  };
}

describe('Dungeon', () => {
  it('always renders the composed cell and the stat bar', () => {
    const { container } = render(<Dungeon state={buildState()} />);
    expect(container.querySelector('.lc-dungeon-cell')).not.toBeNull();
    expect(container.querySelector('.lc-stat-bar')).not.toBeNull();
  });

  it('wraps the composed cell and stat bar together so the stat bar can overlay the cell', () => {
    const { container } = render(<Dungeon state={buildState()} />);
    const hero = container.querySelector('.lc-hero')!;
    expect(hero).not.toBeNull();
    expect(hero.querySelector('.lc-dungeon-cell')).not.toBeNull();
    expect(hero.querySelector('.lc-stat-bar')).not.toBeNull();
  });

  it('shows the NavPad (and no question) on a plain cell', () => {
    const { container } = render(<Dungeon state={buildState()} />);
    expect(container.querySelector('.lc-navpad')).not.toBeNull();
    expect(container.querySelector('.lc-question')).toBeNull();
  });

  it('replaces the NavPad with the QuestionPanel when a question is active', () => {
    const state = buildState({
      question: {
        prompt: 'Kortyolj a megfelelőből!',
        answers: [{ label: 'A', select: vi.fn() }],
        submit: vi.fn(),
      },
    });
    const { container } = render(<Dungeon state={state} />);
    expect(container.querySelector('.lc-question')).not.toBeNull();
    expect(container.querySelector('.lc-navpad')).toBeNull();
  });

  it('renders settings and rest as NavPad corners', () => {
    const state = buildState({
      settingsButton: { label: 'Beállítások', iconUrl: 'https://x/klap.gif', trigger: vi.fn() },
      restButton: { label: 'Pihensz egy kicsit', iconUrl: 'https://x/pihen.gif', trigger: vi.fn() },
    });
    const { container } = render(<Dungeon state={state} />);
    expect(container.querySelector('.lc-navpad-corner--left img')?.getAttribute('src')).toBe('https://x/klap.gif');
    expect(container.querySelector('.lc-navpad-corner--right img')?.getAttribute('src')).toBe('https://x/pihen.gif');
  });

  it('opens the config drawer from the stat-bar gear', () => {
    setEnabledHotkeys([]);
    const { container } = render(<Dungeon state={buildState()} />);
    expect(container.querySelector('.lc-config-hotkeys')).toBeNull();
    fireEvent.click(container.querySelector('.lc-statbar-gear')!);
    expect(container.querySelector('.lc-config-hotkeys')).not.toBeNull();
  });

  it('renders the hotkey row inside the navpad section, below the grid', () => {
    setEnabledHotkeys(['kajal']);
    const state = buildState({ actions: [{ label: 'kajálsz', actionKey: 'kajal', trigger: vi.fn() }] });
    const { container } = render(<Dungeon state={state} />);
    const navpad = container.querySelector('.lc-navpad')!;
    const hotkeys = navpad.querySelector('.lc-hotkeys');
    expect(hotkeys).not.toBeNull();
    const grid = navpad.querySelector('.lc-navpad-grid')!;
    // eslint-disable-next-line no-bitwise
    expect(grid.compareDocumentPosition(hotkeys!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('promotes an enabled+available action to the hotkey row and drops it from the buttons', () => {
    setEnabledHotkeys(['kajal']);
    const state = buildState({
      actions: [
        { label: 'kajálsz', actionKey: 'kajal', trigger: vi.fn() },
        { label: 'imádkozol', actionKey: 'imadkozas', trigger: vi.fn() },
      ],
    });
    const { container } = render(<Dungeon state={state} />);
    expect(container.querySelector('.lc-hotkeys .lc-hotkey')).not.toBeNull();
    const btnLabels = Array.from(container.querySelectorAll('.lc-btn')).map(b => b.textContent);
    expect(btnLabels).not.toContain('kajálsz');
    expect(btnLabels).toContain('imádkozol');
  });

  describe('database and quests buttons', () => {
    // The loader caches quests.json/monsters.json under a fixed GM key in tests
    // (no `?v=` tag), so clear it before stubbing a fresh response — otherwise a
    // stale response cached by an earlier test could satisfy this block's own
    // stub without the mock ever being called.
    function questCell() {
      return {
        row: 0, col: 0,
        edges: { N: { kind: 'open' }, E: { kind: 'open' }, S: { kind: 'open' }, W: { kind: 'open' } },
        monsterId: null, monsterName: null, boss: false, key: null, questItem: false,
        portal: null, trap: false, death: false, narration: '', drops: null, hasQuestion: false,
        question: null, rawImage: '',
      };
    }

    function stubQuestData(quests: Array<{ id: string; description: string }> = [{ id: '1', description: 'Teszt küldetés' }]) {
      const base = `lc_cache:${USERSCRIPT_DATA_BASE_URL}`;
      for (const file of ['quests.json', 'monsters.json']) {
        GM_setValue(`${base}/${file}`, '');
        GM_setValue(`${base}/${file}:v`, '');
      }
      const stubQuests = quests.map((q) => ({
        id: q.id, description: q.description, reward: '1 db ezüst', rows: 1, cols: 1,
        cells: [questCell()],
      }));
      vi.mocked(GM_xmlhttpRequest).mockImplementation(((opts: {
        url: string;
        onload?: (res: { status: number; responseText: string }) => void;
      }) => {
        if (opts.url.includes('quests.json')) {
          opts.onload?.({ status: 200, responseText: JSON.stringify(stubQuests) });
        } else if (opts.url.includes('monsters.json')) {
          opts.onload?.({ status: 200, responseText: JSON.stringify([]) });
        }
      }) as unknown as typeof GM_xmlhttpRequest);
    }

    afterEach(() => {
      vi.mocked(GM_xmlhttpRequest).mockReset();
    });

    it('opens the database overlay from the Adatbázis icon button, and closes it', () => {
      const { container } = render(<Dungeon state={buildState()} />);
      expect(container.querySelector('.lc-db-overlay')).toBeNull();

      fireEvent.click(screen.getByLabelText('Adatbázis'));
      expect(document.querySelector('.lc-db-overlay')).toBeTruthy();

      fireEvent.click(screen.getByLabelText('Bezárás'));
      expect(document.querySelector('.lc-db-overlay')).toBeNull();
    });

    it('opens the database overlay on the quests view, not merely the panel', async () => {
      stubQuestData();
      render(<Dungeon state={buildState()} />);

      fireEvent.click(screen.getByLabelText('Küldetések'));

      // Assert on the rendered quest content, not just that the panel opened —
      // a bug that opened the overlay on the wrong tab would still leave the
      // panel visible.
      expect((await screen.findAllByText('Teszt küldetés')).length).toBeGreaterThan(0);
    });

    it('re-navigates to quests on a second press, even after the overlay moved to another tab', async () => {
      // The press has to carry a nonce, not just the 'quests' literal: setting
      // the same value again is a no-op state update, so DatabaseApp's landing
      // effect would never re-fire and the overlay would stay wherever the
      // player had navigated inside it.
      stubQuestData();
      render(<Dungeon state={buildState()} />);

      fireEvent.click(screen.getByLabelText('Küldetések'));
      expect((await screen.findAllByText('Teszt küldetés')).length).toBeGreaterThan(0);

      const monstersTab = [...document.querySelectorAll('.lc-db .tab')]
        .find((t) => t.textContent === 'Szörnyek') as HTMLElement;
      fireEvent.click(monstersTab);
      expect(document.querySelector('.lc-db .tab.active')?.textContent).toBe('Szörnyek');

      fireEvent.click(screen.getByLabelText('Küldetések'));
      expect(document.querySelector('.lc-db .tab.active')?.textContent).toBe('Küldetések');
    });

    it('opens the database overlay on the quest named in the narration, via the quest link', async () => {
      stubQuestData([
        { id: '1', description: 'Első küldetés' },
        { id: '39', description: 'Második küldetés' },
      ]);
      const state = buildState({ narration: 'Aktuális küldetés: (39)' });
      const { container } = render(<Dungeon state={state} />);

      fireEvent.click(container.querySelector('.lc-quest-link')!);

      expect((await screen.findAllByText('Második küldetés')).length).toBeGreaterThan(0);
    });

    it('re-navigates via the StatBar shortcut after the narration link opened a different quest', async () => {
      // Regression guard for the shared questsSeq nonce: pressing the StatBar
      // shortcut after the link must still re-fire DatabaseApp's landing
      // effect (a stale nonce would leave the overlay wherever the link left
      // it) and must open with no `initialQuest`, per the brief.
      stubQuestData([
        { id: '1', description: 'Első küldetés' },
        { id: '39', description: 'Második küldetés' },
      ]);
      const state = buildState({ narration: 'Aktuális küldetés: (39)' });
      const { container } = render(<Dungeon state={state} />);

      fireEvent.click(container.querySelector('.lc-quest-link')!);
      expect((await screen.findAllByText('Második küldetés')).length).toBeGreaterThan(0);

      const otherTab = [...document.querySelectorAll('.lc-db .tab')]
        .find((t) => t.textContent === 'Szörnyek') as HTMLElement;
      fireEvent.click(otherTab);
      expect(document.querySelector('.lc-db .tab.active')?.textContent).toBe('Szörnyek');

      fireEvent.click(screen.getByLabelText('Küldetések'));
      expect(document.querySelector('.lc-db .tab.active')?.textContent).toBe('Küldetések');
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { Dungeon } from '../src/pages/Dungeon';
import type { DungeonState } from '../src/utils/domExtract';
import { setEnabledHotkeys } from '../src/utils/config';

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
});

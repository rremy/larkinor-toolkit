import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/preact';
import { Dungeon } from '../src/pages/Dungeon';
import type { DungeonState } from '../src/utils/domExtract';

function buildState(overrides: Partial<DungeonState> = {}): DungeonState {
  return {
    playerName: 'Remy',
    gold: 42,
    hp: 303, hpMax: 303, mp: 286, mpMax: 286,
    statusIcons: [],
    tiles: [{ imageUrl: 'https://x/talaj.gif', left: 0, top: 0, width: 150, height: 150, z: 3 }],
    directions: [{ dir: 'north', label: 'Észak', trigger: vi.fn() }],
    buildings: [],
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
});

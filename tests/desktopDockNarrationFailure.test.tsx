// Isolated in its own file because it mocks enhanceNarration for the whole
// module — mixing that with desktopDock.test.tsx's real-implementation tests
// would make those assert against a stub instead of the real behaviour.
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/preact';
import { buildMonsterDatabase, type Monster } from '../src/shared/data/monsters';
import type { FreeMoveState } from '../src/utils/domExtract';

vi.mock('../src/desktop/enhanceNarration', () => ({
  enhanceNarration: vi.fn(() => {
    throw new Error('narration enhancement blew up');
  }),
}));

const { DesktopDock } = await import('../src/desktop/DesktopDock');

function makeState(overrides: Partial<FreeMoveState> = {}): FreeMoveState {
  return {
    playerName: 'Remy',
    gold: 100,
    hp: 200,
    hpMax: 300,
    mp: 50,
    mpMax: 80,
    locationImageUrl: '',
    locationName: 'harcos-negyed',
    directions: [],
    buildings: [],
    attack: null,
    settingsButton: null,
    restButton: null,
    statusIcons: [],
    actions: [],
    narration: '',
    narrationLinks: [],
    ...overrides,
  };
}

function monster(name: string, id = 1): Monster {
  return {
    id,
    name,
    image: `/pic/szornyk/${id}_k.gif`,
    level: 3,
    hp: 40,
    mp: 0,
    attackType: 'Szúró/Vágó',
    debuff: '',
    magicWeapon: false,
    location: 'temető',
    drops: [],
  };
}

describe('DesktopDock — narration enhancement failure', () => {
  it('still renders the dock and warns with the [Larkinor UI] prefix when enhanceNarration throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = buildMonsterDatabase([monster('Sírrabló', 7)]);

    const { container } = render(
      <DesktopDock doc={document} state={makeState()} db={db} />
    );

    expect(container.querySelector('.lc-dock')).not.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[Larkinor UI]'),
      expect.anything()
    );

    warn.mockRestore();
  });
});

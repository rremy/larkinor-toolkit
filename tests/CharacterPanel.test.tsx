import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { DesktopDock } from '../src/desktop/DesktopDock';
import { CharacterPanel } from '../src/desktop/CharacterPanel';
import { CHARACTER_MINIMIZED_KEY, CHARACTER_OPEN_KEY, CHARACTER_TAB_KEY } from '../src/utils/config';
import type { CharacterPageState } from '../src/utils/characterPageExtract';

const state = (): CharacterPageState => ({
  name: 'Remy', level: 34, xp: 77718605, hp: [573, 573], mp: [416, 416], defense: 124, load: null, loadout: null,
  backpack: [{
    name: 'bot', index: 0, id: '4', slots: ['rightHand', 'leftHand'], bulkIndex: 0, marketPrice: null,
    type: 'fegyver', weight: 2, amount: 1, totalWeight: 2, price: 6, magical: false, attrs: [],
  }],
  equip: vi.fn(), drop: vi.fn(), dropMany: vi.fn(), stowWorn: null,
  attributes: [], freePoints: 0, saveAttributes: vi.fn(), stance: null, quickKey: null,
  curses: [], attackSpells: [], skills: [], otherSpells: [], emailPrivacy: null,
  exit: { label: 'Kilépés a karakterlapból', iconUrl: '', trigger: vi.fn() },
});

describe('CharacterPanel (desktop)', () => {
  beforeEach(() => {
    GM_setValue(CHARACTER_OPEN_KEY, '');
    GM_setValue(CHARACTER_MINIMIZED_KEY, '');
    GM_setValue(CHARACTER_TAB_KEY, '');
  });

  it('is offered from the dock on the character page only, and opens the view', () => {
    const { container, rerender } = render(<DesktopDock doc={document} state={null} db={null} characterState={state()} dbButtonOnly />);
    const button = container.querySelector<HTMLButtonElement>('.lc-dock-character')!;
    expect(button.textContent).toBe('Karakterlap');

    fireEvent.click(button);
    expect(GM_getValue(CHARACTER_OPEN_KEY, '')).toBeTruthy();
    expect(document.querySelector('.lc-char-slot')).not.toBeNull();

    rerender(<DesktopDock doc={document} state={null} db={null} dbButtonOnly />);
    expect(container.querySelector('.lc-dock-character')).toBeNull();
  });

  it('is titled by the character and leaves out the phone page\'s header', () => {
    render(<CharacterPanel open state={state()} onClose={() => {}} />);
    expect(document.body.textContent).toContain('Remy · 34. szint');
    // The panel has its own ✕, the dock its database button, the visible game page its exit.
    expect(document.querySelector('.lc-exit-btn')).toBeNull();
    expect(document.querySelector('.lc-db-btn')).toBeNull();
  });

  it('works like the phone page inside: equipping from the backpack tab', () => {
    GM_setValue(CHARACTER_TAB_KEY, 'backpack');
    const s = state();
    render(<CharacterPanel open state={s} onClose={() => {}} />);
    const jobb = [...document.querySelectorAll<HTMLButtonElement>('.lc-char-equip button')].find((b) => b.textContent === 'Jobb kéz')!;

    fireEvent.click(jobb);

    expect(s.equip).toHaveBeenCalledWith(s.backpack[0], 'rightHand');
  });
});

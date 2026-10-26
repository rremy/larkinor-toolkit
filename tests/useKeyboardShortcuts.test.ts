import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/preact';
import { h } from 'preact';
import { JSDOM } from 'jsdom';
import { useKeyboardShortcuts, isEditableTarget, shortcutDigit, type KeyboardShortcutOptions } from '../src/desktop/useKeyboardShortcuts';
import type { DirectionOption, Action } from '../src/utils/domExtract';

function dir(d: DirectionOption['dir']): DirectionOption {
  return { dir: d, label: d, trigger: vi.fn() };
}

function hotkey(actionKey: string): Action {
  return { label: actionKey, actionKey, trigger: vi.fn() };
}

/** Mounts a throwaway component so the hook's effect runs and cleans up. */
function mountHook(options: KeyboardShortcutOptions) {
  const Probe = () => {
    useKeyboardShortcuts(options);
    return null;
  };
  return render(h(Probe, {}));
}

function makeGameDoc(bodyHtml = ''): Document {
  return new JSDOM(`<html><body>${bodyHtml}</body></html>`).window.document;
}

function press(doc: Document, code: string, init: KeyboardEventInit = {}, target?: Element) {
  const view = doc.defaultView!;
  const event = new view.KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init });
  (target ?? doc.body).dispatchEvent(event);
  return event;
}

function baseOptions(doc: Document, overrides: Partial<KeyboardShortcutOptions> = {}): KeyboardShortcutOptions {
  return {
    doc,
    directions: [],
    attack: null,
    quickActions: [],
    modalOpen: false,
    onOpenDatabase: vi.fn(),
    onCloseModal: vi.fn(),
    ...overrides,
  };
}

describe('isEditableTarget', () => {
  it('recognises the form controls the game types into', () => {
    const doc = makeGameDoc('<input id="i"><textarea id="t"></textarea><select id="s"></select><div id="d"></div>');
    expect(isEditableTarget(doc.getElementById('i'))).toBe(true);
    expect(isEditableTarget(doc.getElementById('t'))).toBe(true);
    expect(isEditableTarget(doc.getElementById('s'))).toBe(true);
    expect(isEditableTarget(doc.getElementById('d'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('useKeyboardShortcuts', () => {
  it('maps arrow keys to the matching direction trigger', () => {
    const doc = makeGameDoc();
    const north = dir('north');
    const east = dir('east');
    mountHook(baseOptions(doc, { directions: [north, east] }));

    press(doc, 'ArrowUp');
    press(doc, 'ArrowRight');

    expect(north.trigger).toHaveBeenCalledTimes(1);
    expect(east.trigger).toHaveBeenCalledTimes(1);
  });

  it('maps WASD to the same directions', () => {
    const doc = makeGameDoc();
    const directions = [dir('north'), dir('south'), dir('east'), dir('west')];
    mountHook(baseOptions(doc, { directions }));

    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) press(doc, code);

    for (const d of directions) expect(d.trigger, d.dir).toHaveBeenCalledTimes(1);
  });

  // A walks west; only Space attacks.
  it('does not attack on A', () => {
    const doc = makeGameDoc();
    const attack = { label: 'Támadás!!!', iconUrl: '', trigger: vi.fn() };
    const west = dir('west');
    mountHook(baseOptions(doc, { attack, directions: [west] }));

    press(doc, 'KeyA');

    expect(attack.trigger).not.toHaveBeenCalled();
    expect(west.trigger).toHaveBeenCalledTimes(1);
  });

  it('ignores a direction key that is not available on this tile', () => {
    const doc = makeGameDoc();
    const north = dir('north');
    mountHook(baseOptions(doc, { directions: [north] }));

    const event = press(doc, 'ArrowDown');

    expect(north.trigger).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('fires the attack trigger on Space during an encounter', () => {
    const doc = makeGameDoc();
    const attack = { label: 'Támadás!!!', iconUrl: '', trigger: vi.fn() };
    mountHook(baseOptions(doc, { attack }));

    press(doc, 'Space');

    expect(attack.trigger).toHaveBeenCalledTimes(1);
  });

  it('runs the tenth quick action on 0', () => {
    const doc = makeGameDoc();
    const actions = Array.from({ length: 11 }, (_, i) => hotkey(`a${i}`));
    mountHook(baseOptions(doc, { quickActions: actions }));

    press(doc, 'Digit0');

    expect(actions[9].trigger).toHaveBeenCalledTimes(1);
    expect(actions.filter((a) => (a.trigger as ReturnType<typeof vi.fn>).mock.calls.length > 0)).toHaveLength(1);
  });

  it('maps digits to the nth hotkey in dock order', () => {
    const doc = makeGameDoc();
    const first = hotkey('kajal');
    const second = hotkey('imadkozas');
    mountHook(baseOptions(doc, { quickActions: [first, second] }));

    press(doc, 'Digit2');

    expect(second.trigger).toHaveBeenCalledTimes(1);
    expect(first.trigger).not.toHaveBeenCalled();
  });

  it('ignores a digit with no corresponding hotkey', () => {
    const doc = makeGameDoc();
    const only = hotkey('kajal');
    mountHook(baseOptions(doc, { quickActions: [only] }));

    press(doc, 'Digit5');

    expect(only.trigger).not.toHaveBeenCalled();
  });

  it('opens the database on Q', () => {
    const doc = makeGameDoc();
    const onOpenDatabase = vi.fn();
    mountHook(baseOptions(doc, { onOpenDatabase }));

    press(doc, 'KeyQ');

    expect(onOpenDatabase).toHaveBeenCalledTimes(1);
  });

  it('ignores every keystroke typed into a form control', () => {
    const doc = makeGameDoc('<input id="chat">');
    const north = dir('north');
    const onOpenDatabase = vi.fn();
    mountHook(baseOptions(doc, { directions: [north], onOpenDatabase }));

    const input = doc.getElementById('chat')!;
    press(doc, 'ArrowUp', {}, input);
    press(doc, 'KeyQ', {}, input);

    expect(north.trigger).not.toHaveBeenCalled();
    expect(onOpenDatabase).not.toHaveBeenCalled();
  });

  it('ignores keystrokes with a modifier held', () => {
    const doc = makeGameDoc();
    const north = dir('north');
    mountHook(baseOptions(doc, { directions: [north] }));

    press(doc, 'ArrowUp', { ctrlKey: true });
    press(doc, 'ArrowUp', { altKey: true });
    press(doc, 'ArrowUp', { metaKey: true });

    expect(north.trigger).not.toHaveBeenCalled();
  });

  it('suppresses every binding except Escape while a modal is open', () => {
    const doc = makeGameDoc();
    const north = dir('north');
    const onCloseModal = vi.fn();
    const onOpenDatabase = vi.fn();
    mountHook(baseOptions(doc, { directions: [north], modalOpen: true, onCloseModal, onOpenDatabase }));

    press(doc, 'ArrowUp');
    press(doc, 'KeyQ');
    press(doc, 'Escape');

    expect(north.trigger).not.toHaveBeenCalled();
    expect(onOpenDatabase).not.toHaveBeenCalled();
    expect(onCloseModal).toHaveBeenCalledTimes(1);
  });

  it('does nothing on Escape when no modal is open', () => {
    const doc = makeGameDoc();
    const onCloseModal = vi.fn();
    mountHook(baseOptions(doc, { onCloseModal }));

    press(doc, 'Escape');

    expect(onCloseModal).not.toHaveBeenCalled();
  });

  it('prevents the default only on consumed keys', () => {
    const doc = makeGameDoc();
    mountHook(baseOptions(doc, { directions: [dir('north')] }));

    expect(press(doc, 'ArrowUp').defaultPrevented).toBe(true);
    expect(press(doc, 'KeyZ').defaultPrevented).toBe(false);
  });

  it('ignores an auto-repeat keydown so holding a key does not repeat the action', () => {
    const doc = makeGameDoc();
    const north = dir('north');
    mountHook(baseOptions(doc, { directions: [north] }));

    const event = press(doc, 'ArrowUp', { repeat: true });

    expect(north.trigger).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('closes the modal on Escape even while the target is an input, and ignores other keys', () => {
    const doc = makeGameDoc('<input id="filter">');
    const north = dir('north');
    const onCloseModal = vi.fn();
    mountHook(baseOptions(doc, { directions: [north], modalOpen: true, onCloseModal }));

    const input = doc.getElementById('filter')!;
    press(doc, 'ArrowUp', {}, input);
    press(doc, 'Escape', {}, input);

    expect(north.trigger).not.toHaveBeenCalled();
    expect(onCloseModal).toHaveBeenCalledTimes(1);
  });

  it('ignores key events targeting a control inside the dock root', () => {
    const doc = makeGameDoc('<div id="lc-dock-root"><button id="toggle">collapse</button></div>');
    const attack = { label: 'Támadás!!!', iconUrl: '', trigger: vi.fn() };
    mountHook(baseOptions(doc, { attack }));

    const toggle = doc.getElementById('toggle')!;
    const event = press(doc, 'Space', {}, toggle);

    expect(attack.trigger).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('removes its listener on unmount', () => {
    const doc = makeGameDoc();
    const north = dir('north');
    const { unmount } = mountHook(baseOptions(doc, { directions: [north] }));

    unmount();
    press(doc, 'ArrowUp');

    expect(north.trigger).not.toHaveBeenCalled();
  });

  describe('in a fight', () => {
    const action = (label: string): Action => ({ label, trigger: vi.fn() });

    it('attacks with the left hand on ← and the right hand on →', () => {
      const doc = makeGameDoc();
      const fight = { leftHand: action('bal'), rightHand: action('jobb'), flee: null, proceed: null };
      mountHook(baseOptions(doc, { fight }));

      expect(press(doc, 'ArrowLeft').defaultPrevented).toBe(true);
      press(doc, 'ArrowRight');

      expect(fight.leftHand.trigger).toHaveBeenCalledTimes(1);
      expect(fight.rightHand.trigger).toHaveBeenCalledTimes(1);
    });

    it('attacks with the hands on A and D too', () => {
      const doc = makeGameDoc();
      const fight = { leftHand: action('bal'), rightHand: action('jobb'), flee: null, proceed: null };
      mountHook(baseOptions(doc, { fight }));

      press(doc, 'KeyA');
      press(doc, 'KeyD');

      expect(fight.leftHand.trigger).toHaveBeenCalledTimes(1);
      expect(fight.rightHand.trigger).toHaveBeenCalledTimes(1);
    });

    it('still walks west and east on the arrows off a battle page', () => {
      const doc = makeGameDoc();
      const west = dir('west');
      const east = dir('east');
      mountHook(baseOptions(doc, { directions: [west, east], fight: { leftHand: null, rightHand: null, flee: null, proceed: null } }));

      press(doc, 'ArrowLeft');
      press(doc, 'ArrowRight');

      expect(west.trigger).toHaveBeenCalledTimes(1);
      expect(east.trigger).toHaveBeenCalledTimes(1);
    });

    it('continues on Space once the fight is over, ahead of an attack', () => {
      const doc = makeGameDoc();
      const proceed = action('Folytatás');
      const attack = { label: 'Támadás!!!', iconUrl: '', trigger: vi.fn() };
      mountHook(baseOptions(doc, { attack, fight: { leftHand: null, rightHand: null, flee: null, proceed } }));

      expect(press(doc, 'Space').defaultPrevented).toBe(true);

      expect(proceed.trigger).toHaveBeenCalledTimes(1);
      expect(attack.trigger).not.toHaveBeenCalled();
    });

    it('flees on Esc', () => {
      const doc = makeGameDoc();
      const flee = action('menekül');
      mountHook(baseOptions(doc, { fight: { leftHand: null, rightHand: null, flee, proceed: null } }));

      expect(press(doc, 'Escape').defaultPrevented).toBe(true);

      expect(flee.trigger).toHaveBeenCalledTimes(1);
    });

    // A window open over the fight takes Esc first.
    it('closes an open modal on Esc instead of fleeing', () => {
      const doc = makeGameDoc();
      const flee = action('menekül');
      const onCloseModal = vi.fn();
      mountHook(baseOptions(doc, { modalOpen: true, onCloseModal, fight: { leftHand: null, rightHand: null, flee, proceed: null } }));

      press(doc, 'Escape');

      expect(onCloseModal).toHaveBeenCalledTimes(1);
      expect(flee.trigger).not.toHaveBeenCalled();
    });

    it('flees rather than exits when both are drawn', () => {
      const doc = makeGameDoc();
      const flee = action('menekül');
      const exit = action('vissza');
      mountHook(baseOptions(doc, { exit, fight: { leftHand: null, rightHand: null, flee, proceed: null } }));

      press(doc, 'Escape');

      expect(flee.trigger).toHaveBeenCalledTimes(1);
      expect(exit.trigger).not.toHaveBeenCalled();
    });

    it('lets typing in chat through', () => {
      const doc = makeGameDoc('<input id="chat">');
      const fight = { leftHand: action('bal'), rightHand: action('jobb'), flee: action('menekül'), proceed: action('Folytatás') };
      mountHook(baseOptions(doc, { fight }));
      const chat = doc.getElementById('chat')!;

      press(doc, 'ArrowLeft', {}, chat);
      press(doc, 'Space', {}, chat);
      press(doc, 'Escape', {}, chat);

      expect(fight.leftHand.trigger).not.toHaveBeenCalled();
      expect(fight.flee.trigger).not.toHaveBeenCalled();
      expect(fight.proceed.trigger).not.toHaveBeenCalled();
    });
  });

  describe('leaving a building', () => {
    it('presses the exit on Esc', () => {
      const doc = makeGameDoc();
      const exit = { label: 'Kilépés az épületből', trigger: vi.fn() };
      mountHook(baseOptions(doc, { exit }));

      expect(press(doc, 'Escape').defaultPrevented).toBe(true);

      expect(exit.trigger).toHaveBeenCalledTimes(1);
    });

    it('closes an open panel first', () => {
      const doc = makeGameDoc();
      const exit = { label: 'Kilépés az épületből', trigger: vi.fn() };
      const onCloseModal = vi.fn();
      mountHook(baseOptions(doc, { exit, modalOpen: true, onCloseModal }));

      press(doc, 'Escape');

      expect(onCloseModal).toHaveBeenCalledTimes(1);
      expect(exit.trigger).not.toHaveBeenCalled();
    });

    it('does nothing when shortcuts are off', () => {
      const doc = makeGameDoc();
      const exit = { label: 'Kilépés az épületből', trigger: vi.fn() };
      mountHook(baseOptions(doc, { exit, enabled: false }));

      press(doc, 'Escape');

      expect(exit.trigger).not.toHaveBeenCalled();
    });
  });

  describe('turned off', () => {
    it('binds nothing at all', () => {
      const doc = makeGameDoc();
      const north = dir('north');
      const onOpenDatabase = vi.fn();
      const left = { label: 'bal', trigger: vi.fn() };
      mountHook(baseOptions(doc, {
        enabled: false, directions: [north], onOpenDatabase,
        fight: { leftHand: left, rightHand: null, flee: null, proceed: null },
      }));

      for (const code of ['ArrowUp', 'ArrowLeft', 'KeyA', 'Space', 'Digit1', 'KeyQ']) {
        expect(press(doc, code).defaultPrevented, code).toBe(false);
      }
      expect(north.trigger).not.toHaveBeenCalled();
      expect(left.trigger).not.toHaveBeenCalled();
      expect(onOpenDatabase).not.toHaveBeenCalled();
    });

    // Escape is the dialogs' own close key, not a shortcut into the game.
    it('still closes a modal on Escape', () => {
      const doc = makeGameDoc();
      const onCloseModal = vi.fn();
      mountHook(baseOptions(doc, { enabled: false, modalOpen: true, onCloseModal }));

      press(doc, 'Escape');

      expect(onCloseModal).toHaveBeenCalledTimes(1);
    });
  });
});

describe('shortcutDigit', () => {
  it('numbers the quick actions 1–9, then 0, then nothing', () => {
    expect([0, 1, 8, 9, 10].map(shortcutDigit)).toEqual(['1', '2', '9', '0', null]);
  });
});

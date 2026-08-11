import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/preact';
import { h } from 'preact';
import { JSDOM } from 'jsdom';
import { useKeyboardShortcuts, isEditableTarget, type KeyboardShortcutOptions } from '../src/desktop/useKeyboardShortcuts';
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
    hotkeyActions: [],
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
    const west = dir('west');
    mountHook(baseOptions(doc, { directions: [west] }));

    press(doc, 'KeyA');

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

  it('maps digits to the nth hotkey in dock order', () => {
    const doc = makeGameDoc();
    const first = hotkey('kajal');
    const second = hotkey('imadkozas');
    mountHook(baseOptions(doc, { hotkeyActions: [first, second] }));

    press(doc, 'Digit2');

    expect(second.trigger).toHaveBeenCalledTimes(1);
    expect(first.trigger).not.toHaveBeenCalled();
  });

  it('ignores a digit with no corresponding hotkey', () => {
    const doc = makeGameDoc();
    const only = hotkey('kajal');
    mountHook(baseOptions(doc, { hotkeyActions: [only] }));

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
    press(doc, 'KeyW', {}, input);
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

  it('removes its listener on unmount', () => {
    const doc = makeGameDoc();
    const north = dir('north');
    const { unmount } = mountHook(baseOptions(doc, { directions: [north] }));

    unmount();
    press(doc, 'ArrowUp');

    expect(north.trigger).not.toHaveBeenCalled();
  });
});

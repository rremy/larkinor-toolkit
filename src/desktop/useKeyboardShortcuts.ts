// Desktop-only keyboard control. The game binds no document-level key handlers
// of its own, but it does have text inputs (chat), so the editable-target guard
// is what actually makes single-letter bindings safe: typing "wasd" into chat
// must never walk the character across the map. See handleKeyDown below for
// the full guard order (modifiers, auto-repeat, modal, dock, editable target)
// and why each one runs where it does.

import { useEffect } from 'preact/hooks';
import type { Action, BuildingOption, Direction, DirectionOption } from '@/utils/domExtract';

export interface KeyboardShortcutOptions {
  /** The live game document to listen on. */
  doc: Document;
  directions: DirectionOption[];
  attack: BuildingOption | null;
  /** Enabled hotkeys in the order the dock renders them; bound to 1-9. */
  hotkeyActions: Action[];
  /** True while any desktop modal is open — suppresses all but Escape. */
  modalOpen: boolean;
  onOpenDatabase: () => void;
  onCloseModal: () => void;
}

/**
 * Keyed by KeyboardEvent.code so the bindings are keyboard-layout independent
 * (code reports the physical key, unlike `key`).
 */
const DIRECTION_BY_CODE: Record<string, Direction> = {
  ArrowUp: 'north',
  KeyW: 'north',
  ArrowDown: 'south',
  KeyS: 'south',
  ArrowLeft: 'west',
  KeyA: 'west',
  ArrowRight: 'east',
  KeyD: 'east',
};

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** True for targets the user types into — those keep every keystroke. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target as Partial<Element>).tagName) return false;
  const el = target as HTMLElement;
  return EDITABLE_TAGS.has(el.tagName) || el.isContentEditable === true;
}

/** True for targets inside the dock's own DOM — its controls behave natively. */
function isInsideDockRoot(target: EventTarget | null): boolean {
  if (!target || typeof (target as Partial<Element>).closest !== 'function') return false;
  return (target as Element).closest('#lc-dock-root') !== null;
}

/** Index of the hotkey bound to a Digit1-Digit9 code, or -1. */
function digitIndex(code: string): number {
  const match = /^Digit([1-9])$/.exec(code);
  return match ? Number(match[1]) - 1 : -1;
}

/** Installs the document-level key bindings for the lifetime of the caller. */
export function useKeyboardShortcuts(options: KeyboardShortcutOptions): void {
  const { doc, directions, attack, hotkeyActions, modalOpen, onOpenDatabase, onCloseModal } = options;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Modifier combos are reserved for the browser/OS — never reinterpreted
      // as a game shortcut. This guard stays outermost.
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      // Auto-repeat delivers ~25-30 keydown events per second while a key is
      // held. Every consumed binding below submits a real game form action,
      // so letting repeats through would walk the character several tiles
      // (and can trigger an unwanted encounter) for as long as the key is down.
      if (event.repeat) return;

      // With a modal open, Escape is the only binding — it is also the single
      // way to close one, so this must run before the editable-target guard:
      // the database overlay's filter input is editable, and Escape must
      // still reach it from inside that input. Every other key is suppressed
      // underneath the modal regardless of target.
      if (modalOpen) {
        if (event.code === 'Escape') {
          event.preventDefault();
          onCloseModal();
        }
        return;
      }

      // The dock's own controls (collapse toggle, action buttons, ...) must
      // behave natively — e.g. Space activating a focused button — rather
      // than being reinterpreted as a game shortcut such as the attack key.
      if (isInsideDockRoot(event.target)) return;

      if (isEditableTarget(event.target)) return;

      const dir = DIRECTION_BY_CODE[event.code];
      if (dir) {
        const option = directions.find(d => d.dir === dir);
        if (!option) return; // direction not available on this tile
        event.preventDefault();
        option.trigger();
        return;
      }

      if (event.code === 'Space') {
        if (!attack) return;
        event.preventDefault();
        attack.trigger();
        return;
      }

      if (event.code === 'KeyQ') {
        event.preventDefault();
        onOpenDatabase();
        return;
      }

      const index = digitIndex(event.code);
      if (index >= 0) {
        const action = hotkeyActions[index];
        if (!action) return;
        event.preventDefault();
        action.trigger();
      }
    };

    doc.addEventListener('keydown', handleKeyDown);
    return () => doc.removeEventListener('keydown', handleKeyDown);
  }, [doc, directions, attack, hotkeyActions, modalOpen, onOpenDatabase, onCloseModal]);
}

// Desktop-only keyboard control. The game binds no document-level key handlers
// of its own, but it does have text inputs (chat), so the editable-target guard
// is what actually makes single-letter bindings safe: typing "wasd" into chat
// must never walk the character across the map.

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
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (isEditableTarget(event.target)) return;

      // With a modal open, Escape is the only binding — it is also the single
      // way to close one, so nothing else may act underneath it.
      if (modalOpen) {
        if (event.code === 'Escape') {
          event.preventDefault();
          onCloseModal();
        }
        return;
      }

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

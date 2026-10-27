// Desktop-only keyboard control. The game binds no document-level key handlers
// of its own, but it does have text inputs (chat), so the editable-target guard
// is what actually makes single-letter bindings safe: typing "wasd" into chat
// must never walk the character across the map. See handleKeyDown below for
// the full guard order (modifiers, auto-repeat, modal, setting, dock Space, editable target)
// and why each one runs where it does.

import { useEffect } from 'preact/hooks';
import type { Action, BuildingOption, Direction, DirectionOption, FightControls } from '@/utils/domExtract';

export interface KeyboardShortcutOptions {
  /** The live game document to listen on. */
  doc: Document;
  directions: DirectionOption[];
  attack: BuildingOption | null;
  /**
   * The dock's quick actions in the order it renders them — the icon row,
   * then the text buttons — bound to 1–9 and then 0 (see `shortcutDigit`).
   */
  quickActions: Action[];
  /**
   * The fight controls on this page: A/D and ←/→ attack with the left/right
   * hand, Esc flees, and Space continues once the fight is over. Absent: no
   * fight bindings.
   */
  fight?: FightControls | null;
  /**
   * The page's exit (`vissza.gif` — leaving a shop, the market, the home, a
   * crafting hall, the character sheet), pressed by Esc. Absent: none.
   */
  exit?: Action | null;
  /**
   * The player's on/off setting. Off leaves every key to the page, except
   * Escape closing a modal — that is the dialogs' own close key, not a
   * shortcut into the game.
   */
  enabled?: boolean;
  /** True while any desktop modal is open — suppresses all but Escape. */
  modalOpen: boolean;
  /**
   * Asked on every keystroke whether a full-size panel covers the game; while
   * one does, it counts as a modal. A function, not a flag: minimising a panel
   * does not re-render the dock. A panel docked beside the game says no.
   */
  panelOpen?: () => boolean;
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

/** The keys that attack with each weapon hand in a fight. */
const LEFT_HAND_CODES = new Set(['KeyA', 'ArrowLeft']);
const RIGHT_HAND_CODES = new Set(['KeyD', 'ArrowRight']);

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

/** The number keys in quick-action order: 1–9, then 0 for the tenth. */
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

/**
 * The key bound to the quick action at `index`, for its on-screen badge — or
 * null past the tenth, which no key reaches.
 */
export function shortcutDigit(index: number): string | null {
  return DIGITS[index] ?? null;
}

/** Index of the quick action bound to a Digit0-Digit9 code, or -1. */
function digitIndex(code: string): number {
  const match = /^Digit([0-9])$/.exec(code);
  return match ? DIGITS.indexOf(match[1]) : -1;
}

/** Installs the document-level key bindings for the lifetime of the caller. */
export function useKeyboardShortcuts(options: KeyboardShortcutOptions): void {
  const {
    doc, directions, attack, quickActions, fight = null, exit = null, enabled = true, modalOpen, panelOpen, onOpenDatabase, onCloseModal,
  } = options;

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
      if (modalOpen || panelOpen?.()) {
        if (event.code === 'Escape') {
          event.preventDefault();
          onCloseModal();
        }
        return;
      }

      if (!enabled) return;

      // A focused dock control (collapse toggle, action buttons, a docked
      // panel's tabs, ...) keeps Space, which presses it natively, rather than
      // having it reinterpreted as the attack key. Only Space: focus stays on
      // whatever was clicked last, so yielding every key here left the
      // shortcuts dead after any click in the dock until the page was clicked.
      if (event.code === 'Space' && isInsideDockRoot(event.target)) return;

      if (isEditableTarget(event.target)) return;

      // Esc flees a fight, or leaves the building — but only once no modal is
      // open (above, Esc closes the modal instead) and never from chat, where
      // it is the input's own.
      if (event.code === 'Escape') {
        const action = fight?.flee ?? exit;
        if (!action) return;
        event.preventDefault();
        action.trigger();
        return;
      }

      // A/D and the left/right arrows are west and east on the map, and the
      // two weapon hands in a fight. A battle page draws no direction buttons,
      // so the two never compete; the hands are checked first all the same.
      const hand = LEFT_HAND_CODES.has(event.code) ? fight?.leftHand
        : RIGHT_HAND_CODES.has(event.code) ? fight?.rightHand
          : null;
      if (hand) {
        event.preventDefault();
        hand.trigger();
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

      // Space engages a monster on the map, and continues past the end of a
      // fight. *Folytatás* wins when both are drawn: it is what the page is
      // waiting for.
      if (event.code === 'Space') {
        const action = fight?.proceed ?? attack;
        if (!action) return;
        event.preventDefault();
        action.trigger();
        return;
      }

      if (event.code === 'KeyQ') {
        event.preventDefault();
        onOpenDatabase();
        return;
      }

      const index = digitIndex(event.code);
      if (index >= 0) {
        const action = quickActions[index];
        if (!action) return;
        event.preventDefault();
        action.trigger();
      }
    };

    doc.addEventListener('keydown', handleKeyDown);
    return () => doc.removeEventListener('keydown', handleKeyDown);
  }, [doc, directions, attack, quickActions, fight, exit, enabled, modalOpen, panelOpen, onOpenDatabase, onCloseModal]);
}

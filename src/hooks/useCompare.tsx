import { h, type JSX } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { LoadoutContext } from '@/components/LoadoutContext';
import { CompareCard } from '@/components/CompareCard';
import { compareToLoadout, type CompareSubject } from '@/shared/compare';

/** Hover has to be deliberate, or the card flickers across a scanned table. */
export const HOVER_DELAY_MS = 150;
export const LONG_PRESS_MS = 500;
/** Movement past this many pixels means a scroll, not a press. */
const MOVE_CANCEL_PX = 10;
/**
 * A tap is followed by emulated mouse events. Ignore the hover path for this
 * long afterwards, or a plain tap opens the card on touch devices.
 */
const TOUCH_SUPPRESS_MS = 800;
/** Offset from the pointer, so the card never sits under the cursor. */
const CARD_OFFSET_PX = 12;

interface Point { x: number; y: number }

export interface CompareTriggerProps {
  onMouseEnter: (e: MouseEvent) => void;
  onMouseLeave: () => void;
  onTouchStart: (e: TouchEvent) => void;
  onTouchMove: (e: TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
  onContextMenu: (e: Event) => void;
}

/**
 * Wires one row to the compare card: hover on a mouse, long-press on touch.
 *
 * Mouse plus touch rather than pointer events on purpose — jsdom ships no
 * PointerEvent, so a pointer-based trigger could only be tested against a
 * fabricated event. Both gestures behave the same either way.
 *
 * Returns no card (and never opens one) when there is no loadout, no subject,
 * or nothing comparable — so rows stay untouched in the standalone site, which
 * never has a loadout.
 */
export function useCompare(subject: CompareSubject | null): { props: CompareTriggerProps; card: JSX.Element | null } {
  const loadout = useContext(LoadoutContext);
  const [at, setAt] = useState<Point | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressing = useRef(false);
  const pressFrom = useRef<Point | null>(null);
  const lastTouch = useRef(0);
  /** The element the trigger is bound to, so an outside tap can be told apart. */
  const hostRef = useRef<Node | null>(null);

  const columns = useMemo(
    () => (subject && loadout ? compareToLoadout(subject, loadout) : []),
    [subject, loadout],
  );
  const enabled = columns.length > 0;

  const clear = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pressing.current = false;
    pressFrom.current = null;
  }, []);

  const close = useCallback(() => { clear(); setAt(null); }, [clear]);

  // Once open on touch there is no pointer to leave, so it stays until
  // dismissed: a tap outside, or any scroll — which would otherwise leave the
  // card stranded beside the row it describes.
  useEffect(() => {
    if (at === null) return undefined;
    const onOutside = (e: Event): void => {
      if (!(e.target instanceof Node) || !hostRef.current?.contains(e.target)) close();
    };
    document.addEventListener('touchstart', onOutside, true);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('touchstart', onOutside, true);
      window.removeEventListener('scroll', close, true);
    };
  }, [at, close]);

  // Never leave a timer behind on unmount — the row can be filtered away
  // mid-hover.
  useEffect(() => clear, [clear]);

  const props: CompareTriggerProps = {
    onMouseEnter: (e) => {
      if (!enabled || Date.now() - lastTouch.current < TOUCH_SUPPRESS_MS) return;
      hostRef.current = e.currentTarget as Node;
      const p = { x: e.clientX + CARD_OFFSET_PX, y: e.clientY + CARD_OFFSET_PX };
      clear();
      timer.current = setTimeout(() => setAt(p), HOVER_DELAY_MS);
    },
    onMouseLeave: () => { if (enabled) close(); },
    onTouchStart: (e) => {
      lastTouch.current = Date.now();
      if (!enabled) return;
      hostRef.current = e.currentTarget as Node;
      const touch = e.touches[0];
      const p = {
        x: (touch?.clientX ?? 0) + CARD_OFFSET_PX,
        y: (touch?.clientY ?? 0) + CARD_OFFSET_PX,
      };
      clear();
      pressing.current = true;
      pressFrom.current = p;
      timer.current = setTimeout(() => { pressing.current = false; setAt(p); }, LONG_PRESS_MS);
    },
    onTouchMove: (e) => {
      const from = pressFrom.current;
      const touch = e.touches[0];
      if (!from || !touch) return;
      const dx = Math.abs(touch.clientX + CARD_OFFSET_PX - from.x);
      const dy = Math.abs(touch.clientY + CARD_OFFSET_PX - from.y);
      if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) close();
    },
    // A press released before the card opened is an ordinary tap: cancel it and
    // leave the row's own click handler to do its job. Once open, only an
    // outside tap or a scroll dismisses it.
    onTouchEnd: () => { if (timer.current !== null) close(); },
    onTouchCancel: close,
    // The long press must not also raise the browser's own menu.
    onContextMenu: (e) => { if (pressing.current) e.preventDefault(); },
  };

  return {
    props,
    card: at !== null && enabled && subject !== null
      ? <CompareCard name={subject.name} columns={columns} x={at.x} y={at.y} />
      : null,
  };
}

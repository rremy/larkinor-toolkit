// Chooses between the two UIs. Mobile replaces the whole page (proxy-DOM);
// desktop leaves the game page in place and only augments it. The decision is
// made once per page load in src/main.ts.

import { getPlatformOverride } from '@/utils/config';

export type Platform = 'mobile' | 'desktop';

/**
 * Viewport width below which we assume the phone/tablet UI, used only as a
 * fallback: desktop browsers in responsive-design mode report a fine pointer
 * even while emulating a phone, so width has to back up the media query.
 */
export const MOBILE_MAX_WIDTH = 900;

/**
 * Resolves the UI to render. A stored override always wins; otherwise a coarse
 * pointer (phone/tablet) or a narrow viewport selects the mobile UI.
 *
 * Reads the environment only through the `win` it is handed, so tests can pass
 * a stand-in with a fake `matchMedia` / `innerWidth`.
 */
export function detectPlatform(win: Window): Platform {
  const override = getPlatformOverride();
  if (override) return override;

  const coarsePointer = win.matchMedia('(pointer: coarse)').matches;
  if (coarsePointer || win.innerWidth < MOBILE_MAX_WIDTH) return 'mobile';
  return 'desktop';
}

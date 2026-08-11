// Persistent local UI config, stored via ViolentMonkey's GM storage (the same
// mechanism used for the remembered login name). Survives across page loads and
// the loader/eval boundary.

import type { Platform } from '@/utils/platform';

/** GM storage key holding the JSON array of enabled hotkey tevFajta values. */
export const ENABLED_HOTKEYS_KEY = 'lc-enabled-hotkeys';

/** The tevFajta values the user has enabled as free-move hotkey icons. */
export function getEnabledHotkeys(): string[] {
  const raw = GM_getValue(ENABLED_HOTKEYS_KEY, '[]');
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

export function setEnabledHotkeys(keys: string[]): void {
  GM_setValue(ENABLED_HOTKEYS_KEY, JSON.stringify(keys));
}

/** GM storage key holding the manual mobile/desktop override ('' = automatic). */
export const PLATFORM_OVERRIDE_KEY = 'lc-platform-override';

/** GM storage key holding the desktop dock's collapsed flag. */
export const DOCK_COLLAPSED_KEY = 'lc-dock-collapsed';

/**
 * The user's manual platform choice, or null for automatic detection. Values
 * other than the two known platforms are treated as "no override" so a stale or
 * hand-edited key degrades to auto-detection rather than a broken UI.
 */
export function getPlatformOverride(): Platform | null {
  const raw = GM_getValue(PLATFORM_OVERRIDE_KEY, '') as string;
  return raw === 'mobile' || raw === 'desktop' ? raw : null;
}

export function setPlatformOverride(value: Platform | null): void {
  GM_setValue(PLATFORM_OVERRIDE_KEY, value ?? '');
}

/** Whether the desktop dock is collapsed to its handle. */
export function getDockCollapsed(): boolean {
  return (GM_getValue(DOCK_COLLAPSED_KEY, '') as string) === 'true';
}

export function setDockCollapsed(value: boolean): void {
  GM_setValue(DOCK_COLLAPSED_KEY, value ? 'true' : '');
}

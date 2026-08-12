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

/** GM storage key holding the database panel's minimised flag. */
export const DB_MINIMIZED_KEY = 'lc-db-minimized';

/** GM storage key holding the inventory panel's minimised flag. */
export const INVENTORY_MINIMIZED_KEY = 'lc-inventory-minimized';

/** GM storage key holding whether the inventory panel is open. */
export const INVENTORY_OPEN_KEY = 'lc-inventory-open';

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

/**
 * Whether a docked panel opens minimised — beside the game rather than covering
 * the page. Remembered across page loads, so the choice survives every
 * navigation the game makes. Keyed per panel, so the database and the inventory
 * remember independently.
 */
export function getPanelMinimized(key: string): boolean {
  return (GM_getValue(key, '') as string) === 'true';
}

export function setPanelMinimized(key: string, value: boolean): void {
  GM_setValue(key, value ? 'true' : '');
}

/**
 * Whether a panel is open. Persisted because the game navigates on every action:
 * moving an item reloads the page, which would otherwise close the very panel
 * the move was made from and force it to be reopened each time.
 */
export function getPanelOpen(key: string): boolean {
  return (GM_getValue(key, '') as string) === 'true';
}

export function setPanelOpen(key: string, value: boolean): void {
  GM_setValue(key, value ? 'true' : '');
}

// Persistent local UI config, stored via ViolentMonkey's GM storage (the same
// mechanism used for the remembered login name). Survives across page loads and
// the loader/eval boundary.

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

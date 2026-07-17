import { useState } from 'preact/hooks';
import { getEnabledHotkeys, setEnabledHotkeys } from '@/utils/config';

export interface HotkeyConfig {
  /** Enabled hotkey tevFajta values. */
  enabled: string[];
  /** Whether the config drawer is open. */
  configOpen: boolean;
  openConfig: () => void;
  closeConfig: () => void;
  /** Toggle a hotkey on/off and persist. */
  toggleHotkey: (key: string) => void;
}

/**
 * Shared config state for the free-move and dungeon screens: the enabled hotkey
 * set (persisted via GM storage) and the config-drawer open flag.
 */
export function useHotkeyConfig(): HotkeyConfig {
  const [enabled, setEnabled] = useState<string[]>(() => getEnabledHotkeys());
  const [configOpen, setConfigOpen] = useState(false);

  const toggleHotkey = (key: string) => {
    const next = enabled.includes(key) ? enabled.filter(k => k !== key) : [...enabled, key];
    setEnabled(next);
    setEnabledHotkeys(next); // persist
  };

  return {
    enabled,
    configOpen,
    openConfig: () => setConfigOpen(true),
    closeConfig: () => setConfigOpen(false),
    toggleHotkey,
  };
}

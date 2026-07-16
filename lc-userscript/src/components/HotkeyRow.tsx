import { h, type JSX } from 'preact';
import type { Action } from '@/utils/domExtract';
import { getHotkey, hotkeyIconUrl } from '@/utils/hotkeys';

export interface HotkeyRowProps {
  /** Actions already partitioned as enabled hotkeys (see partitionHotkeys). */
  actions: Action[];
}

/** Icon row of enabled + available quick actions, shared by free-move/dungeon. */
export function HotkeyRow({ actions }: HotkeyRowProps): JSX.Element | null {
  if (actions.length === 0) return null;
  return (
    <div class="lc-hotkeys">
      {actions.map((action, i) => {
        const hk = getHotkey(action.actionKey!)!;
        return (
          <button key={`hk${i}`} class="lc-hotkey" title={hk.label} aria-label={hk.label} onClick={() => action.trigger()}>
            <img class="lc-hotkey-icon" src={hotkeyIconUrl(hk)} alt={hk.label} />
          </button>
        );
      })}
    </div>
  );
}

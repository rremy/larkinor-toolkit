import { h, type JSX } from 'preact';
import { HOTKEY_CATALOG, hotkeyIconUrl } from '@/utils/hotkeys';
import { backdropClass, type DrawerVariant } from '@/components/drawer';

export interface ConfigDrawerProps {
  /** tevFajta values currently enabled as hotkeys. */
  enabled: string[];
  /** Toggle a hotkey on/off by its tevFajta value. */
  onToggle: (key: string) => void;
  onClose: () => void;
  /** 'sheet' (mobile bottom drawer) or 'modal' (desktop centered dialog). */
  variant?: DrawerVariant;
}

/**
 * Local UI config, shown in the shared bottom-drawer. v1 has a single section:
 * the enabled free-move hotkeys. Toggling a row is expected to persist and to
 * update the free-move icon row immediately.
 */
export function ConfigDrawer({ enabled, onToggle, onClose, variant = 'sheet' }: ConfigDrawerProps): JSX.Element {
  const handleBackdropClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('lc-drawer-backdrop')) onClose();
  };

  return (
    <div class={backdropClass(variant)} onClick={handleBackdropClick}>
      <div class="lc-drawer" role="dialog" aria-label="Beállítások">
        <button class="lc-drawer-close" aria-label="bezár" onClick={onClose}>×</button>

        <h2 class="lc-config-title">Engedélyezett gyorsgombok</h2>
        <div class="lc-config-hotkeys">
          {HOTKEY_CATALOG.map(hk => {
            const on = enabled.includes(hk.key);
            return (
              <button
                key={hk.key}
                class={`lc-config-hotkey${on ? ' lc-config-hotkey--on' : ''}`}
                data-key={hk.key}
                aria-pressed={on}
                onClick={() => onToggle(hk.key)}
              >
                <img class="lc-config-hotkey-icon" src={hotkeyIconUrl(hk)} alt="" />
                <span class="lc-config-hotkey-label">{hk.label}</span>
                <span class="lc-config-hotkey-check">{on ? '✓' : ''}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

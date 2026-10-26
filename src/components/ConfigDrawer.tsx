import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import { HOTKEY_CATALOG, hotkeyIconUrl } from '@/utils/hotkeys';
import { backdropClass, type DrawerVariant } from '@/components/drawer';
import { getPlatformOverride, setPlatformOverride } from '@/utils/config';
import type { Platform } from '@/utils/platform';

export interface ConfigDrawerProps {
  /** tevFajta values currently enabled as hotkeys. */
  enabled: string[];
  /** Toggle a hotkey on/off by its tevFajta value. */
  onToggle: (key: string) => void;
  onClose: () => void;
  /**
   * The keyboard shortcuts' on/off setting. Desktop only — mobile binds no
   * keys — so the section is left out when this is absent.
   */
  shortcuts?: { on: boolean; onToggle: () => void };
  /** 'sheet' (mobile bottom drawer) or 'modal' (desktop centered dialog). */
  variant?: DrawerVariant;
}

/** 'auto' is the absence of an override; the other two force a UI. */
type PlatformChoice = 'auto' | Platform;

/** What each key does, for the shortcuts section. */
const SHORTCUT_HELP: { keys: string; does: string }[] = [
  { keys: 'W A S D / nyilak', does: 'Mozgás' },
  { keys: 'Szóköz', does: 'Támadás, ha szörny van a közelben' },
  { keys: '1–9, 0', does: 'Gyorsműveletek, sorrendben (a gombokon a szám)' },
  { keys: 'A / D vagy ← / → harcban', does: 'Támadás bal / jobb kézzel' },
  { keys: 'Esc harcban', does: 'Menekülés' },
  { keys: 'Szóköz a harc végén', does: 'Folytatás' },
  { keys: 'Q', does: 'Adatbázis' },
  { keys: 'Esc épületben', does: 'Kilépés (boltból, piacról, házból…)' },
  { keys: 'Esc', does: 'Nyitott ablak bezárása — ez mindig az első' },
]

const PLATFORM_CHOICES: { value: PlatformChoice; label: string }[] = [
  { value: 'auto', label: 'Automatikus' },
  { value: 'mobile', label: 'Mobil' },
  { value: 'desktop', label: 'Asztali' },
];

/**
 * Local UI config, shown in the shared bottom-drawer. v1 has a single section:
 * the enabled free-move hotkeys. Toggling a row is expected to persist and to
 * update the free-move icon row immediately.
 */
export function ConfigDrawer({ enabled, onToggle, onClose, shortcuts, variant = 'sheet' }: ConfigDrawerProps): JSX.Element {
  const [platform, setPlatform] = useState<PlatformChoice>(() => getPlatformOverride() ?? 'auto');

  const choosePlatform = (choice: PlatformChoice) => {
    setPlatform(choice);
    setPlatformOverride(choice === 'auto' ? null : choice);
  };

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

        {shortcuts && (
          <>
            <h2 class="lc-config-title">Billentyűparancsok</h2>
            <div class="lc-config-platform">
              {[true, false].map(value => (
                <button
                  key={String(value)}
                  class={`lc-config-platform-btn${shortcuts.on === value ? ' lc-config-platform-btn--on' : ''}`}
                  data-shortcuts={value ? 'on' : 'off'}
                  aria-pressed={shortcuts.on === value}
                  onClick={() => { if (shortcuts.on !== value) shortcuts.onToggle(); }}
                >
                  {value ? 'Bekapcsolva' : 'Kikapcsolva'}
                </button>
              ))}
            </div>
            <dl class={`lc-config-shortcuts${shortcuts.on ? '' : ' lc-config-shortcuts--off'}`}>
              {SHORTCUT_HELP.map(row => (
                <div key={row.keys} class="lc-config-shortcut">
                  <dt>{row.keys}</dt>
                  <dd>{row.does}</dd>
                </div>
              ))}
            </dl>
            <p class="lc-config-note">Szövegmezőben gépelve egyik sem működik.</p>
          </>
        )}

        <h2 class="lc-config-title">Felület</h2>
        <div class="lc-config-platform">
          {PLATFORM_CHOICES.map(choice => (
            <button
              key={choice.value}
              class={`lc-config-platform-btn${platform === choice.value ? ' lc-config-platform-btn--on' : ''}`}
              data-platform={choice.value}
              aria-pressed={platform === choice.value}
              onClick={() => choosePlatform(choice.value)}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <p class="lc-config-note">A váltás a következő oldalbetöltéskor lép érvénybe.</p>
      </div>
    </div>
  );
}

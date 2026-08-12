// Catalog of free-move quick actions ("hotkeys") the user can enable in the
// config. Keyed by the game's tevFajta option value; each maps to the shortcut
// icon the game serves at /2/ikon/<icon>.gif. Most icon names are the ASCII-
// folded action word, but a few are irregular (verified against the live
// server): burok -> sc_durex, ongyilok -> sc_ongyilkossag, kilep -> sc_kilep,
// and homeport -> sc_homport (the tevFajta value carries an extra "e" the icon
// name does not). Probe a candidate against the live host before adding it —
// a wrong name renders a broken image with no other symptom.

export interface Hotkey {
  /** The tevFajta <option> value on the free-move screen. */
  key: string;
  /** Short human label for the config list. */
  label: string;
  /** Icon basename under /2/ikon/ (without the sc_ path or .gif). */
  icon: string;
}

const ICON_BASE = 'https://l2.larkinor.hu/2/ikon';

export const HOTKEY_CATALOG: Hotkey[] = [
  { key: 'kajal', label: 'Kajálsz', icon: 'sc_kaja' },
  { key: 'imadkozas', label: 'Imádkozol', icon: 'sc_ima' },
  { key: 'manaital', label: 'Manaital', icon: 'sc_manaital' },
  { key: 'mobilidoxin', label: 'Mobilidoxin', icon: 'sc_mobilidoxin' },
  { key: 'vargyogy', label: 'Gyógyvarázs', icon: 'sc_gyogyvarazs' },
  { key: 'homeport', label: 'Hómport', icon: 'sc_homport' },
  { key: 'burok', label: 'Varázsburok', icon: 'sc_durex' },
  { key: 'as', label: 'Ásol', icon: 'sc_asas' },
  { key: 'ongyilok', label: 'Öngyilkosság', icon: 'sc_ongyilkossag' },
  { key: 'kilep', label: 'Kilépés', icon: 'sc_kilep' },
];

const BY_KEY: Record<string, Hotkey> = Object.fromEntries(
  HOTKEY_CATALOG.map(h => [h.key, h])
);

export function getHotkey(key: string): Hotkey | undefined {
  return BY_KEY[key];
}

export function hotkeyIconUrl(hotkey: Hotkey): string {
  return `${ICON_BASE}/${hotkey.icon}.gif`;
}

/**
 * Splits screen actions into those to render as hotkey icons (enabled by the
 * user and present in the catalog) and the rest (normal text buttons). Shared
 * by the free-move and dungeon screens.
 */
export function partitionHotkeys<T extends { actionKey?: string }>(
  actions: T[],
  enabled: string[]
): { hotkeyActions: T[]; buttonActions: T[] } {
  const isHotkey = (a: T) => !!a.actionKey && enabled.includes(a.actionKey) && !!getHotkey(a.actionKey);
  return {
    hotkeyActions: actions.filter(isHotkey),
    buttonActions: actions.filter(a => !isHotkey(a)),
  };
}

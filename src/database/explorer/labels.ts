import type { EntityTab } from './columns';

/** Singular entity-type label used in cross-reference lists. */
export const TYPE_LABEL: Record<'weapons' | 'armors' | 'items', string> = {
  weapons: 'fegyver',
  armors: 'vért',
  items: 'tárgy',
};

/** Tab bar display names. */
export const TAB_LABEL: Record<EntityTab, string> = {
  weapons: 'Fegyverek',
  armors: 'Vértek',
  items: 'Tárgyak',
  monsters: 'Szörnyek',
};

/** Ordered [key, label] pairs rendered in the detail panel's stat list. */
export const DETAIL_FIELDS: Record<EntityTab, [string, string][]> = {
  weapons: [
    ['level', 'Szint'], ['type', 'Típus'], ['maxDamage', 'Max sebzés'],
    ['spread', 'Szórás'], ['avgDamage', 'Átlagsebzés'], ['magical', 'Mágikus'],
    ['vampiric', 'Vámpirizál'], ['weight', 'Súly (kg)'], ['price', 'Ár (ezüst)'], ['marketPrice', 'Piaci ár (ezüst)'],
    ['craftableAt', 'Készíthető'], ['special', 'Speciális'],
  ],
  armors: [
    ['level', 'Szint'], ['type', 'Típus'], ['defense', 'Védelem'],
    ['magical', 'Mágikus'], ['weight', 'Súly (kg)'], ['price', 'Ár (ezüst)'], ['marketPrice', 'Piaci ár (ezüst)'],
    ['craftableAt', 'Készíthető'], ['special', 'Speciális'],
  ],
  items: [
    ['minLevel', 'Min. szint'], ['defense', 'Védelem'], ['magical', 'Mágikus'],
    ['weight', 'Súly (kg)'], ['price', 'Ár (ezüst)'], ['marketPrice', 'Piaci ár (ezüst)'], ['craftableAt', 'Készíthető'],
    ['special', 'Speciális'],
  ],
  monsters: [
    ['level', 'Szint'], ['hp', 'ÉP'], ['mp', 'TP'], ['attackType', 'Szenszgömb'],
    ['debuff', 'Rontás'], ['magicWeapon', 'Mágikus fegyver'], ['location', 'Előfordulás'],
  ],
};

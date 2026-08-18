// The player's worn equipment, and the vocabulary for talking about slots.
//
// Deliberately free of DOM, GM_* and `src/utils/**` imports: this module is
// imported by `src/database/**` (which must stay GM-free — see the header of
// prefKeys.ts) as well as by the userscript's extractor. That is also why the
// parsed-detail input is described by the structural `DetailLike` below rather
// than importing `ParsedDetail` from @/utils/homeExtract, which would drag the
// DOM extractors into the standalone database bundle.
//
// See docs/superpowers/specs/2026-08-18-equipment-compare-design.md.

import { foldAccents } from '@/shared/text';

export type Slot = 'leftHand' | 'rightHand' | 'body' | 'head' | 'legs';

/** Hungarian slot names, exactly as the character page prints them. */
export const SLOT_LABEL: Record<Slot, string> = {
  leftHand: 'Bal kéz',
  rightHand: 'Jobb kéz',
  body: 'Test',
  head: 'Fej',
  legs: 'Láb',
};

export const SLOT_ORDER: Slot[] = ['leftHand', 'rightHand', 'body', 'head', 'legs'];

/** The two slots that can hold a weapon or a shield. */
export const HAND_SLOTS: readonly Slot[] = ['leftHand', 'rightHand'];

/** Reverse of SLOT_LABEL, for reading the page's own labels. */
export const LABEL_TO_SLOT: Record<string, Slot> = Object.fromEntries(
  SLOT_ORDER.map((slot) => [SLOT_LABEL[slot], slot]),
) as Record<string, Slot>;

export type ItemKind = 'fegyver' | 'vért';

export interface EquippedItem {
  name: string;
  kind: ItemKind;
  /** `Min. szint` — null for items that print none (shields). */
  level: number | null;
  maxDamage: number | null;
  spread: number | null;
  defense: number | null;
  magical: boolean;
  vampiric: boolean;
}

export interface Loadout {
  version: 1;
  playerLevel: number | null;
  /**
   * Diagnostics only. Equipment can only be changed on the character page, so
   * a capture written on every visit to it is current by construction — the UI
   * needs no staleness caveat.
   */
  capturedAt: number;
  slots: Record<Slot, EquippedItem | null>;
}

/** PrefStore key holding the serialised Loadout. */
export { LOADOUT_PREF_KEY } from '@/shared/prefKeys';

export function emptySlots(): Record<Slot, EquippedItem | null> {
  return { leftHand: null, rightHand: null, body: null, head: null, legs: null };
}

/**
 * Average damage. Derived rather than stored: verified to equal
 * `maxDamage - spread / 2` for all 1220 weapons carrying both fields, so one
 * rule covers the equipped side (which never prints it) and the database side.
 */
export function avgDamageOf(maxDamage: number | null, spread: number | null): number | null {
  if (maxDamage === null || spread === null) return null;
  return maxDamage - spread / 2;
}

export type ArmorTarget = { kind: 'slot'; slot: Slot } | { kind: 'hand' };

/**
 * Which slot a piece of armour belongs in, from either vocabulary: the
 * database's `type` (`Páncél`, `Sisak`, `Csizma`, `Pajzs`) or the character
 * page's `Fajta` (`testre`, `fejre`, `lábra`, `kézbe`). Shields resolve to
 * `hand` because they occupy a hand slot alongside weapons.
 *
 * Accent-folded and lower-cased so an encoding slip in either source still
 * resolves. An unrecognised value returns null — the caller then renders no
 * comparison rather than guessing a slot (see the design doc's Risks).
 */
const ARMOR_TARGETS: Record<string, ArmorTarget> = {
  pancel: { kind: 'slot', slot: 'body' },
  testre: { kind: 'slot', slot: 'body' },
  sisak: { kind: 'slot', slot: 'head' },
  fejre: { kind: 'slot', slot: 'head' },
  csizma: { kind: 'slot', slot: 'legs' },
  labra: { kind: 'slot', slot: 'legs' },
  pajzs: { kind: 'hand' },
  kezbe: { kind: 'hand' },
};

export function armorTarget(raw: string | null): ArmorTarget | null {
  if (!raw) return null;
  return ARMOR_TARGETS[foldAccents(raw.trim().toLowerCase())] ?? null;
}

/**
 * The shape of a `parseCuccDetail` result this module needs — structural so
 * that `ParsedDetail` (from the DOM-bound @/utils/homeExtract) satisfies it
 * without this module importing it.
 */
export interface DetailLike {
  type: string;
  magical: boolean;
  attrs: Array<[string, string]>;
}

export function attrOf(d: DetailLike, label: string): string | null {
  return d.attrs.find(([k]) => k === label)?.[1] ?? null;
}

/** First integer in a value like `"7560 ezüst"` or `"21"`, else null. */
function intOf(raw: string | null): number | null {
  if (raw === null) return null;
  const m = raw.match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/**
 * Maps a parsed stat block to an EquippedItem. Returns null for anything that
 * is not a weapon or armour (`Típus: tárgy`), which has nothing to compare.
 */
export function equippedFromDetail(d: DetailLike): EquippedItem | null {
  if (d.type !== 'fegyver' && d.type !== 'vért') return null;
  const extra = foldAccents((attrOf(d, 'Extra') ?? '').toLowerCase());
  return {
    name: attrOf(d, 'Név') ?? '?',
    kind: d.type,
    level: intOf(attrOf(d, 'Min. szint')),
    maxDamage: intOf(attrOf(d, 'Maximum sebzés')),
    spread: intOf(attrOf(d, 'Sebzés szórás')),
    defense: intOf(attrOf(d, 'Védelem')),
    magical: d.magical,
    vampiric: extra.includes('vampiriz'),
  };
}

export function serializeLoadout(l: Loadout): string {
  return JSON.stringify(l);
}

/**
 * Parses a stored loadout, or null for anything unusable — absent, unparseable,
 * or written by a different version of this shape. Failing to null means a
 * shape change degrades to "no compare" instead of a misread comparison.
 */
export function parseLoadout(raw: string | null): Loadout | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Loadout>;
    if (parsed?.version !== 1 || typeof parsed.slots !== 'object' || parsed.slots === null) return null;
    return {
      version: 1,
      playerLevel: typeof parsed.playerLevel === 'number' ? parsed.playerLevel : null,
      capturedAt: typeof parsed.capturedAt === 'number' ? parsed.capturedAt : 0,
      slots: { ...emptySlots(), ...parsed.slots },
    };
  } catch {
    return null;
  }
}

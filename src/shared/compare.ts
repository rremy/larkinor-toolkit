// Comparing a candidate weapon or armour against what the player is wearing.
//
// Pure: no DOM, no Preact, no GM_*. Candidates reach it in two shapes — a
// database Weapon/Armor in the explorer, a parsed stat block in the Home and
// Market panels — so three adapters normalise both into one CompareSubject and
// the rules below are written once.
//
// See docs/superpowers/specs/2026-08-18-equipment-compare-design.md.

import type { Armor, Weapon } from '@/shared/data';
import {
  armorTarget, attrOf, avgDamageOf, equippedFromDetail, HAND_SLOTS, SLOT_LABEL, SLOT_ORDER,
  type DetailLike, type EquippedItem, type Loadout, type Slot,
} from '@/shared/loadout';

export type CompareValue = number | boolean | null;

/** `blocked` is the candidate's level exceeding the player's — unwearable. */
export type Direction = 'better' | 'worse' | 'same' | 'blocked';

export interface CompareRow {
  label: string;
  current: CompareValue;
  candidate: CompareValue;
  /** Signed, localised difference; null for booleans and for no change. */
  delta: string | null;
  direction: Direction;
}

export interface CompareColumn {
  slot: Slot;
  slotLabel: string;
  currentName: string;
  rows: CompareRow[];
}

/** A candidate item, plus the raw type string its slot is resolved from. */
export interface CompareSubject extends EquippedItem {
  /** Database `type` or the page's `Fajta`; null for weapons. */
  armorType: string | null;
}

export function fromWeapon(w: Weapon): CompareSubject {
  return {
    name: w.name, kind: 'fegyver', level: w.level, maxDamage: w.maxDamage,
    spread: w.spread, defense: null, magical: w.magical, vampiric: w.vampiric,
    armorType: null,
  };
}

export function fromArmor(a: Armor): CompareSubject {
  return {
    name: a.name, kind: 'vért', level: a.level, maxDamage: null, spread: null,
    defense: a.defense, magical: a.magical, vampiric: false, armorType: a.type,
  };
}

export function fromDetail(d: DetailLike): CompareSubject | null {
  const item = equippedFromDetail(d);
  if (!item) return null;
  return { ...item, armorType: attrOf(d, 'Fajta') };
}

export function formatDelta(n: number): string {
  return `${n > 0 ? '+' : '-'}${Math.abs(n).toLocaleString('hu')}`;
}

interface NumericField {
  label: string;
  of: (item: EquippedItem) => number | null;
  betterWhen: 'higher' | 'lower';
}

const WEAPON_FIELDS: NumericField[] = [
  { label: 'Max sebzés', of: (i) => i.maxDamage, betterWhen: 'higher' },
  { label: 'Átlag seb.', of: (i) => avgDamageOf(i.maxDamage, i.spread), betterWhen: 'higher' },
  // Damage is max minus up to the spread, so a tighter spread is strictly more
  // damage — see avgDamageOf.
  { label: 'Szórás', of: (i) => i.spread, betterWhen: 'lower' },
];

const ARMOR_FIELDS: NumericField[] = [
  { label: 'Védelem', of: (i) => i.defense, betterWhen: 'higher' },
];

/** One numeric row, or null when either side does not carry the field. */
function numericRow(field: NumericField, current: EquippedItem, candidate: CompareSubject): CompareRow | null {
  const a = field.of(current);
  const b = field.of(candidate);
  if (a === null || b === null) return null;
  const diff = b - a;
  const better = field.betterWhen === 'higher' ? diff > 0 : diff < 0;
  return {
    label: field.label,
    current: a,
    candidate: b,
    delta: diff === 0 ? null : formatDelta(diff),
    direction: diff === 0 ? 'same' : better ? 'better' : 'worse',
  };
}

function boolRow(label: string, a: boolean, b: boolean): CompareRow {
  return { label, current: a, candidate: b, delta: null, direction: a === b ? 'same' : b ? 'better' : 'worse' };
}

/**
 * The level row. A higher requirement is never an upgrade, so this is neutral
 * however it differs — except when the candidate is above the player's level,
 * where it is `blocked`: an item that cannot be worn is not a better item.
 */
function levelRow(current: EquippedItem, candidate: CompareSubject, playerLevel: number | null): CompareRow | null {
  if (current.level === null || candidate.level === null) return null;
  const diff = candidate.level - current.level;
  const blocked = playerLevel !== null && candidate.level > playerLevel;
  return {
    label: 'Szint',
    current: current.level,
    candidate: candidate.level,
    delta: diff === 0 ? null : formatDelta(diff),
    direction: blocked ? 'blocked' : 'same',
  };
}

function column(slot: Slot, current: EquippedItem, candidate: CompareSubject, playerLevel: number | null): CompareColumn {
  const fields = candidate.kind === 'fegyver' ? WEAPON_FIELDS : ARMOR_FIELDS;
  const rows: CompareRow[] = [];

  const level = levelRow(current, candidate, playerLevel);
  if (level) rows.push(level);
  for (const field of fields) {
    const row = numericRow(field, current, candidate);
    if (row) rows.push(row);
  }
  rows.push(boolRow('Mágikus', current.magical, candidate.magical));
  if (candidate.kind === 'fegyver') rows.push(boolRow('Vámpirizál', current.vampiric, candidate.vampiric));

  return { slot, slotLabel: SLOT_LABEL[slot], currentName: current.name, rows };
}

const isShield = (item: EquippedItem): boolean => item.kind === 'vért' && item.defense !== null;

/**
 * Which equipped slots a candidate should be compared against:
 * - a weapon: every hand holding a weapon (both, when both do);
 * - body/head/leg armour: that one slot;
 * - a shield: only a hand that already holds a shield — `Védelem` against
 *   `Maximum sebzés` is not a comparison;
 * - anything whose type does not resolve: none at all.
 */
function targetSlots(subject: CompareSubject, loadout: Loadout): Slot[] {
  const at = (slot: Slot): EquippedItem | null => loadout.slots[slot];

  if (subject.kind === 'fegyver') {
    return HAND_SLOTS.filter((slot) => at(slot)?.kind === 'fegyver');
  }

  const target = armorTarget(subject.armorType);
  if (!target) return [];
  if (target.kind === 'hand') {
    return HAND_SLOTS.filter((slot) => {
      const item = at(slot);
      return item !== null && isShield(item);
    });
  }
  return at(target.slot) ? [target.slot] : [];
}

export function compareToLoadout(subject: CompareSubject, loadout: Loadout): CompareColumn[] {
  const slots = targetSlots(subject, loadout);
  return SLOT_ORDER
    .filter((slot) => slots.includes(slot))
    .map((slot) => column(slot, loadout.slots[slot]!, subject, loadout.playerLevel));
}

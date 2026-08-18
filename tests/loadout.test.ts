import { describe, expect, it } from 'vitest';
import {
  armorTarget, attrOf, avgDamageOf, emptySlots, equippedFromDetail,
  parseLoadout, serializeLoadout, type Loadout,
} from '../src/shared/loadout';

const detail = (attrs: Array<[string, string]>, type = 'vért', magical = false) => ({ type, magical, attrs });

describe('armorTarget', () => {
  it('maps database types to slots', () => {
    expect(armorTarget('Páncél')).toEqual({ kind: 'slot', slot: 'body' });
    expect(armorTarget('Sisak')).toEqual({ kind: 'slot', slot: 'head' });
    expect(armorTarget('Csizma')).toEqual({ kind: 'slot', slot: 'legs' });
  });

  it("maps the page's Fajta values to the same slots", () => {
    expect(armorTarget('testre')).toEqual({ kind: 'slot', slot: 'body' });
    expect(armorTarget('fejre')).toEqual({ kind: 'slot', slot: 'head' });
    expect(armorTarget('lábra')).toEqual({ kind: 'slot', slot: 'legs' });
  });

  it('maps shields to a hand, from either vocabulary', () => {
    expect(armorTarget('Pajzs')).toEqual({ kind: 'hand' });
    expect(armorTarget('kézbe')).toEqual({ kind: 'hand' });
  });

  it('is accent- and case-insensitive, and rejects the unknown', () => {
    expect(armorTarget('PANCEL')).toEqual({ kind: 'slot', slot: 'body' });
    expect(armorTarget('nyakba')).toBeNull();
    expect(armorTarget(null)).toBeNull();
  });
});

describe('avgDamageOf', () => {
  it('derives average damage as max minus half the spread', () => {
    expect(avgDamageOf(133, 7)).toBe(129.5);
    expect(avgDamageOf(131, 2)).toBe(130);
  });

  it('is null when either input is missing', () => {
    expect(avgDamageOf(133, null)).toBeNull();
    expect(avgDamageOf(null, 7)).toBeNull();
  });
});

describe('equippedFromDetail', () => {
  it("reads a weapon's stats out of the parsed attribute pairs", () => {
    const item = equippedFromDetail(detail([
      ['Típus', 'fegyver'], ['Név', 'Kaltenekker íj'], ['Súly', '2.6 kg.'],
      ['Ár', '7560 ezüst'], ['Extra', 'vámpirizál'], ['Min. szint', '21'],
      ['Maximum sebzés', '133'], ['Sebzés szórás', '7'], ['Fajta', 'távolsági'],
    ], 'fegyver', true));
    expect(item).toEqual({
      name: 'Kaltenekker íj', kind: 'fegyver', type: 'távolsági', level: 21,
      maxDamage: 133, spread: 7, defense: null, magical: true, vampiric: true,
    });
  });

  it("reads an armour's defence", () => {
    expect(equippedFromDetail(detail([['Név', 'ent sisak'], ['Min. szint', '20'], ['Védelem', '16'], ['Fajta', 'fejre']])))
      .toEqual({ name: 'ent sisak', kind: 'vért', type: 'fejre', level: 20, maxDamage: null, spread: null, defense: 16, magical: false, vampiric: false });
  });

  it('leaves level null for a shield, which prints no Min. szint', () => {
    const shield = equippedFromDetail(detail([['Név', 'bőrpajzs'], ['Védelem', '1'], ['Fajta', 'kézbe']]));
    expect(shield?.level).toBeNull();
    expect(shield?.defense).toBe(1);
  });

  it('rejects a plain item', () => {
    expect(equippedFromDetail(detail([['Név', 'ásó']], 'tárgy'))).toBeNull();
  });

  it('reads a labelled attribute, or null when absent', () => {
    const d = detail([['Védelem', '16']]);
    expect(attrOf(d, 'Védelem')).toBe('16');
    expect(attrOf(d, 'Extra')).toBeNull();
  });
});

describe('serializeLoadout / parseLoadout', () => {
  const loadout: Loadout = {
    version: 2,
    playerLevel: 23,
    capturedAt: 1_700_000_000_000,
    slots: {
      ...emptySlots(),
      body: { name: 'Zamárdi felsője', kind: 'vért', type: 'testre', level: 19, maxDamage: null, spread: null, defense: 21, magical: false, vampiric: false },
    },
  };

  it('round-trips', () => {
    expect(parseLoadout(serializeLoadout(loadout))).toEqual(loadout);
  });

  it('treats junk, an absent value and a foreign version as no loadout', () => {
    expect(parseLoadout(null)).toBeNull();
    expect(parseLoadout('')).toBeNull();
    expect(parseLoadout('{ not json')).toBeNull();
    expect(parseLoadout(JSON.stringify({ ...loadout, version: 3 }))).toBeNull();
    // A version-1 loadout predates EquippedItem.type and is discarded, not read.
    expect(parseLoadout(JSON.stringify({ ...loadout, version: 1 }))).toBeNull();
    expect(parseLoadout(JSON.stringify({ version: 2 }))).toBeNull();
  });

  it('starts every slot empty', () => {
    expect(emptySlots()).toEqual({ leftHand: null, rightHand: null, body: null, head: null, legs: null });
  });
});

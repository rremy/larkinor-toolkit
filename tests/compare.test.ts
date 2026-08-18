import { describe, expect, it } from 'vitest';
import { compareToLoadout, formatDelta, fromArmor, fromDetail, fromWeapon, type CompareSubject } from '../src/shared/compare';
import { emptySlots, type EquippedItem, type Loadout } from '../src/shared/loadout';

const weapon = (over: Partial<EquippedItem> = {}): EquippedItem => ({
  name: 'kard', kind: 'fegyver', level: 20, maxDamage: 100, spread: 10,
  defense: null, magical: false, vampiric: false, ...over,
});
const armor = (over: Partial<EquippedItem> = {}): EquippedItem => ({
  name: 'vért', kind: 'vért', level: 20, maxDamage: null, spread: null,
  defense: 10, magical: false, vampiric: false, ...over,
});
const subject = (item: EquippedItem, armorType: string | null = null): CompareSubject => ({ ...item, armorType });

const loadoutWith = (slots: Partial<Loadout['slots']>, playerLevel: number | null = 30): Loadout => ({
  version: 1, playerLevel, capturedAt: 1, slots: { ...emptySlots(), ...slots },
});

const rowsOf = (cols: ReturnType<typeof compareToLoadout>, label: string) =>
  cols.map((c) => c.rows.find((r) => r.label === label));

describe('compareToLoadout — weapons', () => {
  const loadout = loadoutWith({
    leftHand: weapon({ name: 'balos', maxDamage: 90, spread: 4 }),
    rightHand: weapon({ name: 'jobbos', maxDamage: 110, spread: 20 }),
  });

  it('returns one column per hand holding a weapon, in slot order', () => {
    const cols = compareToLoadout(subject(weapon()), loadout);
    expect(cols.map((c) => [c.slot, c.slotLabel, c.currentName]))
      .toEqual([['leftHand', 'Bal kéz', 'balos'], ['rightHand', 'Jobb kéz', 'jobbos']]);
  });

  it('scores max damage in both directions', () => {
    const [left, right] = rowsOf(compareToLoadout(subject(weapon({ maxDamage: 100 })), loadout), 'Max sebzés');
    expect(left).toMatchObject({ current: 90, candidate: 100, delta: '+10', direction: 'better' });
    expect(right).toMatchObject({ current: 110, candidate: 100, delta: '-10', direction: 'worse' });
  });

  it('treats a lower spread as better', () => {
    const [left, right] = rowsOf(compareToLoadout(subject(weapon({ spread: 10 })), loadout), 'Szórás');
    expect(left).toMatchObject({ current: 4, candidate: 10, direction: 'worse' });
    expect(right).toMatchObject({ current: 20, candidate: 10, direction: 'better' });
  });

  it('derives average damage from max and spread', () => {
    const [left] = rowsOf(compareToLoadout(subject(weapon({ maxDamage: 133, spread: 7 })), loadout), 'Átlag seb.');
    expect(left).toMatchObject({ current: 88, candidate: 129.5, direction: 'better' });
  });

  it('scores gaining a boolean as better and losing it as worse', () => {
    const gained = rowsOf(compareToLoadout(subject(weapon({ vampiric: true })), loadout), 'Vámpirizál');
    expect(gained[0]).toMatchObject({ current: false, candidate: true, direction: 'better', delta: null });

    const lost = compareToLoadout(subject(weapon()), loadoutWith({ leftHand: weapon({ magical: true }) }));
    expect(lost[0].rows.find((r) => r.label === 'Mágikus')).toMatchObject({ direction: 'worse' });
  });

  it('never calls a level difference better, but blocks what you cannot wear', () => {
    const wearable = rowsOf(compareToLoadout(subject(weapon({ level: 25 })), loadout), 'Szint');
    expect(wearable[0]).toMatchObject({ candidate: 25, delta: '+5', direction: 'same' });

    const tooHigh = rowsOf(compareToLoadout(subject(weapon({ level: 40 })), loadout), 'Szint');
    expect(tooHigh[0]).toMatchObject({ direction: 'blocked' });
  });

  it('has nothing to say when both hands are empty', () => {
    expect(compareToLoadout(subject(weapon()), loadoutWith({}))).toEqual([]);
  });

  it('ignores a hand holding a shield', () => {
    const cols = compareToLoadout(subject(weapon()), loadoutWith({ leftHand: armor(), rightHand: weapon() }));
    expect(cols.map((c) => c.slot)).toEqual(['rightHand']);
  });
});

describe('compareToLoadout — armour', () => {
  it('compares against the one slot the type maps to', () => {
    const loadout = loadoutWith({ head: armor({ name: 'sisak', defense: 16 }), body: armor({ name: 'páncél', defense: 21 }) });
    const cols = compareToLoadout(subject(armor({ defense: 20 }), 'Sisak'), loadout);
    expect(cols).toHaveLength(1);
    expect(cols[0]).toMatchObject({ slot: 'head', currentName: 'sisak' });
    expect(cols[0].rows.find((r) => r.label === 'Védelem')).toMatchObject({ current: 16, candidate: 20, direction: 'better' });
  });

  it('compares a shield only against a hand that holds one', () => {
    const loadout = loadoutWith({ leftHand: armor({ name: 'bőrpajzs', defense: 1 }), rightHand: weapon() });
    const cols = compareToLoadout(subject(armor({ defense: 5 }), 'Pajzs'), loadout);
    expect(cols.map((c) => c.slot)).toEqual(['leftHand']);
    expect(cols[0].rows.find((r) => r.label === 'Védelem')).toMatchObject({ direction: 'better' });
  });

  it('says nothing rather than diffing a shield against a sword', () => {
    expect(compareToLoadout(subject(armor(), 'Pajzs'), loadoutWith({ leftHand: weapon(), rightHand: weapon() }))).toEqual([]);
  });

  it('says nothing for an unrecognised type', () => {
    expect(compareToLoadout(subject(armor(), 'Nyaklánc'), loadoutWith({ body: armor() }))).toEqual([]);
  });

  it('omits a row when either side lacks the field', () => {
    const cols = compareToLoadout(subject(armor({ level: null }), 'Sisak'), loadoutWith({ head: armor() }));
    expect(cols[0].rows.map((r) => r.label)).toEqual(['Védelem', 'Mágikus']);
  });

  it('leaves the empty slot uncompared', () => {
    expect(compareToLoadout(subject(armor(), 'Sisak'), loadoutWith({ body: armor() }))).toEqual([]);
  });
});

describe('adapters', () => {
  it('reads a database weapon', () => {
    const w = { name: 'íj', level: 21, maxDamage: 133, spread: 7, magical: true, vampiric: true } as never;
    expect(fromWeapon(w)).toEqual({
      name: 'íj', kind: 'fegyver', level: 21, maxDamage: 133, spread: 7,
      defense: null, magical: true, vampiric: true, armorType: null,
    });
  });

  it('reads a database armour, keeping its type for slot resolution', () => {
    const a = { name: 'sisak', level: 20, defense: 16, magical: false, type: 'Sisak' } as never;
    expect(fromArmor(a)).toMatchObject({ kind: 'vért', defense: 16, armorType: 'Sisak' });
  });

  it('reads a parsed stat block, keeping Fajta as the type', () => {
    const d = { type: 'vért', magical: false, attrs: [['Név', 'bőrpajzs'], ['Védelem', '1'], ['Fajta', 'kézbe']] as Array<[string, string]> };
    expect(fromDetail(d)).toMatchObject({ name: 'bőrpajzs', defense: 1, armorType: 'kézbe' });
  });

  it('rejects a plain item', () => {
    expect(fromDetail({ type: 'tárgy', magical: false, attrs: [['Név', 'ásó']] })).toBeNull();
  });
});

describe('formatDelta', () => {
  it('signs the number and localises the decimal', () => {
    expect(formatDelta(10)).toBe('+10');
    expect(formatDelta(-10)).toBe('-10');
    expect(formatDelta(-0.5)).toBe('-0,5');
  });
});

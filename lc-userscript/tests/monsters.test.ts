import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildMonsterDatabase, type Monster } from '../src/data/monsters';

const SAMPLE_MONSTERS: Monster[] = [
  { id: 1, name: 'Vérszomjas moszkitóraj', image: '/pic/szornyk/moszkitoraj_k.gif', level: 1, hp: 6, mp: 4, attackType: 'Szúró/Vágó', debuff: 'fertőzés', magicWeapon: false, location: 'Larkinor', drops: [{ qty: 1, name: 'szúnyogszárny', id: 51 }] },
  { id: 2, name: 'Törpe csatasün', image: '/pic/szornyk/sun_k.gif', level: 1, hp: 8, mp: 6, attackType: 'Ütő/Zúzó', debuff: '-', magicWeapon: false, location: 'Larkinor', drops: [{ qty: 2, name: 'kaja', id: 1 }] },
  { id: 99, name: 'Hosszú nevű szörnyeteg király', image: '/pic/szornyk/king.gif', level: 10, hp: 500, mp: 200, attackType: 'Ütő', debuff: '-', magicWeapon: true, location: 'Démonok', drops: [] },
];

describe('buildMonsterDatabase', () => {
  it('builds a Map keyed by lowercased monster name', () => {
    const db = buildMonsterDatabase(SAMPLE_MONSTERS);
    expect(db.byName.has('vérszomjas moszkitóraj')).toBe(true);
    expect(db.byName.has('törpe csatasün')).toBe(true);
  });

  it('getByName is case-insensitive', () => {
    const db = buildMonsterDatabase(SAMPLE_MONSTERS);
    expect(db.getByName('Vérszomjas Moszkitóraj')?.id).toBe(1);
    expect(db.getByName('TÖRPE CSATASÜN')?.id).toBe(2);
  });

  it('getByName returns undefined for unknown names', () => {
    const db = buildMonsterDatabase(SAMPLE_MONSTERS);
    expect(db.getByName('Ismeretlen szörny')).toBeUndefined();
  });

  it('pattern matches longer names before shorter substring names', () => {
    const db = buildMonsterDatabase(SAMPLE_MONSTERS);
    const text = 'Egy Hosszú nevű szörnyeteg király áll előtted.';
    const matches = text.match(db.pattern);
    expect(matches?.[0]).toBe('Hosszú nevű szörnyeteg király');
  });

  it('pattern is case-insensitive', () => {
    const db = buildMonsterDatabase(SAMPLE_MONSTERS);
    const text = 'egy vérszomjas moszkitóraj támad rád';
    expect(db.pattern.test(text)).toBe(true);
    db.pattern.lastIndex = 0; // reset stateful regex
  });
});

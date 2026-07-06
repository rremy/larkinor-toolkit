import { describe, it, expect } from 'vitest';
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

  it('getByName trims and matches multi-word names', () => {
    const db = buildMonsterDatabase(SAMPLE_MONSTERS);
    expect(db.getByName('hosszú nevű szörnyeteg király')?.id).toBe(99);
  });
});

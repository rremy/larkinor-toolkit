import { describe, it, expect } from 'vitest';
import { buildLookups, sortUsedIn } from '@/database/explorer/lookups';
import type { Weapon, Armor, Item } from '@/shared/data';
import type { Monster } from '@/shared/data/monsters';

const w = (over: Partial<Weapon>): Weapon => ({
  id: 0, name: '', weight: 0, price: 0, special: '', magical: false, craftableAt: '',
  minLevel: null, recipe: [], droppedBy: [], type: '', maxDamage: 0, spread: 0,
  avgDamage: 0, vampiric: false, level: 1, availability: [], shops: [], ...over,
});
const i = (over: Partial<Item>): Item => ({
  id: 0, name: '', weight: 0, price: 0, special: '', magical: false, craftableAt: '',
  minLevel: null, recipe: [], droppedBy: [], defense: null, shops: [], ...over,
});
const m = (over: Partial<Monster>): Monster => ({
  id: 0, name: '', image: '', level: 1, hp: 0, mp: 0, attackType: '', debuff: '',
  magicWeapon: false, location: '', drops: [], ...over,
});

describe('buildLookups', () => {
  it('indexes which entities use a component item (usedIn)', () => {
    const sword = w({ id: 10, name: 'kard', level: 5, recipe: [{ name: 'vas', qty: 2, id: '51' }] });
    const potion = i({ id: 20, name: 'bájital', minLevel: 3, recipe: [{ name: 'vas', qty: 1, id: '51' }] });
    const { usedIn } = buildLookups([sword], [], [potion], []);
    const users = usedIn.get(51)!;
    expect(users).toHaveLength(2);
    expect(users.find((u) => u.ownerType === 'weapons')).toMatchObject({ ownerId: 10, qty: 2, ownerLevel: 5 });
    expect(users.find((u) => u.ownerType === 'items')).toMatchObject({ ownerId: 20, qty: 1, ownerLevel: 3 });
  });

  it('maps monsters by id', () => {
    const { monstersById } = buildLookups([], [], [], [m({ id: 7, name: 'kutya', level: 4, hp: 30 })]);
    expect(monstersById.get(7)?.name).toBe('kutya');
  });
});

describe('sortUsedIn', () => {
  it('orders by owner level ascending, nulls last, then name', () => {
    const entries = [
      { ownerId: 1, ownerName: 'Béla', ownerType: 'items' as const, qty: 1, ownerLevel: null },
      { ownerId: 2, ownerName: 'Cél', ownerType: 'weapons' as const, qty: 1, ownerLevel: 5 },
      { ownerId: 3, ownerName: 'Aba', ownerType: 'armors' as const, qty: 1, ownerLevel: 5 },
    ];
    expect(sortUsedIn(entries).map((e) => e.ownerName)).toEqual(['Aba', 'Cél', 'Béla']);
  });
});

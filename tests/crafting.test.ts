import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { craftableIn, planCraft, sharedRecipe, type Craftable } from '../src/shared/crafting';
import type { Armor, Item, RecipeRef, Weapon } from '../src/shared/data/types';

const weapons: Weapon[] = JSON.parse(readFileSync('static/db/weapons.json', 'utf-8'));
const armors: Armor[] = JSON.parse(readFileSync('static/db/armors.json', 'utf-8'));
const items: Item[] = JSON.parse(readFileSync('static/db/items.json', 'utf-8'));

const SARKANY_SZARV: RecipeRef[] = [
  { name: 'sárkányfog', qty: 10, id: '251' },
  { name: 'sárkánykarom', qty: 5, id: '252' },
  { name: 'sárkánypikkely', qty: 3, id: '250' },
];

describe('craftableIn', () => {
  it('lists only what this hall makes, and only entries with a recipe', () => {
    const forge = craftableIn('forge', weapons, armors, items);
    const mage = craftableIn('mage', weapons, armors, items);
    // Counts measured over static/db on 2026-09-28 (see the spec).
    expect(forge.length).toBe(1249);
    expect(mage.length).toBe(1174);
    expect(forge.every((c) => c.recipe.length > 0)).toBe(true);
    expect(forge.some((c) => c.name === 'sárkány szarv' && c.kind === 'armor')).toBe(true);
    expect(mage.some((c) => c.name === 'sárkány szarv')).toBe(false);
  });

  it('keys entries by kind and id, since ids repeat across files', () => {
    const forge = craftableIn('forge', weapons, armors, items);
    expect(new Set(forge.map((c) => c.key)).size).toBe(forge.length);
    expect(forge[0].key).toMatch(/^(weapon|armor|item):\d+$/);
  });

  it('never needs more than the three slots the form has', () => {
    const all = [...craftableIn('forge', weapons, armors, items), ...craftableIn('mage', weapons, armors, items)];
    expect(Math.max(...all.map((c) => c.recipe.length))).toBe(3);
  });
});

describe('planCraft', () => {
  it('caps the count at the scarcest ingredient', () => {
    const owned = new Map([['251', 20], ['252', 10], ['250', 6]]);
    const plan = planCraft(SARKANY_SZARV, owned);
    expect(plan.max).toBe(2);
    expect(plan.lines.map((l) => l.ok)).toEqual([true, true, true]);
    expect(plan.lines[0]).toEqual({ id: '251', name: 'sárkányfog', needed: 10, owned: 20, ok: true });
  });

  it('marks a short ingredient red and allows none', () => {
    const owned = new Map([['251', 20], ['252', 4], ['250', 6]]);
    const plan = planCraft(SARKANY_SZARV, owned);
    expect(plan.max).toBe(0);
    expect(plan.lines[1]).toMatchObject({ owned: 4, ok: false });
  });

  it('reads an ingredient the page does not list as owned 0', () => {
    const plan = planCraft(SARKANY_SZARV, new Map([['251', 20], ['252', 10]]));
    expect(plan.lines[2]).toMatchObject({ id: '250', owned: 0, ok: false });
    expect(plan.max).toBe(0);
  });

  it('treats silver (id 0) as just another ingredient', () => {
    const plan = planCraft([{ name: 'ezüst', qty: 500, id: '0' }], new Map([['0', 1168]]));
    expect(plan.max).toBe(2);
  });

  it('allows nothing for an empty recipe', () => {
    expect(planCraft([], new Map()).max).toBe(0);
  });
});

describe('sharedRecipe', () => {
  it('finds the six gyíkacél armours that share one recipe', () => {
    const forge = craftableIn('forge', weapons, armors, items);
    const mellveny = forge.find((c) => c.name === 'gyíkacél mellény') as Craftable;
    const others = sharedRecipe(mellveny, forge).map((c) => c.name).sort();
    expect(others).toEqual(['gyíkacél egyenruha', 'gyíkacél ködmön', 'gyíkacél mellvért', 'gyíkacél páncél', 'gyíkacél zubbony']);
  });

  it('is empty for a recipe nobody else uses', () => {
    const forge = craftableIn('forge', weapons, armors, items);
    const szarv = forge.find((c) => c.name === 'sárkány szarv') as Craftable;
    expect(sharedRecipe(szarv, forge)).toEqual([]);
  });
});

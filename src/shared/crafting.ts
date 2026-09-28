// Crafting planner for the Erőd's kovácsok terme and the Mágustorony's mágusok
// terme. Pure — no DOM, no GM — so both platforms and the tests share it.
//
// The game's crafting form never names the item being made: the player puts up
// to three ingredients in its slots and the game works out the product. So
// "craft X" here means "fill the slots with X's recipe", and what the player
// carries is read off the form's own ingredient select (see craftingExtract).

import type { Armor, Item, RecipeRef, Weapon } from '@/shared/data/types';

export type CraftingHallKind = 'forge' | 'mage';
export type CraftableKind = 'weapon' | 'armor' | 'item';

/** The database's `craftableAt` value for each hall. */
export const HALL_BUILDING: Record<CraftingHallKind, string> = {
  forge: 'Erőd',
  mage: 'Mágustorony',
};

export interface Craftable {
  /** `kind:id` — ids are only unique within one data file. */
  key: string;
  id: number;
  name: string;
  kind: CraftableKind;
  level: number | null;
  recipe: RecipeRef[];
}

export interface CraftLine {
  /** The game item id; silver is `'0'`. */
  id: string;
  name: string;
  /** Per piece. */
  needed: number;
  owned: number;
  /** Enough for one piece. */
  ok: boolean;
}

export interface CraftPlan {
  lines: CraftLine[];
  /** How many pieces the carried materials cover. */
  max: number;
}

type Source = Pick<Weapon | Armor | Item, 'id' | 'name' | 'craftableAt' | 'minLevel' | 'recipe'>;

function toCraftables(hall: CraftingHallKind, kind: CraftableKind, list: readonly Source[]): Craftable[] {
  const building = HALL_BUILDING[hall];
  // An entry marked craftable with an empty recipe (97 of them in the Erőd) has
  // nothing to put in the slots, so it is not offered.
  return list
    .filter((x) => x.craftableAt === building && x.recipe.length > 0)
    .map((x) => ({ key: `${kind}:${x.id}`, id: x.id, name: x.name, kind, level: x.minLevel, recipe: x.recipe }));
}

/** Everything the given hall can make, across the three data files. */
export function craftableIn(hall: CraftingHallKind, weapons: Weapon[], armors: Armor[], items: Item[]): Craftable[] {
  return [
    ...toCraftables(hall, 'weapon', weapons),
    ...toCraftables(hall, 'armor', armors),
    ...toCraftables(hall, 'item', items),
  ];
}

/**
 * Each ingredient against what is carried, and the most pieces that covers.
 * An ingredient missing from `owned` is simply not carried.
 */
export function planCraft(recipe: RecipeRef[], owned: ReadonlyMap<string, number>): CraftPlan {
  const lines = recipe.map((r) => {
    const have = owned.get(r.id) ?? 0;
    return { id: r.id, name: r.name, needed: r.qty, owned: have, ok: have >= r.qty };
  });
  const max = lines.length === 0
    ? 0
    : Math.min(...lines.map((l) => (l.needed > 0 ? Math.floor(l.owned / l.needed) : Infinity)));
  return { lines, max: Number.isFinite(max) ? max : 0 };
}

function signature(recipe: RecipeRef[]): string {
  return recipe.map((r) => `${r.id}x${r.qty}`).sort().join(',');
}

/**
 * Other entries whose recipe is identical to `target`'s. The form cannot say
 * which of them the player wants, so the game decides — six gyíkacél armours
 * in the Erőd share one recipe.
 */
export function sharedRecipe(target: Craftable, all: readonly Craftable[]): Craftable[] {
  const sig = signature(target.recipe);
  return all.filter((c) => c.key !== target.key && signature(c.recipe) === sig);
}

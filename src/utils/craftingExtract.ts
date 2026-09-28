// Extraction for the two crafting buildings (measured live 2026-09-28).
//
// Each building is a lobby (otErod / otMagustorony: a row of titled image
// controls) and an inner hall (otErodBelso / otMagustoronyBelso) holding the
// crafting form. The two halls ship the same form under different names:
//   fegyvercsinalUrlap    + keszitfegyver.gif      (Erőd)
//   varfegyvercsinalUrlap + keszitvarazstargy.gif  (Mágustorony)
// Three ingredient slots (targyN select + darabN text) and darabszam. Every
// targyN lists the player's backpack: value = game item id, text =
// "<count> <name>", silver first as value "0". The form never names the
// product — the game infers it from the ingredients.
//
// The page's submit helper packs targyN.selectedIndex (not the value) into
// urlap.par1, so the index is what must be set. darabN is per piece.

import type { RecipeRef } from '@/shared/data/types';
import type { CraftingHallKind } from '@/shared/crafting';
import {
  basename,
  extractBuildings,
  extractImageControl,
  extractNarration,
  parseGold,
  type BuildingOption,
} from '@/utils/domExtract';

/** The form name and submit-control basename of each hall. */
const HALL_FORMS: Record<CraftingHallKind, { form: string; submit: string }> = {
  forge: { form: 'fegyvercsinalUrlap', submit: 'keszitfegyver' },
  mage: { form: 'varfegyvercsinalUrlap', submit: 'keszitvarazstargy' },
};

const SLOT_COUNT = 3;
const EXIT_BASENAME = 'vissza';

export interface OwnedOption {
  id: string;
  count: number;
  name: string;
}

/**
 * One ingredient option, `"20 sárkányfog"`. Only the first run of digits is the
 * count — an item name may itself start with a number (`"3 1 hetes kenyér"`).
 */
export function parseOwnedOption(value: string, text: string): OwnedOption | null {
  const m = text.trim().match(/^(\d+)\s+(.+)$/);
  if (!m) return null;
  return { id: value, count: parseInt(m[1], 10), name: m[2].trim() };
}

export interface TrapOption {
  /** Position in the trap select. */
  index: number;
  label: string;
}

export interface SpellOption {
  value: string;
  label: string;
}

/** The hall's second form, which mobile must keep reachable. */
export type HallSideForm =
  | {
    kind: 'trap';
    traps: TrapOption[];
    /** Asks the page's own price control and returns what it printed. */
    price: (index: number, strength: number) => string;
    order: (index: number, strength: number) => void;
  }
  | { kind: 'spell'; spells: SpellOption[]; learnLabel: string; learn: (value: string) => void };

export interface CraftingHallState {
  hall: CraftingHallKind;
  gold: number;
  narration: string;
  /** Game item id → count carried. */
  owned: ReadonlyMap<string, number>;
  /** Fills the form with `count` pieces of `recipe` and submits. Throws, without submitting, on an ingredient the page does not list. */
  craft: (recipe: RecipeRef[], count: number) => void;
  exit: BuildingOption | null;
  side: HallSideForm | null;
}

function field<T extends Element>(form: HTMLFormElement, name: string): T | null {
  return form.elements.namedItem(name) as T | null;
}

function findHall(doc: Document): { hall: CraftingHallKind; form: HTMLFormElement } | null {
  for (const hall of Object.keys(HALL_FORMS) as CraftingHallKind[]) {
    // namedItem can also return a RadioNodeList; a tag check (rather than
    // instanceof) also survives a document from another jsdom window.
    const form = doc.forms.namedItem(HALL_FORMS[hall].form) as Element | null;
    if (form && form.tagName === 'FORM') return { hall, form: form as HTMLFormElement };
  }
  return null;
}

function imageInput(doc: Document, wantName: string): HTMLInputElement | null {
  return Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="image"]'))
    .find((i) => basename(i.getAttribute('src') ?? '') === wantName) ?? null;
}

function extractTrapForm(doc: Document): HallSideForm | null {
  const form = doc.forms.namedItem('csapdaRendelUrlap') as HTMLFormElement | null;
  const orderButton = imageInput(doc, 'csapdarendel');
  const priceButton = imageInput(doc, 'kerdojel');
  if (!form || !orderButton) return null;
  const select = field<HTMLSelectElement>(form, 'targy');
  const strength = field<HTMLInputElement>(form, 'mennyiseg');
  const total = field<HTMLInputElement>(form, 'osszeg');
  if (!select || !strength) return null;
  const set = (index: number, value: number): void => {
    select.selectedIndex = index;
    strength.value = String(value);
  };
  return {
    kind: 'trap',
    traps: Array.from(select.options).map((o, index) => ({ index, label: o.text.trim() })),
    // The price is the page's own computation (jelezAr); we only ask for it.
    price: (index, value) => {
      set(index, value);
      priceButton?.click();
      return total?.value ?? '';
    },
    order: (index, value) => {
      set(index, value);
      orderButton.click();
    },
  };
}

function extractSpellForm(doc: Document): HallSideForm | null {
  const select = doc.querySelector<HTMLSelectElement>('form[name="extravarazslatok"] select[name="evarazslatok"]');
  const learn = imageInput(doc, 'tanulvarazslat');
  if (!select || !learn) return null;
  return {
    kind: 'spell',
    spells: Array.from(select.options).map((o) => ({ value: o.value, label: o.text.trim() })),
    learnLabel: learn.getAttribute('title')?.trim() || 'Megtanulod',
    learn: (value) => {
      select.value = value;
      learn.click();
    },
  };
}

export function extractCraftingHall(doc: Document): CraftingHallState | null {
  const found = findHall(doc);
  if (!found) return null;
  const { hall, form } = found;
  const submit = imageInput(doc, HALL_FORMS[hall].submit);
  const first = field<HTMLSelectElement>(form, 'targy1');
  const count = field<HTMLInputElement>(form, 'darabszam');
  if (!submit || !first || !count) return null;

  const owned = new Map<string, number>();
  for (const opt of Array.from(first.options)) {
    const parsed = parseOwnedOption(opt.value, opt.text);
    if (parsed) owned.set(parsed.id, parsed.count);
  }

  const craft = (recipe: RecipeRef[], pieces: number): void => {
    if (!Number.isInteger(pieces) || pieces < 1) throw new Error(`Invalid craft count: ${pieces}`);
    if (recipe.length === 0 || recipe.length > SLOT_COUNT) throw new Error(`Recipe needs ${recipe.length} slots`);
    // Resolve every slot before touching the form, so a missing ingredient
    // leaves the page exactly as it was.
    const plan = Array.from({ length: SLOT_COUNT }, (_, i) => {
      const select = field<HTMLSelectElement>(form, `targy${i + 1}`);
      const amount = field<HTMLInputElement>(form, `darab${i + 1}`);
      if (!select || !amount) throw new Error(`Crafting slot ${i + 1} is missing`);
      const ingredient = recipe[i];
      if (!ingredient) return { select, amount, index: 0, qty: '' };
      const index = Array.from(select.options).findIndex((o) => o.value === ingredient.id);
      if (index === -1) throw new Error(`Ingredient not carried: ${ingredient.name}`);
      return { select, amount, index, qty: String(ingredient.qty) };
    });
    for (const slot of plan) {
      slot.select.selectedIndex = slot.index;
      slot.amount.value = slot.qty;
    }
    count.value = String(pieces);
    submit.click();
  };

  return {
    hall,
    gold: parseGold(doc.body.textContent ?? ''),
    narration: extractNarration(doc),
    owned,
    craft,
    exit: extractImageControl(doc, EXIT_BASENAME),
    side: hall === 'forge' ? extractTrapForm(doc) : extractSpellForm(doc),
  };
}

export interface BuildingLobbyState {
  /** The page title, e.g. "Erőd" / "Mágustorony". */
  title: string;
  gold: number;
  narration: string;
  /** Every titled control except the exit, in page order. */
  controls: BuildingOption[];
  exit: BuildingOption | null;
}

export function extractBuildingLobby(doc: Document): BuildingLobbyState {
  return {
    title: doc.title.trim(),
    gold: parseGold(doc.body.textContent ?? ''),
    narration: extractNarration(doc),
    controls: extractBuildings(doc, (name) => name === EXIT_BASENAME),
    exit: extractImageControl(doc, EXIT_BASENAME),
  };
}

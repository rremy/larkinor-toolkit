// Extraction for the whole character page (otPlayerSettings), for the mobile
// view. `characterExtract.ts` reads only the worn set, for the loadout the
// compare card uses; this reads everything else the page shows and does.
//
// What the page does, and how each action is driven (never by reconstructing
// an onclick):
//   equip      — set targyurlap.targy, click the slot's own image control
//                (test_be / fej_be / jobbkez_fegyver / balkez_fegyver / lab_be)
//   drop       — set targyurlap.targy + darab, click the drop control
//   drop many  — tick #cuccLayer checkboxes (their onclick flips cuccArray[i]),
//                click the layer's own drop button
//   attributes — write each tulajdonsagokUrlap field and `kapottpont`, click
//                the save button; its handler reads exactly those fields
//   stance / quick key — set the select, click the save button beside it
//
// Two image names are each used twice on the live page — `eldob` (single and
// mass drop) and `mentes` (the three saves) — so those controls are found by
// where they sit, never by name alone.
//
// See docs/superpowers/specs/2026-10-28-shops-and-buildings-design.md.

import { parseCuccArray, parseCuccDetail, type ParsedDetail } from '@/utils/homeExtract';
import { absolutizeGameUrl, basename, extractImageControl, type BuildingOption } from '@/utils/domExtract';
import { extractCharacter } from '@/utils/characterExtract';
import { armorTarget, attrOf, type Loadout, type Slot } from '@/shared/loadout';
import { marketPriceFor, type MarketRates } from '@/shared/marketRates';

/** The five equip controls, by the slot they fill. */
const EQUIP_BUTTONS: Record<Slot, string> = {
  body: 'test_be',
  head: 'fej_be',
  rightHand: 'jobbkez_fegyver',
  leftHand: 'balkez_fegyver',
  legs: 'lab_be',
};

export type AttributeKey = 'ero' | 'iq' | 'szerencse' | 'gyorsasag' | 'ugyesseg' | 'kitartas';

/** The six attributes, in the page's order, with its labels. */
export const ATTRIBUTES: ReadonlyArray<readonly [AttributeKey, string]> = [
  ['ero', 'Erő'],
  ['iq', 'Intelligencia'],
  ['szerencse', 'Szerencse'],
  ['gyorsasag', 'Gyorsaság'],
  ['ugyesseg', 'Ügyesség'],
  ['kitartas', 'Kitartás'],
];

export interface BackpackItem extends ParsedDetail {
  /** Position in `targyurlap.targy` — what equip and drop set. */
  index: number;
  /** The game's item id (the option's value). */
  id: string;
  /** The slots this item can be put into; empty for anything not worn. */
  slots: Slot[];
  /** Position in the mass-drop list, or null when it carries no entry for it. */
  bulkIndex: number | null;
  /** Ár times the rate captured on the last market visit, or null when unknown. */
  marketPrice: number | null;
}

export interface ChoiceSetting {
  options: Array<{ value: string; label: string }>;
  selected: string;
  save: (value: string) => void;
}

export interface CharacterPageState {
  name: string;
  level: number | null;
  xp: number | null;
  /** "Életpont: 573/573", the two figures in the page's order. */
  hp: [number, number] | null;
  mp: [number, number] | null;
  defense: number | null;
  load: { used: number; max: number } | null;
  loadout: Loadout | null;
  backpack: BackpackItem[];
  equip: (item: BackpackItem, slot: Slot) => void;
  drop: (item: BackpackItem, qty: number) => void;
  dropMany: (items: BackpackItem[]) => void;
  /** "Viselt tárgyak a hátizsákba" — the page asks its own confirmation. */
  stowWorn: BuildingOption | null;
  attributes: Array<{ key: AttributeKey; label: string; value: number }>;
  freePoints: number;
  /** Saves the attributes with `added` points on top of each current value. */
  saveAttributes: (added: Partial<Record<AttributeKey, number>>) => void;
  /** "Fokozatod". */
  stance: ChoiceSetting | null;
  /** "Gyorsgombod". */
  quickKey: ChoiceSetting | null;
  /** "Rontások", as printed — "Semmi ilyesmi nincs rajtad!!!" when clean. */
  curses: string[];
  attackSpells: Array<{ name: string; stats: string }>;
  skills: Array<{ name: string; value: string }>;
  otherSpells: string[];
  emailPrivacy: BuildingOption | null;
  exit: BuildingOption | null;
}

function scriptText(doc: Document): string {
  return Array.from(doc.querySelectorAll('script:not([src])'))
    .find((s) => /targyTomb/.test(s.textContent ?? ''))?.textContent ?? '';
}

function control(input: HTMLInputElement | null): BuildingOption | null {
  if (!input) return null;
  return {
    label: input.getAttribute('title')?.trim() || basename(input.getAttribute('src') ?? ''),
    iconUrl: absolutizeGameUrl(input.getAttribute('src') ?? ''),
    trigger: () => input.click(),
  };
}

function images(root: ParentNode | null): HTMLInputElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLInputElement>('input[type="image"]')) : [];
}

/** The slots an item fits, from its `Típus` and `Fajta`. */
function slotsFor(detail: ParsedDetail): Slot[] {
  if (detail.type === 'fegyver') return ['rightHand', 'leftHand'];
  if (detail.type !== 'vért') return [];
  const target = armorTarget(attrOf(detail, 'Fajta'));
  if (!target) return [];
  return target.kind === 'hand' ? ['rightHand', 'leftHand'] : [target.slot];
}

/** "573/573" after `label`, or null. */
function pairAfter(text: string, label: string): [number, number] | null {
  const m = text.match(new RegExp(`${label}:\\s*(\\d+)\\s*/\\s*(\\d+)`));
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
}

function numberAfter(text: string, label: string): number | null {
  const m = text.match(new RegExp(`${label}:\\s*(\\d+)`));
  return m ? parseInt(m[1], 10) : null;
}

/**
 * The lines of the box headed by a bold `heading` ("Képzettségek:"), the heading
 * itself left out. Each box is a div whose first child is a centred bold title;
 * its lines are split by `<br>` or by their own divs.
 */
function sectionLines(doc: Document, heading: string): string[] {
  const title = Array.from(doc.querySelectorAll('b')).find((b) => b.textContent?.trim() === heading);
  const box = title?.closest('center')?.parentElement;
  if (!box) return [];
  const tmp = doc.createElement('div');
  tmp.innerHTML = box.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<\/div>/gi, '\n');
  return (tmp.textContent ?? '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && l !== heading);
}

/** The value each attribute field is given by the page's own filler function. */
function attributeValues(script: string, form: HTMLFormElement | null): Map<string, number> {
  const values = new Map<string, number>();
  // Read from the script, not the fields: the page fills them from an image's
  // onload, which may not have run when the boot reads the page.
  const re = /tulajdonsagokUrlap\.(\w+)\.value\s*=\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(script)) !== null) values.set(m[1], parseInt(m[2], 10));
  for (const name of [...ATTRIBUTES.map(([k]) => k), 'kapottpont']) {
    if (values.has(name)) continue;
    const field = form?.elements.namedItem(name) as HTMLInputElement | null;
    const n = parseInt(field?.value ?? '', 10);
    if (Number.isFinite(n)) values.set(name, n);
  }
  return values;
}

/** A select in the attributes form and the save control right after it. */
function choiceSetting(form: HTMLFormElement | null, selectName: string): ChoiceSetting | null {
  const select = form?.elements.namedItem(selectName) as HTMLSelectElement | null;
  // Checked by tag, not `instanceof`: the page's elements belong to its own
  // window, which is not the userscript sandbox's (nor a test's JSDOM's).
  const next = select?.nextElementSibling;
  if (!select || next?.tagName !== 'INPUT' || next.getAttribute('type') !== 'image') return null;
  const save = next as HTMLInputElement;
  return {
    options: Array.from(select.options).map((o) => ({ value: o.value, label: o.text.trim() })),
    selected: select.value,
    save: (value: string) => {
      select.value = value;
      save.click();
    },
  };
}

/**
 * Reads the character page. `rates` are the market rates captured on the last
 * market visit, for each backpack item's market price; null leaves them out.
 */
export function extractCharacterPage(doc: Document, rates: MarketRates | null = null): CharacterPageState {
  const text = doc.body.textContent ?? '';
  // The figures are read from their own block: the item details print "Név:"
  // too, and a script's text is part of the body's wherever the page puts it.
  const statBlock = Array.from(doc.querySelectorAll('font[face="Comic sans MS"]'))
    .find((el) => /Tapasztalati pont/.test(el.textContent ?? ''));
  const stats = statBlock?.textContent ?? text;
  const script = scriptText(doc);
  const itemForm = doc.forms.namedItem('targyurlap');
  const attrForm = doc.forms.namedItem('tulajdonsagokUrlap');
  const layer = doc.getElementById('cuccLayer');

  const select = (itemForm?.elements.namedItem('targy') as HTMLSelectElement | null) ?? null;
  const darab = (itemForm?.elements.namedItem('darab') as HTMLInputElement | null) ?? null;

  // The mass-drop list mirrors the backpack, labelled "21851 db. ezüst".
  const bulk = Array.from(layer?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? []).map((checkbox, index) => {
    const label = (checkbox.nextSibling?.textContent ?? '').trim();
    return { index, checkbox, name: label.replace(/^\d+\s*(?:db\.)?\s*/, '').trim().toLowerCase() };
  });
  const bulkByName = new Map(bulk.filter((b) => !b.checkbox.disabled).map((b) => [b.name, b.index]));

  const details = parseCuccArray(script, 'targyTomb');
  const backpack: BackpackItem[] = Array.from(select?.options ?? []).map((option, index) => {
    const detail = details[index] !== undefined
      ? parseCuccDetail(details[index])
      : parseCuccDetail(`Név: ${option.text.replace(/^\d+\s+/, '').trim()}`);
    return {
      ...detail,
      index,
      id: option.value,
      slots: slotsFor(detail),
      bulkIndex: bulkByName.get(detail.name.toLowerCase()) ?? null,
      marketPrice: marketPriceFor(option.value, detail.price, rates),
    };
  });

  const pick = (item: BackpackItem, qty: number): boolean => {
    if (!select || !darab) return false;
    select.selectedIndex = item.index;
    darab.value = String(Math.max(1, Math.min(Math.floor(qty), item.amount)));
    return true;
  };

  const equipButtons = new Map(
    (Object.entries(EQUIP_BUTTONS) as Array<[Slot, string]>).map(([slot, name]) => [
      slot,
      images(doc).find((i) => basename(i.getAttribute('src') ?? '') === name) ?? null,
    ]),
  );
  // The single drop is the `eldob` image outside the mass-drop layer.
  const dropButton = images(doc).find((i) => !layer?.contains(i) && /^eldob/.test(basename(i.getAttribute('src') ?? ''))) ?? null;
  const dropManyButton = images(layer).find((i) => /^eldob/.test(basename(i.getAttribute('src') ?? ''))) ?? null;

  const values = attributeValues(script, attrForm);
  const attributes = ATTRIBUTES.map(([key, label]) => ({ key, label, value: values.get(key) ?? 0 }));
  const freePoints = values.get('kapottpont') ?? 0;
  const stanceSelect = attrForm?.elements.namedItem('valasztas');
  const quickSelect = attrForm?.elements.namedItem('shortcut');
  // The attributes' save is the form's image control that follows neither select.
  const attrSave = images(attrForm).find((i) => i.previousElementSibling !== stanceSelect && i.previousElementSibling !== quickSelect) ?? null;

  const attackLines = sectionLines(doc, 'Támadó varázslatok:');
  const attackSpells: Array<{ name: string; stats: string }> = [];
  for (let i = 0; i < attackLines.length; i++) {
    if (!attackLines[i].endsWith(':')) continue;
    attackSpells.push({ name: attackLines[i].slice(0, -1).trim(), stats: attackLines[i + 1] ?? '' });
  }

  const load = text.match(/Terhelés:\s*([\d.]+)\s*kg\.?\s*\/\s*([\d.]+)\s*kg/);

  return {
    name: statBlock?.querySelector('b')?.textContent?.trim() ?? stats.match(/Név:\s*(\S+)/)?.[1] ?? '',
    level: numberAfter(stats, 'Szint'),
    xp: numberAfter(stats, 'Tapasztalati pont'),
    hp: pairAfter(stats, 'Életpont'),
    mp: pairAfter(stats, 'Varázspont'),
    defense: numberAfter(stats, 'Védettség'),
    load: load ? { used: parseFloat(load[1]), max: parseFloat(load[2]) } : null,
    loadout: extractCharacter(doc),
    backpack,
    equip: (item, slot) => {
      const button = equipButtons.get(slot);
      if (!button || !item.slots.includes(slot) || !pick(item, 1)) return;
      button.click();
    },
    drop: (item, qty) => {
      if (!dropButton || !pick(item, qty)) return;
      dropButton.click();
    },
    dropMany: (items) => {
      const wanted = new Set(items.map((i) => i.bulkIndex).filter((i): i is number => i !== null));
      if (!dropManyButton || wanted.size === 0) return;
      // Clicked, not set: each box's own onclick flips cuccArray[i].
      for (const entry of bulk) {
        if (!entry.checkbox.disabled && entry.checkbox.checked !== wanted.has(entry.index)) entry.checkbox.click();
      }
      dropManyButton.click();
    },
    stowWorn: extractImageControl(doc, 'hatizsakba2') ?? extractImageControl(doc, 'hatizsakba'),
    attributes,
    freePoints,
    saveAttributes: (added) => {
      const spent = ATTRIBUTES.reduce((sum, [key]) => sum + Math.max(0, Math.floor(added[key] ?? 0)), 0);
      if (!attrForm || !attrSave || spent === 0 || spent > freePoints) return;
      for (const { key, value } of attributes) {
        const field = attrForm.elements.namedItem(key) as HTMLInputElement | null;
        if (field) field.value = String(value + Math.max(0, Math.floor(added[key] ?? 0)));
      }
      const remaining = attrForm.elements.namedItem('kapottpont') as HTMLInputElement | null;
      if (remaining) remaining.value = String(freePoints - spent);
      attrSave.click();
    },
    stance: choiceSetting(attrForm, 'valasztas'),
    quickKey: choiceSetting(attrForm, 'shortcut'),
    curses: sectionLines(doc, 'Rontások'),
    attackSpells,
    skills: sectionLines(doc, 'Képzettségek:').flatMap((line) => {
      const m = line.match(/^(.+?):\s*(.+)$/);
      return m ? [{ name: m[1].trim(), value: m[2].trim() }] : [];
    }),
    otherSpells: sectionLines(doc, 'Egyéb varázslatok:'),
    emailPrivacy: control(images(doc).find((i) => basename(i.getAttribute('src') ?? '') === 'envelope') ?? null),
    exit: extractImageControl(doc, 'vissza'),
  };
}

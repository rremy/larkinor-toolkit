// Extraction for the shops: the Vegyesbolt and Fegyverbolt (buy, sell one, sell
// many) and the Templom, which carries the same buy form and no selling at all.
//
// The data comes the way it does on the Home and market pages: inline script
// arrays of "label: value" detail blocks (`vetelTargyak`, `eladasTargyak`) beside
// parallel price arrays (`vetelArak`, `eladasArak`), indexed like the options of
// the form's select. Actions drive the game's own forms and buttons:
//   buy      — set vetelUrlap.targy / mennyiseg, click `vesz`
//   sell one — set eladasUrlap.targy / mennyiseg, click the `elad` inside that form
//   sell many — tick checkboxes in #cuccLayer, click the `elad` inside that layer
// The bulk list's checkboxes each toggle `cuccArray[i]` in their own onclick, so
// they are clicked rather than set — the array is never rebuilt here.
//
// See docs/superpowers/specs/2026-10-28-shops-and-buildings-design.md.

import { parseCuccArray, parseCuccDetail, type ParsedDetail } from '@/utils/homeExtract';
import {
  basename,
  extractBuildingNarration,
  extractBuildings,
  extractImageControl,
  parseGold,
  type BuildingOption,
} from '@/utils/domExtract';
import { marketPriceFor, type MarketRates } from '@/shared/marketRates';

export type ShopKind = 'general' | 'weapon' | 'church';

export interface ShopBuyItem extends ParsedDetail {
  /** Position in the buy select — what the buy sets. */
  index: number;
  /** The game's item id (the option's value). */
  id: string;
  /** What the shop charges per unit. */
  unitPrice: number | null;
  /** Shop price times the last captured market rate, or null when unknown. */
  marketPrice: number | null;
}

export interface ShopSellItem extends ParsedDetail {
  /** Position in the sell select, or null for an entry only the bulk list carries. */
  index: number | null;
  /** The game's item id, when the sell select names it. */
  id: string | null;
  /** What the shop pays per unit ("Elad.ár"), or null when the page gives none. */
  sellPrice: number | null;
  marketPrice: number | null;
  /** Position in the bulk list when the page lets this shop take it in bulk. */
  bulkIndex: number | null;
  /**
   * Whether this shop buys the item at all. The single-sale list is the same in
   * both shops; only the bulk list says what *this* shop takes, by disabling the
   * rest — so an item the bulk list disables is not sellable here.
   */
  sellable: boolean;
}

export interface ShopActions {
  exit: BuildingOption | null;
  /** "Viselt tárgyak a hátizsákba" — moves the worn set into the backpack. */
  stowWorn: BuildingOption | null;
  /** Every other titled control: the Templom's prayers, insurance, collection box. */
  other: BuildingOption[];
}

export interface ShopState {
  kind: ShopKind;
  /** The page title — "Vegyesbolt", "Fegyverbolt", "Templom". */
  title: string;
  gold: number;
  narration: string;
  buy: ShopBuyItem[];
  /** Empty in the Templom, which buys nothing. */
  sell: ShopSellItem[];
  /** Buys `qty` of `item`. Navigates. */
  purchase: (item: ShopBuyItem, qty: number) => void;
  /** Sells `qty` of `item` through the single-sale form. Navigates. */
  sellOne: (item: ShopSellItem, qty: number) => void;
  /** Sells the whole stacks of `items` through the bulk list. Navigates. */
  sellMany: (items: ShopSellItem[]) => void;
  actions: ShopActions;
  /** The Templom's "Negatív hatások" box, as printed; null elsewhere. */
  ailments: string | null;
}

const BUY_BUTTON = 'vesz';
const SELL_BUTTON = 'elad';
const EXIT_BUTTON = 'vissza';
const STOW_BUTTON = 'hatizsakba';
/** The bulk list's "close without selling" control — an action of the layer, not the page. */
const HIDE_BUTTON = 'duel';

const KIND_BY_PAGE: Record<string, ShopKind> = {
  otVegyesbolt: 'general',
  otFegyverbolt: 'weapon',
  otTemplom: 'church',
};

function shopScriptText(doc: Document): string {
  return Array.from(doc.querySelectorAll('script:not([src])'))
    .find((s) => /vetelTargyak/.test(s.textContent ?? ''))?.textContent ?? '';
}

function formSelect(doc: Document, form: string): HTMLSelectElement | null {
  return (doc.forms.namedItem(form)?.elements.namedItem('targy') as HTMLSelectElement | null) ?? null;
}

function formQuantity(doc: Document, form: string): HTMLInputElement | null {
  return (doc.forms.namedItem(form)?.elements.namedItem('mennyiseg') as HTMLInputElement | null) ?? null;
}

function imageIn(root: ParentNode | null, name: string): HTMLInputElement | null {
  if (!root) return null;
  return Array.from(root.querySelectorAll<HTMLInputElement>('input[type="image"]'))
    .find((i) => basename(i.getAttribute('src') ?? '') === name) ?? null;
}

function toNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = parseInt(raw.replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

/** "88 arany" → { amount: 88, name: "arany" }; a label without a count keeps its text. */
function parseCountLabel(text: string): { amount: number; name: string } {
  const m = text.trim().match(/^(\d+)\s+(.*)$/);
  return m ? { amount: parseInt(m[1], 10), name: m[2].trim() } : { amount: 1, name: text.trim() };
}

interface BulkEntry {
  index: number;
  name: string;
  amount: number;
  enabled: boolean;
  checkbox: HTMLInputElement;
}

/** The bulk list, one entry per checkbox, labelled by the text that follows it. */
function readBulkList(doc: Document): BulkEntry[] {
  const layer = doc.getElementById('cuccLayer');
  if (!layer) return [];
  return Array.from(layer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).map((checkbox, index) => {
    const label = checkbox.nextSibling?.textContent ?? '';
    return { index, ...parseCountLabel(label), enabled: !checkbox.disabled, checkbox };
  });
}

/** The "Negatív hatások" box, flattened to one line per printed line. */
function readAilments(doc: Document): string | null {
  const box = Array.from(doc.querySelectorAll('font[face="Comic sans MS"]'))
    .find((el) => /Negatív hatások/.test(el.textContent ?? ''));
  if (!box) return null;
  const tmp = doc.createElement('div');
  tmp.innerHTML = box.innerHTML.replace(/<br\s*\/?>/gi, '\n');
  const lines = (tmp.textContent ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.filter((l) => !/^Negatív hatások:?$/.test(l)).join('\n') || null;
}

/**
 * Reads a shop page. `rates` are the market rates captured on the last market
 * visit, for the market price beside each row; null leaves those prices out.
 */
export function extractShop(doc: Document, rates: MarketRates | null = null): ShopState {
  const pageType = doc.querySelector<HTMLInputElement>('input[name="oldalTipus"]')?.value ?? '';
  const scriptText = shopScriptText(doc);

  const buyDetails = parseCuccArray(scriptText, 'vetelTargyak');
  const buyPrices = parseCuccArray(scriptText, 'vetelArak');
  const buy: ShopBuyItem[] = Array.from(formSelect(doc, 'vetelUrlap')?.options ?? []).map((option, index) => {
    const detail = buyDetails[index] !== undefined
      ? parseCuccDetail(buyDetails[index])
      : parseCuccDetail(`Név: ${parseCountLabel(option.text).name}`);
    const unitPrice = toNumber(buyPrices[index]) ?? detail.price;
    return { ...detail, index, id: option.value, unitPrice, marketPrice: marketPriceFor(option.value, detail.price, rates) };
  });

  const bulk = readBulkList(doc);
  const bulkByName = new Map(bulk.map((b) => [b.name.toLowerCase(), b]));
  const claimed = new Set<number>();

  const sellDetails = parseCuccArray(scriptText, 'eladasTargyak');
  const sellPrices = parseCuccArray(scriptText, 'eladasArak');
  const sell: ShopSellItem[] = Array.from(formSelect(doc, 'eladasUrlap')?.options ?? []).map((option, index) => {
    const label = parseCountLabel(option.text);
    const detail = sellDetails[index] !== undefined
      ? parseCuccDetail(sellDetails[index])
      : parseCuccDetail(`Név: ${label.name}\nMennyiség: ${label.amount}`);
    const sellPrice = toNumber(sellPrices[index]) ?? toNumber(detail.attrs.find(([k]) => k === 'Elad.ár')?.[1]);
    const bulkEntry = bulkByName.get(detail.name.toLowerCase());
    if (bulkEntry) claimed.add(bulkEntry.index);
    // Only an entry the page disables says "not here". No bulk list, or no entry
    // for this name, says nothing, and must not lock the row.
    const sellable = bulkEntry?.enabled ?? true;
    return {
      ...detail,
      index,
      id: option.value,
      sellPrice,
      marketPrice: marketPriceFor(option.value, detail.price, rates),
      bulkIndex: bulkEntry?.enabled ? bulkEntry.index : null,
      sellable,
    };
  });
  // A bulk-sellable entry the single-sale list does not carry still gets a row,
  // so nothing the page would sell goes missing from ours.
  for (const entry of bulk) {
    if (!entry.enabled || claimed.has(entry.index)) continue;
    sell.push({
      ...parseCuccDetail(`Név: ${entry.name}\nMennyiség: ${entry.amount}`),
      index: null,
      id: null,
      sellPrice: null,
      marketPrice: null,
      bulkIndex: entry.index,
      sellable: true,
    });
  }

  const purchase = (item: ShopBuyItem, qty: number): void => {
    const select = formSelect(doc, 'vetelUrlap');
    const qtyInput = formQuantity(doc, 'vetelUrlap');
    const button = imageIn(doc.forms.namedItem('vetelUrlap'), BUY_BUTTON);
    if (!select || !qtyInput || !button) return;
    select.selectedIndex = item.index;
    qtyInput.value = String(Math.max(1, Math.floor(qty)));
    button.click();
  };

  const sellOne = (item: ShopSellItem, qty: number): void => {
    if (item.index === null || !item.sellable) return;
    const select = formSelect(doc, 'eladasUrlap');
    const qtyInput = formQuantity(doc, 'eladasUrlap');
    const button = imageIn(doc.forms.namedItem('eladasUrlap'), SELL_BUTTON);
    if (!select || !qtyInput || !button) return;
    select.selectedIndex = item.index;
    qtyInput.value = String(Math.max(1, Math.min(Math.floor(qty), item.amount)));
    button.click();
  };

  const sellMany = (items: ShopSellItem[]): void => {
    const button = imageIn(doc.getElementById('cuccLayer'), SELL_BUTTON);
    if (!button) return;
    const wanted = new Set(items.map((i) => i.bulkIndex).filter((i): i is number => i !== null));
    if (wanted.size === 0) return;
    // Clicked, not set: each checkbox's own onclick is what flips cuccArray[i],
    // so the box's state and the array the button submits move together.
    for (const entry of readBulkList(doc)) {
      if (entry.enabled && entry.checkbox.checked !== wanted.has(entry.index)) entry.checkbox.click();
    }
    button.click();
  };

  const formButtons = new Set([EXIT_BUTTON, STOW_BUTTON, BUY_BUTTON, SELL_BUTTON, HIDE_BUTTON]);

  return {
    kind: KIND_BY_PAGE[pageType] ?? 'general',
    title: doc.title.trim(),
    gold: parseGold(doc.body.textContent ?? ''),
    narration: extractBuildingNarration(doc),
    buy,
    sell,
    purchase,
    sellOne,
    sellMany,
    actions: {
      exit: extractImageControl(doc, EXIT_BUTTON),
      stowWorn: extractImageControl(doc, STOW_BUTTON),
      other: extractBuildings(doc, (name) => formButtons.has(name)),
    },
    ailments: readAilments(doc),
  };
}

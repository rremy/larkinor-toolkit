// Extraction for the market page (otPiac).
//
// The page publishes its data the same way the Home page does — inline script
// arrays of "label: value" detail blocks — so the parsing is shared with
// homeExtract. What is specific here is the price the market pays: every item in
// the buy form's `melyik` select is labelled with a percentage, e.g.
// "jáspis (170%)", and the market price is the item's own Ár times that. The
// live page bears this out: jáspis is 50 ezüst at 170%, and the standing offer
// is 85.
//
// Actions drive the game's own forms and buttons, never a reconstructed onclick:
//   offer  — set eladasUrlap.hatizsak / mennyiseg / ar, then click `felkinal`
//   revoke — set eladasUrlap.felkinalt, then click `visszavon`
//   buy    — set vetelUrlap.vetel / mennyit, then click `piacvesz`
// Those three game handlers read the select by `selectedIndex` to look up a
// parallel array, so the index is what must be set, not just the value.
//   search — set vetelUrlap.melyik, then click `keresel`
// The search is the exception on both counts: its handler reads the select's
// *value*, and it navigates — the game answers a search by reloading the page
// with the matching offers in `vetelUrlap.vetel`. There is no way to list offers
// for an item without that reload, which is why the UI has to survive one.

import { parseCuccArray, parseCuccDetail, type ParsedDetail } from '@/utils/homeExtract';
import {
  basename,
  extractImageControl,
  extractNarration,
  extractSpecialActions,
  parseGold,
  type Action,
  type BuildingOption,
} from '@/utils/domExtract';

export interface MarketItem extends ParsedDetail {
  /** Position in the backpack select — the offer form's index. */
  index: number;
  /** What the market pays for this item, as a percentage (170 = 170%). */
  pricePercent: number | null;
  /**
   * Price to offer at: the item's Ár scaled by the market percentage, or by
   * DEFAULT_PRICE_PERCENT when the market does not quote the item. Null for items
   * the game gives no price at all (silver, for one).
   */
  suggestedPrice: number | null;
}

export interface MarketListing {
  /** The offer as the game labels it, e.g. "6 db. agyar 700 ezüst/db. áron". */
  label: string;
  /** Position in the offers select — what the revoke handler indexes by. */
  index: number;
  detail: ParsedDetail | null;
  /**
   * What the market pays for this item, as a percentage — the same figure the
   * offerable rows show, so an asking price can be judged against it. Null when
   * the offer's own detail block gave us no name to look up.
   */
  pricePercent: number | null;
  /** Units offered, parsed from the label ("6 db. …"). */
  quantity: number | null;
  /** Asking price per unit, parsed from the label ("… 700 ezüst/db. áron"). */
  unitPrice: number | null;
  /** The item's shop price, for comparison against the asking price. */
  shopPrice: number | null;
  /** What the market pays per unit — what the asking price is competing with. */
  suggestedPrice: number | null;
  revoke: () => void;
}

/** One entry of the market's searchable item catalogue (`vetelUrlap.melyik`). */
export interface MarketCatalogueEntry {
  /**
   * The game's own item id — the option's value, and what the search submits.
   * A string because that is what the form carries; nothing here does arithmetic
   * on it.
   */
  id: string;
  name: string;
  /** What the market pays for it, as a percentage. Null when unlabelled. */
  pricePercent: number | null;
}

/** One standing offer by another player, buyable. */
export interface MarketPurchase {
  /** Position in the offers select — what the buy handler indexes by. */
  index: number;
  /** The offer as the game labels it, e.g. "7 db. jáspis 80 ezüst/db. áron". */
  label: string;
  detail: ParsedDetail | null;
  /** Units on offer. */
  quantity: number | null;
  /** Asking price per unit. */
  unitPrice: number | null;
  /** What the market pays for the item, for judging the asking price. */
  pricePercent: number | null;
  /** The item's shop price, likewise. */
  shopPrice: number | null;
  /** Buys `qty` units of this offer. */
  buy: (qty: number) => void;
}

/** The market page's own buttons, beside the two trading forms. */
export interface MarketActions {
  exit: BuildingOption | null;
  collectMoney: BuildingOption | null;
  settings: BuildingOption | null;
  /** The `specTevUrlap` options — one on the live page ("kilépsz a játékból"). */
  special: Action[];
}

export interface MarketState {
  /** Backpack contents, offerable to the market. */
  items: MarketItem[];
  /** Offers already standing, revocable. */
  listings: MarketListing[];
  /** Offers `qty` of `item` at `price` each. */
  offer: (item: MarketItem, qty: number, price: number) => void;
  /** Every item the market can be searched for. */
  catalogue: MarketCatalogueEntry[];
  /**
   * Searches the market for `entry`. This **navigates**: the game answers a
   * search by reloading the page with the offers in place, so there is no way to
   * list them without leaving the current one.
   */
  search: (entry: MarketCatalogueEntry) => void;
  /**
   * The item the visible offers are for, or null when nothing has been searched.
   * Read from the catalogue select's own selection: the game re-selects the
   * searched item on the page it hands back, so the page states this itself and
   * we need not remember it across the reload.
   */
  searchedName: string | null;
  /** Standing offers for the searched item. */
  purchases: MarketPurchase[];
  actions: MarketActions;
  /** The player's money, for judging what a purchase costs. */
  gold: number;
  /** Backpack load in kg — what a purchase has to fit into. */
  weight: { used: number; max: number };
  /**
   * What the sales have earned and nobody has collected yet, in ezüst — the
   * figure the `penztkap` button hands over. Null when the page did not print
   * the line at all, which is deliberately distinct from zero: zero disables the
   * collect button, and wording we failed to match must not.
   */
  earnings: number | null;
  /**
   * The page's narration. Carried here because the mobile page replaces the
   * market page outright, and this is where the game reports a sale going
   * through ("Megvették a következő cuccaidat…").
   */
  narration: string;
}

const OFFER_BUTTON = 'felkinal';
const REVOKE_BUTTON = 'visszavon';
const SEARCH_BUTTON = 'keresel';
const BUY_BUTTON = 'piacvesz';

/** The inline script defining the market's arrays (or ''). */
function marketScriptText(doc: Document): string {
  return Array.from(doc.querySelectorAll('script:not([src])'))
    .find((s) => /hatizsakTargyak/.test(s.textContent ?? ''))?.textContent ?? '';
}

function imageButtonByBasename(doc: Document, name: string): HTMLInputElement | null {
  return Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="image"]'))
    .find((i) => basename(i.getAttribute('src') ?? '') === name) ?? null;
}

function selectIn(doc: Document, formName: string, fieldName: string): HTMLSelectElement | null {
  const form = doc.forms.namedItem(formName);
  return (form?.elements.namedItem(fieldName) as HTMLSelectElement | null) ?? null;
}

function inputIn(doc: Document, formName: string, fieldName: string): HTMLInputElement | null {
  const form = doc.forms.namedItem(formName);
  return (form?.elements.namedItem(fieldName) as HTMLInputElement | null) ?? null;
}

/**
 * Maps item name to the percentage of its Ár the market pays, read from the buy
 * form's item list ("jáspis (170%)"). Lower-cased keys, since the names in the
 * two lists are not reliably cased the same.
 */
export function parsePricePercents(doc: Document): Map<string, number> {
  const percents = new Map<string, number>();
  for (const entry of extractCatalogue(doc)) {
    if (entry.pricePercent !== null) percents.set(entry.name.toLowerCase(), entry.pricePercent);
  }
  return percents;
}

/**
 * Splits a catalogue label ("jáspis (170%)") into the item's name and the rate.
 * A label without a rate keeps its whole text as the name rather than being
 * dropped: the catalogue is the only list of what the market can be searched
 * for, so an unlabelled entry is still worth searching.
 */
function parseCatalogueLabel(text: string): { name: string; pricePercent: number | null } {
  const match = text.match(/^(.*)\s*\((\d+)%\)\s*$/);
  if (!match) return { name: text.trim(), pricePercent: null };
  return { name: match[1].trim(), pricePercent: Number(match[2]) };
}

/** Every item the market can be searched for, in the page's own order. */
export function extractCatalogue(doc: Document): MarketCatalogueEntry[] {
  const select = selectIn(doc, 'vetelUrlap', 'melyik');
  return Array.from(select?.options ?? []).map((option) => ({
    id: option.value,
    ...parseCatalogueLabel(option.text),
  }));
}

/**
 * Reads one `vetelTargyakInfo` entry — "itemId,unitPrice,quantity,offerId". The
 * offer's own numbers, so they are preferred over parsing them back out of the
 * game's prose label; the label stays the fallback for an entry the array is
 * missing.
 */
function parsePurchaseInfo(raw: string | undefined): { quantity: number | null; unitPrice: number | null } {
  const parts = (raw ?? '').split(',');
  if (parts.length < 3) return { quantity: null, unitPrice: null };
  const num = (part: string): number | null => {
    const n = parseInt(part.trim(), 10);
    return Number.isFinite(n) ? n : null;
  };
  return { unitPrice: num(parts[1]), quantity: num(parts[2]) };
}

/**
 * Uncollected sale earnings, from the line the market prints in its own
 * positioned div beside the collect button: "7810\nezüstöt kerestél az
 * eladásokból". Measured live, collecting does not remove that line — it leaves
 * it printing 0 — so zero is a state the page states outright rather than one we
 * infer from the line's absence. A missing line therefore means we did not
 * recognise the page, and yields null.
 */
function parseEarnings(text: string): number | null {
  const m = text.match(/(\d[\d \t\u00a0]*)\s*ezüstöt kerestél/);
  if (!m) return null;
  const digits = m[1].replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : null;
}

/**
 * Backpack load in kg, as the market page prints it ("Remy hátizsákjában
 * 43.5953/114.2 kg tömegű tárgy van"). The Home page words the same figure with
 * "és testén", so both spellings are accepted.
 */
function parseWeight(text: string): { used: number; max: number } {
  const m = text.match(/hátizsákjában(?:\s+és testén)?\s*([\d.]+)\s*\/\s*([\d.]+)\s*kg/);
  return { used: m ? parseFloat(m[1]) : 0, max: m ? parseFloat(m[2]) : 0 };
}

/**
 * Rate assumed for an item the market does not quote. The plain Ár (i.e. 100%)
 * was a poor default: the quoted rates on the live page run from 50% to 2500%,
 * so an unquoted item is far likelier to be worth a multiple of its shop price
 * than exactly it. Deliberately a guess, and marked as one in the UI.
 */
export const DEFAULT_PRICE_PERCENT = 500;

/**
 * Ár scaled by the market percentage, rounded to whole silver. Unquoted items
 * fall back to DEFAULT_PRICE_PERCENT; an item the game gives no price at all
 * cannot be priced.
 */
export function suggestPrice(price: number | null, percent: number | null): number | null {
  if (price === null) return null;
  return Math.round((price * (percent ?? DEFAULT_PRICE_PERCENT)) / 100);
}

/**
 * Reads the quantity and asking price out of an offer's label, which the game
 * formats as "6 db. agyar 700 ezüst/db. áron". Both null if it does not match —
 * the label is the game's prose, so it is not worth trusting blindly.
 */
export function parseOfferLabel(label: string): { quantity: number | null; unitPrice: number | null } {
  const match = label.match(/^\s*([\d\s]+)\s*db\.\s*.*?\s([\d\s]+)\s*ezüst\/db/);
  if (!match) return { quantity: null, unitPrice: null };
  const digits = (raw: string) => {
    const n = parseInt(raw.replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  };
  return { quantity: digits(match[1]), unitPrice: digits(match[2]) };
}

export function extractMarket(doc: Document): MarketState {
  const scriptText = marketScriptText(doc);
  const percents = parsePricePercents(doc);

  const items: MarketItem[] = [];
  parseCuccArray(scriptText, 'hatizsakTargyak').forEach((raw, index) => {
    if (raw === undefined) return; // array holes
    const detail = parseCuccDetail(raw);
    const pricePercent = percents.get(detail.name.toLowerCase()) ?? null;
    items.push({
      index,
      ...detail,
      pricePercent,
      suggestedPrice: suggestPrice(detail.price, pricePercent),
    });
  });

  const offerSelect = selectIn(doc, 'eladasUrlap', 'felkinalt');
  const details = parseCuccArray(scriptText, 'felkinaltTargyak');
  const listings: MarketListing[] = Array.from(offerSelect?.options ?? []).map((option, index) => {
    const detail = details[index] !== undefined ? parseCuccDetail(details[index]) : null;
    const label = option.text.trim();
    const pricePercent = detail ? percents.get(detail.name.toLowerCase()) ?? null : null;
    const { quantity, unitPrice } = parseOfferLabel(label);
    return {
      label,
      index,
      detail,
      pricePercent,
      quantity: quantity ?? detail?.amount ?? null,
      unitPrice,
      shopPrice: detail?.price ?? null,
      suggestedPrice: suggestPrice(detail?.price ?? null, pricePercent),
      revoke: () => {
        const select = selectIn(doc, 'eladasUrlap', 'felkinalt');
        const button = imageButtonByBasename(doc, REVOKE_BUTTON);
        if (!select || !button) return;
        select.selectedIndex = index;
        button.click();
      },
    };
  });

  const offer = (item: MarketItem, qty: number, price: number): void => {
    const select = selectIn(doc, 'eladasUrlap', 'hatizsak');
    const qtyInput = inputIn(doc, 'eladasUrlap', 'mennyiseg');
    const priceInput = inputIn(doc, 'eladasUrlap', 'ar');
    const button = imageButtonByBasename(doc, OFFER_BUTTON);
    if (!select || !qtyInput || !priceInput || !button) return;

    select.selectedIndex = item.index;
    qtyInput.value = String(Math.max(1, Math.min(qty, item.amount)));
    priceInput.value = String(Math.max(1, Math.round(price)));
    button.click();
  };

  const catalogue = extractCatalogue(doc);

  const search = (entry: MarketCatalogueEntry): void => {
    const select = selectIn(doc, 'vetelUrlap', 'melyik');
    const button = imageButtonByBasename(doc, SEARCH_BUTTON);
    if (!select || !button) return;
    // The search handler reads `melyik.value`, unlike the offer and revoke
    // handlers which index parallel arrays — so here the value is what counts.
    select.value = entry.id;
    button.click();
  };

  const searchSelect = selectIn(doc, 'vetelUrlap', 'melyik');
  const searchedOption = searchSelect?.selectedIndex !== undefined && searchSelect.selectedIndex >= 0
    ? searchSelect.options[searchSelect.selectedIndex]
    : undefined;
  const searchedName = searchedOption ? parseCatalogueLabel(searchedOption.text).name : null;

  const buySelect = selectIn(doc, 'vetelUrlap', 'vetel');
  const buyDetails = parseCuccArray(scriptText, 'vetelTargyak');
  const buyInfo = parseCuccArray(scriptText, 'vetelTargyakInfo');
  const purchases: MarketPurchase[] = Array.from(buySelect?.options ?? []).map((option, index) => {
    const detail = buyDetails[index] !== undefined ? parseCuccDetail(buyDetails[index]) : null;
    const label = option.text.trim();
    const info = parsePurchaseInfo(buyInfo[index]);
    const fromLabel = parseOfferLabel(label);
    return {
      index,
      label,
      detail,
      quantity: info.quantity ?? fromLabel.quantity,
      unitPrice: info.unitPrice ?? fromLabel.unitPrice,
      pricePercent: detail ? percents.get(detail.name.toLowerCase()) ?? null : null,
      shopPrice: detail?.price ?? null,
      buy: (qty: number) => {
        const select = selectIn(doc, 'vetelUrlap', 'vetel');
        const qtyInput = inputIn(doc, 'vetelUrlap', 'mennyit');
        const button = imageButtonByBasename(doc, BUY_BUTTON);
        if (!select || !qtyInput || !button) return;
        // Like the revoke handler, the game's buy handler looks the offer up in
        // vetelTargyakInfo by selectedIndex.
        select.selectedIndex = index;
        const stock = info.quantity ?? fromLabel.quantity;
        qtyInput.value = String(Math.max(1, stock === null ? qty : Math.min(qty, stock)));
        button.click();
      },
    };
  });

  const bodyText = doc.body.textContent ?? '';

  return {
    items,
    listings,
    offer,
    catalogue,
    search,
    searchedName,
    purchases,
    actions: {
      exit: extractImageControl(doc, 'vissza'),
      collectMoney: extractImageControl(doc, 'penztkap'),
      settings: extractImageControl(doc, 'klap'),
      special: extractSpecialActions(doc),
    },
    gold: parseGold(bodyText),
    weight: parseWeight(bodyText),
    earnings: parseEarnings(bodyText),
    narration: extractNarration(doc),
  };
}

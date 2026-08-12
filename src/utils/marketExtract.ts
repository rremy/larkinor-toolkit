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
// Both game handlers read the select by `selectedIndex` to look up a parallel
// array, so the index is what must be set, not just the value.

import { parseCuccArray, parseCuccDetail, type ParsedDetail } from '@/utils/homeExtract';
import { basename } from '@/utils/domExtract';

export interface MarketItem extends ParsedDetail {
  /** Position in the backpack select — the offer form's index. */
  index: number;
  /** What the market pays for this item, as a percentage (170 = 170%). */
  pricePercent: number | null;
  /**
   * Price to offer at: the item's Ár scaled by the market percentage. Falls back
   * to the plain Ár when the item is absent from the percentage table, and is
   * null for items the game gives no price at all (silver, for one).
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
  revoke: () => void;
}

export interface MarketState {
  /** Backpack contents, offerable to the market. */
  items: MarketItem[];
  /** Offers already standing, revocable. */
  listings: MarketListing[];
  /** Offers `qty` of `item` at `price` each. */
  offer: (item: MarketItem, qty: number, price: number) => void;
}

const OFFER_BUTTON = 'felkinal';
const REVOKE_BUTTON = 'visszavon';

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
  const select = selectIn(doc, 'vetelUrlap', 'melyik');
  if (!select) return percents;

  for (const option of Array.from(select.options)) {
    const match = option.text.match(/^(.*)\s*\((\d+)%\)\s*$/);
    if (!match) continue;
    percents.set(match[1].trim().toLowerCase(), Number(match[2]));
  }
  return percents;
}

/** Ár scaled by the market percentage, rounded to whole silver. */
export function suggestPrice(price: number | null, percent: number | null): number | null {
  if (price === null) return null;
  if (percent === null) return price;
  return Math.round((price * percent) / 100);
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
    return {
      label: option.text.trim(),
      index,
      detail,
      pricePercent: detail ? percents.get(detail.name.toLowerCase()) ?? null : null,
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

  return { items, listings, offer };
}

// Capturing what the player owns from the pages that list it.
//
// Shared by both boots and injected with its reader and writer (like
// captureLoadout), so the capture is testable without GM_* and the two boots
// cannot drift.
//
// A location is only taken from a page that lists it whole, because each
// capture replaces the location outright: a partial list would read as having
// sold the rest. So the backpack comes from the character sheet, home, the
// shops' sell list and the crafting halls' ingredient list — each prints every
// stack carried — but not from the market, whose *Felkínálható* list is what
// may be offered rather than what is carried.

import { PageType } from '@/utils/pageDetector';
import { extractCharacterPage } from '@/utils/characterPageExtract';
import { extractHome } from '@/utils/homeExtract';
import { extractMarket } from '@/utils/marketExtract';
import { extractShop } from '@/utils/shopExtract';
import { extractCraftingHall } from '@/utils/craftingExtract';
import { INVENTORY_PREF_KEY } from '@/shared/prefKeys';
import {
  parseInventory,
  recordLocations,
  serializeInventory,
  type InventoryEntry,
  type PageInventory,
} from '@/shared/inventory';

/** Silver is listed like an item on every one of these pages, but it is money. */
const SILVER = 'ezüst';

/** The item name in a market offer's label, `"6 db. agyar 700 ezüst/db. áron"`. */
const OFFER_NAME = /^\s*[\d\s]+db\.\s*(.+?)\s+[\d\s]+ezüst\/db/;

function entries(items: Array<{ id?: string | null; name: string; quantity: number }>): InventoryEntry[] {
  return items
    .filter((item) => item.name.trim().toLowerCase() !== SILVER && item.quantity > 0)
    .map((item) => ({ id: item.id ?? null, name: item.name, quantity: item.quantity }));
}

/** What this page lists, by location; null when it lists nothing we record. */
export function readPageInventory(pageType: PageType, doc: Document): PageInventory | null {
  switch (pageType) {
    case PageType.Character:
      return { backpack: entries(extractCharacterPage(doc).backpack.map((i) => ({ id: i.id, name: i.name, quantity: i.amount }))) };
    case PageType.Home: {
      const home = extractHome(doc);
      return {
        house: entries(home.house.items.map((i) => ({ name: i.name, quantity: i.amount }))),
        backpack: entries(home.backpack.items.map((i) => ({ name: i.name, quantity: i.amount }))),
      };
    }
    case PageType.Market: {
      const offers = extractMarket(doc).listings.flatMap((listing) => {
        const name = listing.detail?.name ?? OFFER_NAME.exec(listing.label)?.[1];
        return name && listing.quantity !== null ? [{ name, quantity: listing.quantity }] : [];
      });
      return { market: entries(offers) };
    }
    case PageType.Shop:
      return { backpack: entries(extractShop(doc).sell.map((i) => ({ id: i.id, name: i.name, quantity: i.amount }))) };
    case PageType.ForgeHall:
    case PageType.MageHall: {
      const hall = extractCraftingHall(doc);
      return hall ? { backpack: entries(hall.options.map((o) => ({ id: o.id, name: o.name, quantity: o.count }))) } : null;
    }
    default:
      return null;
  }
}

/**
 * Records what this page lists, keeping every location it does not. Returns
 * whether anything was written. Never throws: an unreadable page costs this
 * capture, not the boot.
 */
export function captureInventory(
  pageType: PageType,
  doc: Document,
  read: (key: string) => string | null,
  write: (key: string, value: string) => void,
  now: number = Date.now(),
): boolean {
  try {
    const page = readPageInventory(pageType, doc);
    if (!page) return false;
    const inventory = recordLocations(parseInventory(read(INVENTORY_PREF_KEY)), page, now);
    write(INVENTORY_PREF_KEY, serializeInventory(inventory));
    return true;
  } catch (err) {
    console.warn('[Larkinor UI] Inventory capture failed:', err);
    return false;
  }
}

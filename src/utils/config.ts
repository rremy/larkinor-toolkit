// Persistent local UI config, stored via ViolentMonkey's GM storage (the same
// mechanism used for the remembered login name). Survives across page loads and
// the loader/eval boundary. Keys about one character are stored per character —
// see "Per-character storage" below.

import type { Platform } from '@/utils/platform';
import {
  ACTIVE_ROYAL_QUEST_PREF_KEY,
  QUEST_MOVE_PREF_KEY,
  QUEST_POSITION_PREF_KEY,
  INVENTORY_PREF_KEY,
  MAP_POSITION_PREF_KEY,
  SEA_POSITION_PREF_KEY,
  SEA_MOVE_PREF_KEY,
  QUEST_SET_PREF_KEY,
  QUEST_TILE_PREF_KEY,
} from '@/shared/prefKeys';
import { LOADOUT_PREF_KEY, parseLoadout, type Loadout } from '@/shared/loadout';

/** GM storage key holding the JSON array of enabled hotkey tevFajta values. */
export const ENABLED_HOTKEYS_KEY = 'lc-enabled-hotkeys';

/** The tevFajta values the user has enabled as free-move hotkey icons. */
export function getEnabledHotkeys(): string[] {
  const raw = gmGet(ENABLED_HOTKEYS_KEY);
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

export function setEnabledHotkeys(keys: string[]): void {
  gmSet(ENABLED_HOTKEYS_KEY, JSON.stringify(keys));
}

/** GM storage key holding whether the desktop keyboard shortcuts are on. */
export const KEYBOARD_SHORTCUTS_KEY = 'lc-keyboard-shortcuts';

/**
 * Whether the desktop keyboard shortcuts are on. On unless turned off: they
 * shipped always-on, so a player who never opens the setting keeps them.
 */
export function getKeyboardShortcuts(): boolean {
  return gmGet(KEYBOARD_SHORTCUTS_KEY) !== 'off';
}

export function setKeyboardShortcuts(on: boolean): void {
  gmSet(KEYBOARD_SHORTCUTS_KEY, on ? '' : 'off');
}

/** GM storage key holding the manual mobile/desktop override ('' = automatic). */
export const PLATFORM_OVERRIDE_KEY = 'lc-platform-override';

/** GM storage key holding the desktop dock's collapsed flag. */
export const DOCK_COLLAPSED_KEY = 'lc-dock-collapsed';

/** GM storage key holding the database panel's minimised flag. */
export const DB_MINIMIZED_KEY = 'lc-db-minimized';

/** GM storage key holding whether the database panel is open. */
export const DB_OPEN_KEY = 'lc-db-open';

/** GM storage key holding the database panel's last route ('' = none stored). */
export const DB_ROUTE_KEY = 'lc-db-route';

/**
 * GM storage key holding the quest maze's last selected zoom (tile size).
 * Re-exported from the shared, GM-free `prefKeys` module rather than defined
 * here, so this one definition is also what `QuestView` (which ships in the
 * standalone bundle too) reads and writes through its own PrefStore — see
 * `prefKeys.ts` for why the key needs a single source of truth.
 */
export const QUEST_TILE_KEY = QUEST_TILE_PREF_KEY;

/** GM storage key holding the inventory panel's minimised flag. */
export const INVENTORY_MINIMIZED_KEY = 'lc-inventory-minimized';

/** GM storage key holding whether the inventory panel is open. */
export const INVENTORY_OPEN_KEY = 'lc-inventory-open';

/** GM storage keys for the market panel's minimised and open flags. */
export const MARKET_MINIMIZED_KEY = 'lc-market-minimized';
export const MARKET_OPEN_KEY = 'lc-market-open';

/** GM storage keys for the crafting panel's minimised and open flags. */
export const CRAFTING_MINIMIZED_KEY = 'lc-crafting-minimized';
export const CRAFTING_OPEN_KEY = 'lc-crafting-open';

/** GM storage key holding the market view's last selected tab. */
export const MARKET_TAB_KEY = 'lc-market-tab';

/**
 * The market tabs, in one vocabulary for both platforms. Mobile shows all four;
 * desktop groups the three selling tabs behind its own Eladás tab, so a player
 * switching between phone and desktop keeps a consistent place either way.
 */
export type MarketTab = 'offer' | 'listings' | 'buy' | 'other';

const MARKET_TABS: MarketTab[] = ['offer', 'listings', 'buy', 'other'];

/**
 * The tab the market was last left on, or null when there is none stored.
 *
 * Remembered because the game answers a purchase search by reloading the whole
 * page: without this, every search would hand the player back the selling tab
 * and hide the offers it had just fetched. A value we do not recognise is
 * treated as none, so a stale or hand-edited key degrades to the default tab.
 */
export function getMarketTab(): MarketTab | null {
  const raw = gmGet(MARKET_TAB_KEY);
  return MARKET_TABS.includes(raw as MarketTab) ? (raw as MarketTab) : null;
}

export function setMarketTab(tab: MarketTab): void {
  gmSet(MARKET_TAB_KEY, tab);
}

export const CHARACTER_MINIMIZED_KEY = 'lc-character-minimized';
export const CHARACTER_OPEN_KEY = 'lc-character-open';

export const SHOP_MINIMIZED_KEY = 'lc-shop-minimized';
export const SHOP_OPEN_KEY = 'lc-shop-open';

/** GM storage key holding the shop view's last selected tab. */
export const SHOP_TAB_KEY = 'lc-shop-tab';

/**
 * The shop tabs, shared by every shop and both platforms. Desktop shows only the
 * first two (the page's other controls stay on the visible game page), and the
 * Templom has no `sell`: a stored tab a view does not offer falls back to `buy`.
 */
export type ShopTab = 'buy' | 'sell' | 'other';

const SHOP_TABS: ShopTab[] = ['buy', 'sell', 'other'];

/**
 * The tab the shop was last left on, or null when none is stored. Remembered for
 * the market's reason: every purchase and sale reloads the page, and landing back
 * on the buy tab after each sale would make selling a stack of rows a chore.
 */
export function getShopTab(): ShopTab | null {
  const raw = gmGet(SHOP_TAB_KEY);
  return SHOP_TABS.includes(raw as ShopTab) ? (raw as ShopTab) : null;
}

export function setShopTab(tab: ShopTab): void {
  gmSet(SHOP_TAB_KEY, tab);
}

/** GM storage key holding the character page's last selected tab. */
export const CHARACTER_TAB_KEY = 'lc-character-tab';

export type CharacterTab = 'overview' | 'backpack' | 'settings';

const CHARACTER_TABS: CharacterTab[] = ['overview', 'backpack', 'settings'];

/**
 * The tab the character page was last left on — remembered because equipping,
 * dropping and saving each reload the page, and landing back on the overview
 * after every item moved would make sorting a backpack a chore.
 */
export function getCharacterTab(): CharacterTab | null {
  const raw = gmGet(CHARACTER_TAB_KEY);
  return CHARACTER_TABS.includes(raw as CharacterTab) ? (raw as CharacterTab) : null;
}

export function setCharacterTab(tab: CharacterTab): void {
  gmSet(CHARACTER_TAB_KEY, tab);
}

/**
 * The user's manual platform choice, or null for automatic detection. Values
 * other than the two known platforms are treated as "no override" so a stale or
 * hand-edited key degrades to auto-detection rather than a broken UI.
 */
export function getPlatformOverride(): Platform | null {
  const raw = gmGet(PLATFORM_OVERRIDE_KEY);
  return raw === 'mobile' || raw === 'desktop' ? raw : null;
}

export function setPlatformOverride(value: Platform | null): void {
  gmSet(PLATFORM_OVERRIDE_KEY, value ?? '');
}

/** Whether the desktop dock is collapsed to its handle. */
export function getDockCollapsed(): boolean {
  return gmGet(DOCK_COLLAPSED_KEY) === 'true';
}

export function setDockCollapsed(value: boolean): void {
  gmSet(DOCK_COLLAPSED_KEY, value ? 'true' : '');
}

/**
 * Whether a docked panel opens minimised — beside the game rather than covering
 * the page. Remembered across page loads, so the choice survives every
 * navigation the game makes. Keyed per panel, so the database and the inventory
 * remember independently.
 */
export function getPanelMinimized(key: string): boolean {
  return gmGet(key) === 'true';
}

export function setPanelMinimized(key: string, value: boolean): void {
  gmSet(key, value ? 'true' : '');
}

/**
 * Whether a panel is open. Persisted because the game navigates on every action:
 * moving an item reloads the page, which would otherwise close the very panel
 * the move was made from and force it to be reopened each time.
 */
export function getPanelOpen(key: string): boolean {
  return gmGet(key) === 'true';
}

export function setPanelOpen(key: string, value: boolean): void {
  gmSet(key, value ? 'true' : '');
}

/**
 * The database panel's last route, as the `tab[/id]` string `DatabaseApp`
 * serialises — or null when nothing is stored.
 *
 * Remembered alongside the open flag because restoring the panel without its
 * route would drop the user back on the default tab: they minimise the database
 * on the map, move, and the reload hands them the weapons list. The value is
 * opaque here on purpose; only `DatabaseApp` knows how to read it, and an
 * unparseable one degrades to its default route.
 */
export function getDbRoute(): string | null {
  return gmGet(DB_ROUTE_KEY) || null;
}

export function setDbRoute(route: string): void {
  gmSet(DB_ROUTE_KEY, route);
}

// ---------------------------------------------------------------------------
// Per-character storage
//
// One browser often plays several characters, side by side in tabs. Whatever
// describes a character — the gear they wear, the quest they are on, where they
// stand in a labyrinth, which panel their tab had open — is stored under the key
// suffixed with the page's login name (`lc-loadout@remy`), so one character's
// state never shows up on another's pages. What describes the game, the device
// or the player's taste (market rates, platform, sort orders, zoom) stays shared.
//
// The login name is read off each page (`readLoginName`), never stored as "the
// current character": two tabs would overwrite each other's.
// ---------------------------------------------------------------------------

/**
 * Shared GM key naming the character that inherits the quest progress stored
 * before storage was split per character: the first one seen afterwards.
 */
export const LEGACY_OWNER_KEY = 'lc-legacy-owner';

/** Keys stored per character. Families of keys are matched by prefix below. */
const CHARACTER_KEYS: ReadonlySet<string> = new Set([
  LOADOUT_PREF_KEY,
  INVENTORY_PREF_KEY,
  ACTIVE_ROYAL_QUEST_PREF_KEY,
  QUEST_POSITION_PREF_KEY,
  QUEST_MOVE_PREF_KEY,
  QUEST_SET_PREF_KEY,
  MAP_POSITION_PREF_KEY,
  SEA_POSITION_PREF_KEY,
  SEA_MOVE_PREF_KEY,
  ENABLED_HOTKEYS_KEY,
  DB_OPEN_KEY,
  INVENTORY_OPEN_KEY,
  MARKET_OPEN_KEY,
  CRAFTING_OPEN_KEY,
  CHARACTER_OPEN_KEY,
  SHOP_OPEN_KEY,
  DB_ROUTE_KEY,
  MARKET_TAB_KEY,
  SHOP_TAB_KEY,
  CHARACTER_TAB_KEY,
]);

/**
 * Prefixes of the per-character key families built in `prefKeys.ts`: the quest
 * selected per set, quest progress, the recipe per hall, the explorer filters
 * (a level filter suits one character and not the next).
 */
const CHARACTER_KEY_PREFIXES = [
  'lc-quest-selected-',
  'lc-quest-cleared-',
  'lc-quest-hidden-locks-',
  'lc-craft-selected-',
  'lc-explorer-filters-',
];

/**
 * Per-character keys the legacy owner keeps reading from their shared,
 * pre-split value until writing their own. Only progress: everything else is
 * rebuilt by visiting a page (the loadout by the character sheet, a position by
 * the next step), so adopting it would only risk showing another character's.
 */
const LEGACY_PROGRESS_PREFIXES = ['lc-quest-cleared-', 'lc-quest-hidden-locks-'];

/**
 * The login name this page belongs to; null when the page names none, and
 * undefined until the entry point has looked. Undefined leaves every key as
 * written, which is the state unit tests run in.
 */
let character: string | null | undefined;

/**
 * Sets whose storage this page reads and writes. Called once by the entry
 * point, before either boot; null (a page naming no character, such as the
 * login page) makes every per-character key read empty and drop its writes.
 */
export function setCharacter(login: string | null): void {
  character = login;
  if (login !== null && !GM_getValue<string>(LEGACY_OWNER_KEY, '')) GM_setValue(LEGACY_OWNER_KEY, login);
}

/** Whether `key` is stored per character rather than shared. */
export function isCharacterKey(key: string): boolean {
  return CHARACTER_KEYS.has(key) || CHARACTER_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** The GM key `key` is stored under on this page, or null when it cannot be stored here. */
function storageKey(key: string): string | null {
  if (character === undefined || !isCharacterKey(key)) return key;
  return character === null ? null : `${key}@${character}`;
}

/** Reads a stored string, '' when absent. */
function gmGet(key: string): string {
  const stored = storageKey(key);
  if (stored === null) return '';
  // Absent is told apart from '' so a reset written as '' is never undone by
  // falling back to the legacy value.
  const value = GM_getValue<string | null>(stored, null);
  if (value !== null) return value;
  const legacyOwner = stored !== key && GM_getValue<string>(LEGACY_OWNER_KEY, '') === character;
  return legacyOwner && LEGACY_PROGRESS_PREFIXES.some((prefix) => key.startsWith(prefix))
    ? GM_getValue<string>(key, '')
    : '';
}

function gmSet(key: string, value: string): void {
  const stored = storageKey(key);
  if (stored !== null) GM_setValue(stored, value);
}

/**
 * Generic keyed string preference storage — backs a GM `PrefStore` (see its
 * doc comment in `src/database/DatabaseApp.tsx`) for any DatabaseApp-hosted
 * view that wants to remember something across the reload the game performs
 * on every action. Generic like `getPanelOpen`/`setPanelOpen` above, rather
 * than a dedicated getter/setter pair per preference: `QUEST_TILE_KEY` is the
 * first key stored this way, but not expected to be the last.
 */
export function getPref(key: string): string | null {
  return gmGet(key) || null;
}

export function setPref(key: string, value: string): void {
  gmSet(key, value);
}

/**
 * The stored loadout, or null when nothing usable is stored. The read side of
 * `captureLoadout` — every compare surface goes through this.
 */
export function readLoadout(): Loadout | null {
  return parseLoadout(getPref(LOADOUT_PREF_KEY));
}

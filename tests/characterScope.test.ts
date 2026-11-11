import { describe, expect, it } from 'vitest';
import {
  CHARACTER_OPEN_KEY,
  CHARACTER_TAB_KEY,
  CRAFTING_OPEN_KEY,
  DB_MINIMIZED_KEY,
  DB_OPEN_KEY,
  DB_ROUTE_KEY,
  DOCK_COLLAPSED_KEY,
  ENABLED_HOTKEYS_KEY,
  INVENTORY_OPEN_KEY,
  KEYBOARD_SHORTCUTS_KEY,
  LEGACY_OWNER_KEY,
  MARKET_OPEN_KEY,
  MARKET_TAB_KEY,
  PLATFORM_OVERRIDE_KEY,
  SHOP_OPEN_KEY,
  SHOP_TAB_KEY,
  getEnabledHotkeys,
  getPanelOpen,
  getPref,
  isCharacterKey,
  readLoadout,
  setCharacter,
  setEnabledHotkeys,
  setPanelOpen,
  setPref,
} from '../src/utils/config';
import { readLoginName } from '../src/utils/domExtract';
import {
  ACTIVE_ROYAL_QUEST_PREF_KEY,
  INVENTORY_PREF_KEY,
  LOADOUT_PREF_KEY,
  MAP_MODE_PREF_KEY,
  MINIMAP_HIDDEN_PREF_KEY,
  MAP_POSITION_PREF_KEY,
  MARKET_RATES_PREF_KEY,
  QUEST_DETAILS_PREF_KEY,
  QUEST_MOVE_PREF_KEY,
  QUEST_POSITION_PREF_KEY,
  QUEST_SET_PREF_KEY,
  QUEST_TILE_PREF_KEY,
  SEA_LEARNED_TILES_PREF_KEY,
  SEA_MOVE_PREF_KEY,
  SEA_POSITION_PREF_KEY,
  craftSelectedKey,
  explorerFiltersKey,
  explorerSortKey,
  questClearedKey,
  questHiddenLocksKey,
  questSelectedKey,
} from '../src/shared/prefKeys';
import { sortPrefKey } from '../src/hooks/useStoredSort';

function docWith(html: string): Document {
  return new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html');
}

describe('readLoginName', () => {
  it('reads the logged-in account off the shared form, lower-cased', () => {
    const doc = docWith('<form name="urlap"><input type="hidden" name="loginname" value="Remy"></form>');
    expect(readLoginName(doc)).toBe('remy');
  });

  it('ignores the login page’s own text field — nobody is logged in there yet', () => {
    const doc = docWith('<form><input type="text" name="loginname" value="typed"></form>');
    expect(readLoginName(doc)).toBeNull();
  });

  it('is null when the page carries no name, or an empty one', () => {
    expect(readLoginName(docWith('<p>nothing</p>'))).toBeNull();
    expect(readLoginName(docWith('<input type="hidden" name="loginname" value="  ">'))).toBeNull();
  });
});

describe('isCharacterKey', () => {
  it.each([
    LOADOUT_PREF_KEY,
    ACTIVE_ROYAL_QUEST_PREF_KEY,
    QUEST_POSITION_PREF_KEY,
    QUEST_MOVE_PREF_KEY,
    QUEST_SET_PREF_KEY,
    MAP_POSITION_PREF_KEY,
    SEA_POSITION_PREF_KEY,
    SEA_MOVE_PREF_KEY,
    INVENTORY_PREF_KEY,
    questSelectedKey('royal'),
    questSelectedKey('tavern'),
    questClearedKey('royal', '39'),
    questHiddenLocksKey('tavern', 'GY.I.K'),
    ENABLED_HOTKEYS_KEY,
    craftSelectedKey('forge'),
    craftSelectedKey('mage'),
    explorerFiltersKey('weapons'),
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
  ])('keeps %s per character', (key) => {
    expect(isCharacterKey(key)).toBe(true);
  });

  it.each([
    MARKET_RATES_PREF_KEY,
    PLATFORM_OVERRIDE_KEY,
    KEYBOARD_SHORTCUTS_KEY,
    DOCK_COLLAPSED_KEY,
    DB_MINIMIZED_KEY,
    QUEST_TILE_PREF_KEY,
    QUEST_DETAILS_PREF_KEY,
    explorerSortKey('weapons'),
    sortPrefKey('shop-sell'),
    LEGACY_OWNER_KEY,
    SEA_LEARNED_TILES_PREF_KEY,
    MAP_MODE_PREF_KEY,
    MINIMAP_HIDDEN_PREF_KEY,
  ])('shares %s between characters', (key) => {
    expect(isCharacterKey(key)).toBe(false);
  });
});

describe('character-scoped storage', () => {
  it('keeps one character’s value out of another’s view', () => {
    setCharacter('anna');
    setPref(LOADOUT_PREF_KEY, '{"anna":true}');
    setCharacter('bela');
    expect(getPref(LOADOUT_PREF_KEY)).toBeNull();
    setPref(LOADOUT_PREF_KEY, '{"bela":true}');
    setCharacter('anna');
    expect(getPref(LOADOUT_PREF_KEY)).toBe('{"anna":true}');
  });

  it('stores under the key suffixed with the login name', () => {
    setCharacter('anna');
    setPanelOpen(DB_OPEN_KEY, true);
    expect(GM_getValue(`${DB_OPEN_KEY}@anna`, null)).toBe('true');
    expect(getPanelOpen(DB_OPEN_KEY)).toBe(true);
  });

  it('routes the typed accessors through the same scope', () => {
    setCharacter('anna');
    setEnabledHotkeys(['as']);
    setCharacter('bela');
    expect(getEnabledHotkeys()).toEqual([]);
  });

  it('shares a shared key between characters', () => {
    setCharacter('anna');
    setPref(MARKET_RATES_PREF_KEY, '{"338":3000}');
    setCharacter('bela');
    expect(getPref(MARKET_RATES_PREF_KEY)).toBe('{"338":3000}');
  });

  it('reads nothing and writes nothing for a page that names no character', () => {
    setCharacter('anna');
    setPref(QUEST_POSITION_PREF_KEY, 'anna-pos');
    setCharacter(null);
    expect(getPref(QUEST_POSITION_PREF_KEY)).toBeNull();
    expect(readLoadout()).toBeNull();
    setPref(QUEST_POSITION_PREF_KEY, 'nobody');
    expect(GM_getValue(QUEST_POSITION_PREF_KEY, null)).not.toBe('nobody');
    setCharacter('anna');
    expect(getPref(QUEST_POSITION_PREF_KEY)).toBe('anna-pos');
  });
});

describe('legacy quest progress', () => {
  const cleared = questClearedKey('royal', '5');
  const hidden = questHiddenLocksKey('royal', '5');

  it('goes to the first character seen, who reads it until writing their own', () => {
    GM_setValue(LEGACY_OWNER_KEY, '');
    GM_setValue(cleared, '["0,1"]');
    GM_setValue(hidden, '["vas"]');
    setCharacter('dora');
    expect(getPref(cleared)).toBe('["0,1"]');
    expect(getPref(hidden)).toBe('["vas"]');
    setPref(cleared, '["0,1","0,2"]');
    expect(getPref(cleared)).toBe('["0,1","0,2"]');
  });

  it('stays with that character: a later one starts clean', () => {
    GM_setValue(LEGACY_OWNER_KEY, '');
    GM_setValue(cleared, '["0,1"]');
    setCharacter('emil');
    setCharacter('feri');
    expect(getPref(cleared)).toBeNull();
  });

  it('is not brought back by the owner resetting their progress', () => {
    GM_setValue(LEGACY_OWNER_KEY, '');
    GM_setValue(cleared, '["0,1"]');
    setCharacter('gabi');
    setPref(cleared, '');
    expect(getPref(cleared)).toBeNull();
  });

  it('covers progress only — the old loadout is never adopted', () => {
    GM_setValue(LEGACY_OWNER_KEY, '');
    GM_setValue(LOADOUT_PREF_KEY, '{"old":true}');
    setCharacter('hedi');
    expect(getPref(LOADOUT_PREF_KEY)).toBeNull();
  });
});

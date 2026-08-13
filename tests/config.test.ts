import { describe, it, expect } from 'vitest';
import {
  getEnabledHotkeys,
  setEnabledHotkeys,
  ENABLED_HOTKEYS_KEY,
  getPlatformOverride,
  setPlatformOverride,
  PLATFORM_OVERRIDE_KEY,
  getDockCollapsed,
  setDockCollapsed,
  DOCK_COLLAPSED_KEY,
  getDbRoute,
  setDbRoute,
  DB_ROUTE_KEY,
  getPref,
  setPref,
  QUEST_TILE_KEY,
} from '../src/utils/config';

describe('enabled-hotkeys config', () => {
  it('returns an empty list when nothing is stored', () => {
    GM_setValue(ENABLED_HOTKEYS_KEY, '');
    expect(getEnabledHotkeys()).toEqual([]);
  });

  it('round-trips the enabled set through GM storage', () => {
    setEnabledHotkeys(['kajal', 'vargyogy']);
    expect(getEnabledHotkeys()).toEqual(['kajal', 'vargyogy']);
  });

  it('returns an empty list when storage is corrupt', () => {
    GM_setValue(ENABLED_HOTKEYS_KEY, 'not json');
    expect(getEnabledHotkeys()).toEqual([]);
  });
});

describe('platform-override config', () => {
  it('returns null when nothing is stored', () => {
    GM_setValue(PLATFORM_OVERRIDE_KEY, '');
    expect(getPlatformOverride()).toBeNull();
  });

  it('round-trips each platform through GM storage', () => {
    setPlatformOverride('desktop');
    expect(getPlatformOverride()).toBe('desktop');
    setPlatformOverride('mobile');
    expect(getPlatformOverride()).toBe('mobile');
  });

  it('clears the override when set to null', () => {
    setPlatformOverride('desktop');
    setPlatformOverride(null);
    expect(getPlatformOverride()).toBeNull();
  });

  it('returns null for an unrecognised stored value', () => {
    GM_setValue(PLATFORM_OVERRIDE_KEY, 'tablet');
    expect(getPlatformOverride()).toBeNull();
  });
});

describe('dock-collapsed config', () => {
  it('defaults to expanded when nothing is stored', () => {
    GM_setValue(DOCK_COLLAPSED_KEY, '');
    expect(getDockCollapsed()).toBe(false);
  });

  it('round-trips the collapsed flag through GM storage', () => {
    setDockCollapsed(true);
    expect(getDockCollapsed()).toBe(true);
    setDockCollapsed(false);
    expect(getDockCollapsed()).toBe(false);
  });
});

describe('database-route config', () => {
  it('returns null when nothing is stored', () => {
    GM_setValue(DB_ROUTE_KEY, '');
    expect(getDbRoute()).toBeNull();
  });

  it('round-trips a route through GM storage', () => {
    setDbRoute('map/54');
    expect(GM_getValue(DB_ROUTE_KEY, '')).toBe('map/54');
    expect(getDbRoute()).toBe('map/54');
  });

  it('round-trips a bare tab with no selection', () => {
    setDbRoute('monsters');
    expect(getDbRoute()).toBe('monsters');
  });
});

describe('generic pref config', () => {
  it('returns null when nothing is stored for a key', () => {
    GM_setValue(QUEST_TILE_KEY, '');
    expect(getPref(QUEST_TILE_KEY)).toBeNull();
  });

  it('round-trips a value through GM storage, keyed by the caller', () => {
    setPref(QUEST_TILE_KEY, '72');
    expect(GM_getValue(QUEST_TILE_KEY, '')).toBe('72');
    expect(getPref(QUEST_TILE_KEY)).toBe('72');
  });

  it('keeps values under different keys independent', () => {
    setPref(QUEST_TILE_KEY, '40');
    setPref('some-other-key', 'other-value');
    expect(getPref(QUEST_TILE_KEY)).toBe('40');
    expect(getPref('some-other-key')).toBe('other-value');
  });
});

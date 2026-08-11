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

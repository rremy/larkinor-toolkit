import { describe, it, expect, beforeEach } from 'vitest';
import { detectPlatform } from '../src/utils/platform';
import { PLATFORM_OVERRIDE_KEY, setPlatformOverride } from '../src/utils/config';

/** Minimal Window stand-in: detectPlatform only reads matchMedia and innerWidth. */
function fakeWin(opts: { coarse: boolean; width: number }): Window {
  return {
    innerWidth: opts.width,
    matchMedia: (query: string) => ({
      matches: query.includes('coarse') ? opts.coarse : false,
    }),
  } as unknown as Window;
}

const DESKTOP_WIN = fakeWin({ coarse: false, width: 1440 });
const PHONE_WIN = fakeWin({ coarse: true, width: 412 });

describe('detectPlatform', () => {
  beforeEach(() => {
    GM_setValue(PLATFORM_OVERRIDE_KEY, '');
  });

  it('auto-detects desktop for a wide viewport with a fine pointer', () => {
    expect(detectPlatform(DESKTOP_WIN)).toBe('desktop');
  });

  it('auto-detects mobile for a coarse pointer regardless of width', () => {
    expect(detectPlatform(fakeWin({ coarse: true, width: 1440 }))).toBe('mobile');
  });

  it('auto-detects mobile for a narrow viewport even with a fine pointer', () => {
    expect(detectPlatform(fakeWin({ coarse: false, width: 800 }))).toBe('mobile');
  });

  it('treats exactly 900px as desktop (the threshold is exclusive)', () => {
    expect(detectPlatform(fakeWin({ coarse: false, width: 900 }))).toBe('desktop');
  });

  it('lets a stored desktop override win over mobile auto-detection', () => {
    setPlatformOverride('desktop');
    expect(detectPlatform(PHONE_WIN)).toBe('desktop');
  });

  it('lets a stored mobile override win over desktop auto-detection', () => {
    setPlatformOverride('mobile');
    expect(detectPlatform(DESKTOP_WIN)).toBe('mobile');
  });

  it('falls back to auto-detection once the override is cleared', () => {
    setPlatformOverride('mobile');
    setPlatformOverride(null);
    expect(detectPlatform(DESKTOP_WIN)).toBe('desktop');
  });

  it('ignores a garbage override value and auto-detects', () => {
    GM_setValue(PLATFORM_OVERRIDE_KEY, 'tablet');
    expect(detectPlatform(DESKTOP_WIN)).toBe('desktop');
  });
});

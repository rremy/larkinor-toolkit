import { describe, it, expect } from 'vitest';
import { calverVersion, compareVersions } from '../scripts/userscriptVersion.mjs';

/**
 * The one property that matters: a later build must produce a strictly greater
 * version, because ViolentMonkey installs an update only when the remote
 * `@version` exceeds the installed one. A hardcoded version is what stopped
 * direct installs from ever updating.
 */
describe('calverVersion', () => {
  const at = (iso: string) => calverVersion(new Date(iso));

  it('formats as YYYY.M.D.HHMM in UTC, unpadded', () => {
    expect(at('2026-08-28T13:15:00Z')).toBe('2026.8.28.1315');
    expect(at('2026-08-28T00:30:00Z')).toBe('2026.8.28.30');
    expect(at('2026-01-01T00:00:00Z')).toBe('2026.1.1.0');
  });

  it('reads the clock in UTC, not the local zone', () => {
    // 23:30 UTC is the next day in CEST; the version must still say the 28th.
    expect(at('2026-08-28T23:30:00Z')).toBe('2026.8.28.2330');
  });

  it('increases across every boundary', () => {
    const ordered = [
      '2025-12-31T23:59:00Z',
      '2026-01-01T00:00:00Z',   // year
      '2026-01-01T00:01:00Z',   // minute
      '2026-01-31T23:59:00Z',
      '2026-02-01T00:00:00Z',   // month
      '2026-08-09T09:09:00Z',
      '2026-08-10T00:00:00Z',   // single- to double-digit day
      '2026-09-01T00:00:00Z',   // single- to double-digit month boundary
      '2026-10-01T00:00:00Z',
    ].map(at);

    for (let i = 1; i < ordered.length; i += 1) {
      expect(compareVersions(ordered[i], ordered[i - 1]))
        .toBeGreaterThan(0);
    }
  });

  // The trap the unpadded time part avoids: as a padded string, '0030' compares
  // greater than '1315' under a lexicographic comparison.
  it('keeps the time part numerically ordered through midnight', () => {
    expect(compareVersions(at('2026-08-28T01:00:00Z'), at('2026-08-28T00:30:00Z'))).toBeGreaterThan(0);
    expect(compareVersions(at('2026-08-28T13:15:00Z'), at('2026-08-28T00:30:00Z'))).toBeGreaterThan(0);
  });

  it('beats the version that shipped before it, so an installed copy updates', () => {
    expect(compareVersions(at('2026-08-28T13:15:00Z'), '0.1.0')).toBeGreaterThan(0);
  });
});

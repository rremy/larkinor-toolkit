import { beforeEach, vi } from 'vitest';

const gmStore: Record<string, string> = {};

// ViolentMonkey GM_* APIs are not available in jsdom — mock them globally
Object.assign(globalThis, {
  GM_addStyle: vi.fn(),
  GM_getValue: vi.fn((key: string, fallback?: string) => gmStore[key] ?? fallback ?? null),
  GM_setValue: vi.fn((key: string, value: string) => { gmStore[key] = value; }),
  GM_xmlhttpRequest: vi.fn(),
});

// Every sortable list remembers its sort (see useStoredSort). Those keys are
// written by whichever list a test happens to touch, so they are cleared before
// each test rather than left for every list test to remember to reset.
beforeEach(() => {
  for (const key of Object.keys(gmStore)) if (key.startsWith('lc-sort-')) delete gmStore[key];
});

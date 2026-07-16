import { vi } from 'vitest';

const gmStore: Record<string, string> = {};

// ViolentMonkey GM_* APIs are not available in jsdom — mock them globally
Object.assign(globalThis, {
  GM_addStyle: vi.fn(),
  GM_getValue: vi.fn((key: string, fallback?: string) => gmStore[key] ?? fallback ?? null),
  GM_setValue: vi.fn((key: string, value: string) => { gmStore[key] = value; }),
  GM_xmlhttpRequest: vi.fn(),
});

import { vi } from 'vitest';
import { options } from 'preact';

const gmStore: Record<string, string> = {};

// ViolentMonkey GM_* APIs are not available in jsdom — mock them globally
Object.assign(globalThis, {
  GM_addStyle: vi.fn(),
  GM_getValue: vi.fn((key: string, fallback?: string) => gmStore[key] ?? fallback ?? null),
  GM_setValue: vi.fn((key: string, value: string) => { gmStore[key] = value; }),
  GM_xmlhttpRequest: vi.fn(),
});

// Preact batches state updates into a microtask by default. Tests that
// dispatch a native event directly on a document (rather than through
// @testing-library/preact's `fireEvent`, which wraps calls in `act()`) then
// assert on the DOM synchronously — e.g. a document-level keydown listener
// installed by a hook. Forcing synchronous rendering here keeps that
// assertable without touching production code or bundle size.
options.debounceRendering = (cb) => cb();

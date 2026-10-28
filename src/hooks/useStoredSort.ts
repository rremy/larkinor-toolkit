import { useState } from 'preact/hooks';
import { getPref, setPref } from '@/utils/config';

// A list's sort key and direction, remembered per list. The game reloads the
// whole page on every action — a purchase, a sale, an item moved or equipped —
// so a sort kept only in component state reset after each one, which is
// exactly when a sorted list is being worked through.

export interface StoredSort<K extends string> {
  sortKey: K;
  asc: boolean;
  setSortKey: (key: K) => void;
  flip: () => void;
}

/** The storage key for one list's sort, e.g. `lc-sort-shop-sell`. */
export function sortPrefKey(list: string): string {
  return `lc-sort-${list}`;
}

function readSort<K extends string>(storeKey: string, keys: readonly K[]): { key: K; asc: boolean } | null {
  try {
    const parsed = JSON.parse(getPref(storeKey) ?? '') as { key?: string; asc?: unknown };
    // A key the list no longer offers is dropped rather than applied invisibly.
    return keys.includes(parsed.key as K) && typeof parsed.asc === 'boolean'
      ? { key: parsed.key as K, asc: parsed.asc }
      : null;
  } catch {
    return null;
  }
}

/**
 * Sort state for the list named `list`, restored from storage and written back
 * on every change. `keys` are the sort keys the list offers; `initial` applies
 * until the player picks one.
 */
export function useStoredSort<K extends string>(
  list: string,
  keys: readonly K[],
  initial: { key: K; asc: boolean },
): StoredSort<K> {
  const storeKey = sortPrefKey(list);
  const [sort, setSort] = useState(() => readSort(storeKey, keys) ?? initial);

  // From the previous value, so two quick changes cannot overwrite each other.
  const update = (change: (prev: { key: K; asc: boolean }) => { key: K; asc: boolean }): void => {
    setSort((prev) => {
      const next = change(prev);
      setPref(storeKey, JSON.stringify(next));
      return next;
    });
  };

  return {
    sortKey: sort.key,
    asc: sort.asc,
    setSortKey: (key) => update((prev) => ({ ...prev, key })),
    flip: () => update((prev) => ({ ...prev, asc: !prev.asc })),
  };
}

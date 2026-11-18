// Favourite monsters: the ones the player wants to notice when the narration
// names them. Toggled from the monster card and the database's monster detail;
// read by the narration (mobile's panel and desktop's in-place links) and by the
// database's monster table.
//
// GM-free, so the standalone database can use it with its own localStorage
// store. Every in-page view showing favourites listens through
// `subscribeFavourites`, so a toggle in the database restyles a narration
// already on screen without a reload.

import { FAVOURITE_MONSTERS_PREF_KEY } from './prefKeys';

/** The key–value store favourites live in; a `PrefStore` fits it as is. */
export interface FavouriteStore {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

/** The form a name is stored and compared in: the database's own name lookup is case-insensitive. */
export function favouriteKey(name: string): string {
  return name.trim().toLowerCase();
}

/** A stored value back as a set; a missing or corrupt value reads as no favourites. */
export function parseFavourites(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((n): n is string => typeof n === 'string' && n !== '').map(favouriteKey));
  } catch {
    return new Set();
  }
}

/** Sorted, so the stored value does not churn with toggle order. */
export function serialiseFavourites(favourites: ReadonlySet<string>): string {
  return JSON.stringify([...favourites].sort());
}

export function readFavourites(store: FavouriteStore | undefined): Set<string> {
  return parseFavourites(store?.read(FAVOURITE_MONSTERS_PREF_KEY) ?? null);
}

export function isFavourite(favourites: ReadonlySet<string>, name: string): boolean {
  return favourites.has(favouriteKey(name));
}

const listeners = new Set<() => void>();

/** Calls `listener` after every toggle on this page; returns the unsubscribe. */
export function subscribeFavourites(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Adds `name` to the favourites, or removes it, and tells every listener. Reads
 * the store first rather than trusting a caller's copy: two views may each hold
 * one, and writing from a stale copy would drop the other's change.
 */
export function toggleFavourite(store: FavouriteStore, name: string): Set<string> {
  const next = readFavourites(store);
  const key = favouriteKey(name);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  store.write(FAVOURITE_MONSTERS_PREF_KEY, serialiseFavourites(next));
  for (const listener of [...listeners]) listener();
  return next;
}

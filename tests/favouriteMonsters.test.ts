import { describe, expect, it, vi } from 'vitest';
import {
  isFavourite, parseFavourites, readFavourites, serialiseFavourites, subscribeFavourites, toggleFavourite,
  type FavouriteStore,
} from '../src/shared/favouriteMonsters';
import { FAVOURITE_MONSTERS_PREF_KEY } from '../src/shared/prefKeys';

function memoryStore(initial: Record<string, string> = {}): FavouriteStore & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, read: (key) => data[key] ?? null, write: (key, value) => { data[key] = value; } };
}

describe('favourite monsters', () => {
  it('reads nothing from a missing or corrupt value', () => {
    expect(parseFavourites(null).size).toBe(0);
    expect(parseFavourites('not json').size).toBe(0);
    expect(parseFavourites('{"a":1}').size).toBe(0);
  });

  it('compares names case-insensitively, like the database lookup', () => {
    const favourites = parseFavourites('["Sírrabló"]');
    expect(isFavourite(favourites, 'sírrabló')).toBe(true);
    expect(isFavourite(favourites, 'SÍRRABLÓ')).toBe(true);
    expect(isFavourite(favourites, 'sirrablo')).toBe(false);
  });

  it('stores a sorted list, so the value does not churn with toggle order', () => {
    expect(serialiseFavourites(new Set(['zombi', 'agyar']))).toBe('["agyar","zombi"]');
  });

  it('adds a monster, then removes it again', () => {
    const store = memoryStore();
    toggleFavourite(store, 'Sírrabló');
    expect(isFavourite(readFavourites(store), 'Sírrabló')).toBe(true);
    toggleFavourite(store, 'sírrabló');
    expect(readFavourites(store).size).toBe(0);
  });

  it('builds on what is stored, not a copy the caller holds', () => {
    // Another view may have toggled since this one last read.
    const store = memoryStore({ [FAVOURITE_MONSTERS_PREF_KEY]: '["agyar"]' });
    toggleFavourite(store, 'zombi');
    expect(store.data[FAVOURITE_MONSTERS_PREF_KEY]).toBe('["agyar","zombi"]');
  });

  it('tells every listener, and stops after unsubscribing', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeFavourites(listener);
    toggleFavourite(memoryStore(), 'zombi');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    toggleFavourite(memoryStore(), 'zombi');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

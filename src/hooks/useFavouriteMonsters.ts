import { useCallback, useEffect, useState } from 'preact/hooks';
import {
  readFavourites, subscribeFavourites, toggleFavourite, type FavouriteStore,
} from '@/shared/favouriteMonsters';

export interface FavouriteMonsters {
  /** Lower-cased names; compare through `isFavourite`. */
  favourites: Set<string>;
  toggle: (name: string) => void;
  /** False without a store: there is nowhere to keep a favourite, so callers offer none. */
  enabled: boolean;
}

/**
 * The favourite monsters in `store`, kept current across every view on the
 * page: a toggle anywhere re-reads them here.
 */
export function useFavouriteMonsters(store: FavouriteStore | undefined): FavouriteMonsters {
  const [favourites, setFavourites] = useState(() => readFavourites(store));

  useEffect(() => {
    setFavourites(readFavourites(store));
    return subscribeFavourites(() => setFavourites(readFavourites(store)));
  }, [store]);

  const toggle = useCallback((name: string) => {
    if (store) toggleFavourite(store, name);
  }, [store]);

  return { favourites, toggle, enabled: store !== undefined };
}

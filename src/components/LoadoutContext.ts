import { createContext } from 'preact';
import type { Loadout } from '@/shared/loadout';

/**
 * What the player is wearing, for the compare card. Provided at each in-game
 * mount root (both boots and the database overlay) from GM storage.
 *
 * The default is null, which is also what the standalone database site gets: a
 * different origin cannot see the in-game loadout, so compare is in-game only
 * and every consumer must render normally without one.
 */
export const LoadoutContext = createContext<Loadout | null>(null);

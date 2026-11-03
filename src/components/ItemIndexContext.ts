import { createContext } from 'preact';
import type { ItemIndex } from '@/shared/itemMentions';

/**
 * Every weapon, armour and item by name, for linking the items the narration
 * counts out (see src/shared/itemMentions.ts). Provided by the mobile boot once
 * loaded, and only on a page whose text may mention one.
 *
 * Null until then, and wherever it is not provided: the narration still
 * highlights what it finds, it just cannot link it.
 */
export const ItemIndexContext = createContext<ItemIndex | null>(null);

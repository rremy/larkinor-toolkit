import type { DataSource } from './source';
import type { Weapon, Armor, Item, MapData, ShopData, Quest } from './types';
import { buildMonsterDatabase, type Monster, type MonsterDatabase } from './monsters';

export interface DataLoader {
  loadWeapons(): Promise<Weapon[]>;
  loadArmors(): Promise<Armor[]>;
  loadItems(): Promise<Item[]>;
  loadMonsters(): Promise<MonsterDatabase>;
  loadMap(): Promise<MapData>;
  loadItemShops(): Promise<ShopData>;
  loadWeaponShops(): Promise<ShopData>;
  loadQuests(): Promise<Quest[]>;
}

/**
 * Build-time data version, injected by Vite (`__DATA_VERSION__`). Appended as a
 * `?v=` query so a new deploy busts both the browser HTTP cache and the app's
 * own GM/localStorage cache. Empty under tests / dev-without-define, in which
 * case URLs stay unversioned.
 */
declare const __DATA_VERSION__: string | undefined;
const DATA_VERSION = typeof __DATA_VERSION__ === 'string' ? __DATA_VERSION__ : '';

export function createDataLoader(source: DataSource, baseUrl: string): DataLoader {
  const url = (file: string) =>
    DATA_VERSION ? `${baseUrl}/${file}?v=${DATA_VERSION}` : `${baseUrl}/${file}`;
  return {
    loadWeapons: () => source.fetchJson<Weapon[]>(url('weapons.json')),
    loadArmors: () => source.fetchJson<Armor[]>(url('armors.json')),
    loadItems: () => source.fetchJson<Item[]>(url('items.json')),
    loadMonsters: async () =>
      buildMonsterDatabase(await source.fetchJson<Monster[]>(url('monsters.json'))),
    loadMap: () => source.fetchJson<MapData>(url('map-data.json')),
    loadItemShops: () => source.fetchJson<ShopData>(url('item-shops.json')),
    loadWeaponShops: () => source.fetchJson<ShopData>(url('weapon-shops.json')),
    loadQuests: () => source.fetchJson<Quest[]>(url('quests.json')),
  };
}

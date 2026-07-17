import type { DataSource } from './source';
import type { Weapon, Armor, Item, MapData, ShopData } from './types';
import { buildMonsterDatabase, type Monster, type MonsterDatabase } from './monsters';

export interface DataLoader {
  loadWeapons(): Promise<Weapon[]>;
  loadArmors(): Promise<Armor[]>;
  loadItems(): Promise<Item[]>;
  loadMonsters(): Promise<MonsterDatabase>;
  loadMap(): Promise<MapData>;
  loadItemShops(): Promise<ShopData>;
  loadWeaponShops(): Promise<ShopData>;
}

export function createDataLoader(source: DataSource, baseUrl: string): DataLoader {
  const url = (file: string) => `${baseUrl}/${file}`;
  return {
    loadWeapons: () => source.fetchJson<Weapon[]>(url('weapons.json')),
    loadArmors: () => source.fetchJson<Armor[]>(url('armors.json')),
    loadItems: () => source.fetchJson<Item[]>(url('items.json')),
    loadMonsters: async () =>
      buildMonsterDatabase(await source.fetchJson<Monster[]>(url('monsters.json'))),
    loadMap: () => source.fetchJson<MapData>(url('map-data.json')),
    loadItemShops: () => source.fetchJson<ShopData>(url('item-shops.json')),
    loadWeaponShops: () => source.fetchJson<ShopData>(url('weapon-shops.json')),
  };
}

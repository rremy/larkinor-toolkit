export interface MonsterDrop {
  qty: number;
  name: string;
  id: number;
}

export interface Monster {
  id: number;
  name: string;
  image: string;
  level: number;
  hp: number;
  mp: number;
  attackType: string;
  debuff: string;
  magicWeapon: boolean;
  location: string;
  drops: MonsterDrop[];
}

export interface MonsterDatabase {
  byName: Map<string, Monster>;
  getByName(name: string): Monster | undefined;
}

export function buildMonsterDatabase(monsters: Monster[]): MonsterDatabase {
  const byName = new Map<string, Monster>();
  for (const m of monsters) {
    byName.set(m.name.toLowerCase(), m);
  }

  return {
    byName,
    getByName(name: string): Monster | undefined {
      return byName.get(name.toLowerCase());
    },
  };
}

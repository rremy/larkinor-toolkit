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
  /** Quest cells store a resolved numeric monster id, not a name. */
  byId: Map<number, Monster>;
  getByName(name: string): Monster | undefined;
  getById(id: number): Monster | undefined;
}

export function buildMonsterDatabase(monsters: Monster[]): MonsterDatabase {
  const byName = new Map<string, Monster>();
  const byId = new Map<number, Monster>();
  for (const m of monsters) {
    byName.set(m.name.toLowerCase(), m);
    byId.set(m.id, m);
  }

  return {
    byName,
    byId,
    getByName(name: string): Monster | undefined {
      return byName.get(name.toLowerCase());
    },
    getById(id: number): Monster | undefined {
      return byId.get(id);
    },
  };
}

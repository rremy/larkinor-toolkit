const CACHE_KEY = 'lc_monsters_cache';

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
  pattern: RegExp;
  getByName(name: string): Monster | undefined;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildMonsterDatabase(monsters: Monster[]): MonsterDatabase {
  const byName = new Map<string, Monster>();
  for (const m of monsters) {
    byName.set(m.name.toLowerCase(), m);
  }

  // Sort longest-first to prevent partial matches
  const sorted = [...byName.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(${sorted.map(escapeRegex).join('|')})`, 'gi');

  return {
    byName,
    pattern,
    getByName(name: string): Monster | undefined {
      return byName.get(name.toLowerCase());
    },
  };
}

export async function loadMonsters(url: string): Promise<MonsterDatabase> {
  // Try cache first
  const cached = GM_getValue(CACHE_KEY, null);
  if (cached) {
    try {
      const monsters = JSON.parse(cached) as Monster[];
      return buildMonsterDatabase(monsters);
    } catch {
      // Cache corrupted — fall through to fetch
    }
  }

  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      onload(response) {
        if (response.status !== 200) {
          reject(new Error(`Failed to load monsters.json: HTTP ${response.status}`));
          return;
        }
        try {
          const monsters = JSON.parse(response.responseText) as Monster[];
          GM_setValue(CACHE_KEY, response.responseText);
          resolve(buildMonsterDatabase(monsters));
        } catch (e) {
          reject(e);
        }
      },
      onerror() {
        reject(new Error('Network error loading monsters.json'));
      },
    });
  });
}

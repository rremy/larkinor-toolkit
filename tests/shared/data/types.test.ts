import { describe, it, expect } from 'vitest';
import weapons from '../../../static/db/weapons.json';
import type { Weapon } from '@/shared/data/types';

describe('data types', () => {
  it('a real weapon record satisfies the Weapon type', () => {
    const w = weapons[0] as Weapon;
    expect(w.name).toBe('bot');
    expect(w.type).toBe('Ütő/Zúzó');
    expect(w.shops[0].owner).toBe('Thorgard');
  });
});

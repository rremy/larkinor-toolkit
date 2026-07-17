import { describe, it, expect, vi, beforeEach } from 'vitest';
import { httpSource, createDataLoader } from '@/shared/data';

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('httpSource', () => {
  it('fetches and parses JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, text: async () => '[{"id":1}]',
    })));
    const src = httpSource();
    const data = await src.fetchJson<{ id: number }[]>('http://x/w.json');
    expect(data[0].id).toBe(1);
  });

  it('serves the second call from localStorage cache', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '[1,2]' }));
    vi.stubGlobal('fetch', fetchMock);
    const src = httpSource();
    await src.fetchJson('http://x/a.json');
    await src.fetchJson('http://x/a.json');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('createDataLoader', () => {
  it('requests the weapons file under the base url', async () => {
    // Cast to `any`: a mocked fetchJson resolves a concrete type, which isn't
    // structurally assignable to the generic `<T>(url) => Promise<T>` method
    // signature under strict mode (same pattern as the loader test below).
    const fetchJson = vi.fn(async () => []) as any;
    const loader = createDataLoader({ fetchJson }, 'http://x/db');
    await loader.loadWeapons();
    expect(fetchJson).toHaveBeenCalledWith('http://x/db/weapons.json');
  });
});

import { buildMonsterDatabase } from '@/shared/data';
describe('loadMonsters via loader', () => {
  it('indexes monsters by lowercased name', async () => {
    const fetchJson = vi.fn(async () => [{ name: 'Kutya' }]) as any;
    const { createDataLoader } = await import('@/shared/data');
    const db = await createDataLoader({ fetchJson }, 'http://x/db').loadMonsters();
    expect(db.getByName('kutya')).toBeTruthy();
    expect(buildMonsterDatabase([]).getByName('x')).toBeUndefined();
  });
});

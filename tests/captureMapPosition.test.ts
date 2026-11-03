import { describe, expect, it } from 'vitest';
import { captureMapPosition } from '@/utils/captureMapPosition';
import { parseMapPosition } from '@/shared/mapPosition';
import { MAP_POSITION_PREF_KEY } from '@/shared/prefKeys';

function docWith(html: string): Document {
  return new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html');
}

function capture(html: string): Record<string, string> {
  const store: Record<string, string> = {};
  captureMapPosition(docWith(html), (key, value) => { store[key] = value; });
  return store;
}

describe('captureMapPosition', () => {
  it('stores the tile the free-move page draws', () => {
    const store = capture('<img src="https://l2.larkinor.hu/tajk/53.gif" width="145" title="harcos-negyed">');
    expect(store[MAP_POSITION_PREF_KEY]).toBe('53');
  });

  it('keeps the ids that encode no row and column as they are', () => {
    expect(capture('<img src="/tajk/41-13.gif">')[MAP_POSITION_PREF_KEY]).toBe('41-13');
    expect(capture('<img src="/tajk/-15.gif">')[MAP_POSITION_PREF_KEY]).toBe('-15');
  });

  it('writes nothing when the page draws no tile', () => {
    expect(capture('<img src="/ikon/eszak.gif">')).toEqual({});
  });
});

describe('parseMapPosition', () => {
  it('accepts a stored tile id', () => {
    expect(parseMapPosition('41-13')).toBe('41-13');
  });

  it('rejects anything that is not one', () => {
    expect(parseMapPosition(null)).toBeNull();
    expect(parseMapPosition('')).toBeNull();
    expect(parseMapPosition('<b>')).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { parseLearnedTiles, recordTile, pinnedSquare, serializeLearnedTiles } from '@/shared/learnedTiles';

describe('learned island tiles', () => {
  it('pins a picture once recorded', () => {
    const tiles = recordTile({}, 'szigx/a_1-1', -24, 3);
    expect(pinnedSquare(tiles, 'szigx/a_1-1')).toEqual({ row: -24, col: 3 });
  });

  it('keeps pinning when seen on the same square again', () => {
    const tiles = recordTile(recordTile({}, 'szigx/a_1-1', -24, 3), 'szigx/a_1-1', -24, 3);
    expect(pinnedSquare(tiles, 'szigx/a_1-1')).toEqual({ row: -24, col: 3 });
  });

  it('stops pinning a picture seen on two squares', () => {
    const tiles = recordTile(recordTile({}, 'szigx/a_1-1', -24, 3), 'szigx/a_1-1', -25, 3);
    expect(tiles['szigx/a_1-1'].conflict).toBe(true);
    expect(pinnedSquare(tiles, 'szigx/a_1-1')).toBeNull();
  });

  it('never un-flags a conflict', () => {
    const conflicted = recordTile(recordTile({}, 'p', 1, 1), 'p', 2, 2);
    expect(pinnedSquare(recordTile(conflicted, 'p', 1, 1), 'p')).toBeNull();
  });

  it('reads nothing from a malformed store', () => {
    expect(parseLearnedTiles('{not json')).toEqual({});
    expect(parseLearnedTiles(null)).toEqual({});
    expect(parseLearnedTiles('{"p":{"row":"x","col":1}}')).toEqual({});
  });

  it('round-trips through storage', () => {
    const tiles = recordTile({}, 'p', -3, 4);
    expect(parseLearnedTiles(serializeLearnedTiles(tiles))).toEqual(tiles);
  });
});

import { h, type JSX } from 'preact';
import type { DungeonTile } from '@/utils/domExtract';

export interface DungeonCellProps {
  tiles: DungeonTile[];
}

/** Upscale factor for the native ~150px composite so it fills a mobile screen. */
const SCALE = 2;

/**
 * Reproduces the dungeon's composed cell picture: the game layers absolutely-
 * positioned tiles (floor, doors, walls, corridors, the player figure, and any
 * adjacent-enemy marker). We replicate that stacking, upscaled, with pixelated
 * rendering so the pixel art stays crisp.
 */
export function DungeonCell({ tiles }: DungeonCellProps): JSX.Element | null {
  if (tiles.length === 0) return null;

  const boxW = Math.max(...tiles.map(t => t.left + t.width)) * SCALE;
  const boxH = Math.max(...tiles.map(t => t.top + t.height)) * SCALE;

  return (
    <div class="lc-dungeon-cell" style={{ width: `${boxW}px`, height: `${boxH}px` }}>
      {tiles.map((t, i) => (
        <img
          key={i}
          class="lc-dungeon-tile"
          src={t.imageUrl}
          alt=""
          style={{
            left: `${t.left * SCALE}px`,
            top: `${t.top * SCALE}px`,
            width: `${t.width * SCALE}px`,
            height: `${t.height * SCALE}px`,
            zIndex: t.z,
          }}
        />
      ))}
    </div>
  );
}

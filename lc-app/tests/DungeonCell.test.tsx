import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import { DungeonCell } from '../src/components/DungeonCell';
import type { DungeonTile } from '../src/utils/domExtract';

const TILES: DungeonTile[] = [
  { imageUrl: 'https://x/talaj.gif', left: 0, top: 0, width: 150, height: 150, z: 3 },
  { imageUrl: 'https://x/enemy.gif', left: 100, top: 50, width: 50, height: 50, z: 4 },
  { imageUrl: 'https://x/figura.gif', left: 60, top: 55, width: 35, height: 35, z: 6 },
];

describe('DungeonCell', () => {
  it('renders one image per tile with its imageUrl', () => {
    const { container } = render(<DungeonCell tiles={TILES} />);
    const imgs = container.querySelectorAll('.lc-dungeon-cell img');
    expect(imgs.length).toBe(3);
    const srcs = Array.from(imgs).map(i => (i as HTMLImageElement).getAttribute('src'));
    expect(srcs).toContain('https://x/enemy.gif');
  });

  it('places each tile with its z-index so higher layers paint on top', () => {
    const { container } = render(<DungeonCell tiles={TILES} />);
    const figure = container.querySelector('img[src="https://x/figura.gif"]') as HTMLImageElement;
    expect(figure.style.zIndex).toBe('6');
  });

  it('positions a tile with a larger left offset further to the right', () => {
    const { container } = render(<DungeonCell tiles={TILES} />);
    const floor = container.querySelector('img[src="https://x/talaj.gif"]') as HTMLImageElement;
    const enemy = container.querySelector('img[src="https://x/enemy.gif"]') as HTMLImageElement;
    expect(parseFloat(enemy.style.left)).toBeGreaterThan(parseFloat(floor.style.left));
  });

  it('renders nothing when there are no tiles', () => {
    const { container } = render(<DungeonCell tiles={[]} />);
    expect(container.querySelector('.lc-dungeon-cell')).toBeNull();
  });
});

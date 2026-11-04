// Desktop-only: the direction hints in the narration (see
// src/utils/directionHints.ts) drawn as icons around the game's own arrow
// cross. The page is left as it is; the icons live in a layer of their own,
// absolutely positioned in page coordinates measured off the arrows. The game
// lays itself out in fixed pixels, so measuring once at boot is enough — the
// same reasoning as the dock's alignment against the chat panel.

import { HINT_ICON, indicatorPositions, type ArrowRects, type Compass, type DirectionHint } from '@/utils/directionHints';

const LAYER_ID = 'lc-dir-indicators';

/** The game's direction arrows, by image basename. */
const ARROWS: Record<keyof ArrowRects, string> = {
  north: 'eszak',
  south: 'del',
  east: 'kelet',
  west: 'nyugat',
};

/** The arrows this page draws, in page coordinates. */
function arrowRects(doc: Document): ArrowRects {
  const view = doc.defaultView;
  const rects: ArrowRects = {};
  for (const input of doc.querySelectorAll<HTMLElement>('input[type="image"]')) {
    const base = (input.getAttribute('src') ?? '').split('/').pop()?.replace(/\.gif$/i, '');
    const side = (Object.keys(ARROWS) as Array<keyof ArrowRects>).find((key) => ARROWS[key] === base);
    if (!side || rects[side]) continue;
    const box = input.getBoundingClientRect();
    rects[side] = {
      left: box.left + (view?.scrollX ?? 0),
      top: box.top + (view?.scrollY ?? 0),
      width: box.width,
      height: box.height,
    };
  }
  return rects;
}

/** Draws the hints around the arrows, replacing any drawn before. */
export function renderDirectionIndicators(doc: Document, hints: DirectionHint[]): void {
  doc.getElementById(LAYER_ID)?.remove();
  if (hints.length === 0) return;
  const positions = indicatorPositions(arrowRects(doc));
  if (!positions) return;

  const layer = doc.createElement('div');
  layer.id = LAYER_ID;
  const byDir = new Map<Compass, DirectionHint[]>();
  for (const hint of hints) byDir.set(hint.dir, [...(byDir.get(hint.dir) ?? []), hint]);

  for (const [dir, group] of byDir) {
    const { x, y } = positions[dir];
    const box = doc.createElement('div');
    box.className = 'lc-dir-hints';
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
    for (const hint of group) {
      const glyph = HINT_ICON[hint.kind];
      let icon: HTMLElement;
      if ('image' in glyph) {
        const img = doc.createElement('img');
        img.src = glyph.image;
        img.alt = hint.label;
        icon = img;
      } else {
        icon = doc.createElement('span');
        icon.textContent = glyph.emoji;
      }
      icon.className = `lc-dir-hint lc-dir-hint--${hint.kind}`;
      icon.title = hint.label;
      box.appendChild(icon);
    }
    layer.appendChild(box);
  }
  doc.body.appendChild(layer);
}

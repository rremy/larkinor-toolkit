import { describe, expect, it } from 'vitest';
import { findDirectionHints, indicatorPositions } from '@/utils/directionHints';

const brief = (text: string) => findDirectionHints(text).map(({ kind, dir, label }) => [kind, dir, label]);

describe('findDirectionHints', () => {
  // Every sentence below was printed by the game in a recorded session.
  it('points at the labyrinth entrance', () => {
    expect(brief('A labirintus bejárata délnyugatra van.')).toEqual([['labyrinth', 'SW', 'A labirintus bejárata']]);
    expect(brief('A labirintus bejárata északkeletre van.')).toEqual([['labyrinth', 'NE', 'A labirintus bejárata']]);
  });

  it('points at a player flying the airship, with how far they have come', () => {
    expect(brief('RemyNe tőled északkeletre már 63 lépést tett meg a Parszi léghajó segítségével.'))
      .toEqual([['airship', 'NE', 'RemyNe (63 lépés)']]);
    expect(brief('Egy macska fut át az úton.\nD@rk Wizzard tőled délkeletre már 12 lépést tett meg a Parszi léghajó segítségével.'))
      .toEqual([['airship', 'SE', 'D@rk Wizzard (12 lépés)']]);
  });

  it('points where a monster fled', () => {
    expect(brief('Dagonyadisznó északra menekült előled!')).toEqual([['fled', 'N', 'Dagonyadisznó']]);
    expect(brief('A szörny nyugatra menekült előled!')).toEqual([['fled', 'W', 'A szörny']]);
  });

  it('points where the game hints to go', () => {
    expect(brief('Valami azt súgja, jobb lenne délre menni!')).toEqual([['hint', 'S', 'Valami azt súgja, jobb lenne délre menni!']]);
  });

  it('reads the page as the game prints it: the direction bolded, two spaces before "van"', () => {
    // Live narration of 2026-11-03, flattened as extractNarration does: the
    // source is `A labirintus bejárata <b>délnyugatra</b>  van.`
    const text = 'A Parszi léghajó nálad van.\nTovábbmész...\nA megsárgult fű serceg a talpad alatt.\n'
      + 'Egy ismeretlen szörny mászkál a közelben! Megtámadod?!\nismeretlen szörny feléd indul!\n'
      + 'Aktuális küldetés: (11)\nA labirintus bejárata délnyugatra  van.';
    expect(brief(text)).toEqual([['labyrinth', 'SW', 'A labirintus bejárata']]);
    expect(brief('Kutek\u00a0tőled délre\u00a0 már 7 lépést tett meg a Parszi léghajó segítségével.'))
      .toEqual([['airship', 'S', 'Kutek (7 lépés)']]);
  });

  it('reads several at once, and nothing from ordinary narration', () => {
    const text = 'A labirintus bejárata délre van.\nKutek tőled délkeletre már 7 lépést tett meg a Parszi léghajó segítségével.';
    expect(brief(text).map(([kind, dir]) => [kind, dir])).toEqual([['labyrinth', 'S'], ['airship', 'SE']]);
    expect(brief('Hatalmas pókhálót látsz keletre. Továbbjöttél északra.')).toEqual([]);
  });
});

describe('indicatorPositions', () => {
  // The desktop cross: arrows 25px wide, 25px from the centre.
  const rects = {
    north: { left: 128, top: 313, width: 25, height: 25 },
    south: { left: 128, top: 363, width: 25, height: 25 },
    west: { left: 103, top: 338, width: 25, height: 25 },
    east: { left: 153, top: 338, width: 25, height: 25 },
  };

  it('puts a diagonal in the corner between its two arrows', () => {
    // North-east: right of the north arrow, above the east one.
    expect(indicatorPositions(rects)!.NE).toEqual({ x: 165.5, y: 325.5 });
    expect(indicatorPositions(rects)!.SW).toEqual({ x: 115.5, y: 375.5 });
  });

  it('puts a cardinal on its arrow’s outer edge', () => {
    expect(indicatorPositions(rects)!.N).toEqual({ x: 140.5, y: 313 });
    expect(indicatorPositions(rects)!.E).toEqual({ x: 178, y: 350.5 });
  });

  it('works out the cross from the arrows a page does draw', () => {
    // A wall to the north and east: no arrow there, same cross.
    const { north, east, ...rest } = rects;
    void north; void east;
    expect(indicatorPositions(rest)!.NE).toEqual({ x: 165.5, y: 325.5 });
  });

  it('places nothing without an arrow on each axis', () => {
    expect(indicatorPositions({ north: rects.north })).toBeNull();
    expect(indicatorPositions({})).toBeNull();
  });
});

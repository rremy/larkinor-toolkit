import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Quest, QuestCell } from '@/shared/data';
import {
  cellNarrationMatches,
  foldNarrationLines,
  locateDungeonPosition,
  matchCellsInQuest,
  propagatePosition,
  resolveDungeonPosition,
  sidesAgree,
  type SideObservations,
} from '../src/utils/dungeonPosition';
import type { QuestPosition } from '@/shared/questPosition';

const royal: Quest[] = JSON.parse(readFileSync('static/db/quests.json', 'utf-8'));
const tavern: Quest[] = JSON.parse(readFileSync('static/db/tavern-quests.json', 'utf-8'));

const quest35 = royal.find((q) => q.id === '35')!;

/**
 * A real dungeon narration, captured live on 2026-08-19 from royal quest 35's
 * cell (0,6) — the `font[face="Comic sans MS"]` block with `<br>`s converted to
 * newlines.
 *
 * The shape is the whole reason the matcher works on lines rather than on the
 * block: the **last** line is the cell's own text, and everything before it
 * narrates the player's last action (here a rest, which also printed two
 * regeneration lines). Note the quotes — the game prints `"` where the scraped
 * data has `'`, which is why every comparison folds punctuation away.
 */
const RESTED_AT_0_6 = `

Pihensz egy kicsit...
Regenerálódott némi életpontod!
Regeneráltál némi varázspontot.
Körülötted elhaló nyögések jelzik, hogy az egyik fogoly még életben van. Odahajolsz hozzá. Utolsó szavai a következők: "Bosszulj meg minket jóember! Rúgd szét a hhhrrrrggggg!" Nem is nagy baj, hogy nem tudta befejezni.
`;

/**
 * What the composed cell picture said about that same cell: walls north and
 * east, corridors west and south. Verified against the live tiles
 * (`fal_f_8`, `fal_j_8`, `foly_b_3`, `foly_l_3`) and independently against the
 * page's nav buttons, which offered only `nyugat` and `del`.
 */
const OBSERVED_AT_0_6: SideObservations = { N: 'wall', E: 'wall', S: 'open', W: 'open' };

describe('foldNarrationLines', () => {
  it('folds accents and punctuation away, dropping blank lines', () => {
    expect(foldNarrationLines('\n\nÁrnyék!\n\n  Kút, mély.  \n')).toEqual(['arnyek', 'kut mely']);
  });

  it('returns nothing for a narration with no text', () => {
    expect(foldNarrationLines('   \n\n ')).toEqual([]);
  });
});

describe('cellNarrationMatches', () => {
  const lines = foldNarrationLines(RESTED_AT_0_6);

  it('matches the cell whose text is the narration last line', () => {
    const cell = quest35.cells.find((c) => c.row === 0 && c.col === 6)!;
    expect(cellNarrationMatches(cell.narration, lines)).toBe(true);
  });

  it('does not match a different cell of the same quest', () => {
    const other = quest35.cells.find((c) => c.row === 0 && c.col === 5)!;
    expect(cellNarrationMatches(other.narration, lines)).toBe(false);
  });

  it('ignores a cell with no text at all', () => {
    expect(cellNarrationMatches('', lines)).toBe(false);
    expect(cellNarrationMatches('   ', lines)).toBe(false);
  });

  // The action preamble is the game's, not the cell's. A short cell text that
  // happens to appear inside it must not claim the position.
  it('does not match a short cell text buried inside the action preamble', () => {
    expect(cellNarrationMatches('kicsit', lines)).toBe(false);
  });

  // A long cell text is unmistakable even when the game prefixes something to
  // the line it sits on, so a suffix of the last line still counts.
  it('matches a long cell text the game prefixed onto the last line', () => {
    const prefixed = foldNarrationLines('Óvatosan lépsz. Körülötted csend van, és semmi sem mozdul errefelé.');
    expect(cellNarrationMatches('Körülötted csend van, és semmi sem mozdul errefelé.', prefixed)).toBe(true);
  });
});

describe('sidesAgree', () => {
  const cell = (edges: Partial<Record<'N' | 'E' | 'S' | 'W', QuestCell['edges']['N']>>): QuestCell =>
    ({
      edges: {
        N: edges.N ?? { kind: 'open' },
        E: edges.E ?? { kind: 'open' },
        S: edges.S ?? { kind: 'open' },
        W: edges.W ?? { kind: 'open' },
      },
    } as QuestCell);

  it('accepts a cell whose sides are what the page drew', () => {
    const c = cell({ N: { kind: 'wall' }, E: { kind: 'wall' } });
    expect(sidesAgree(c, OBSERVED_AT_0_6)).toBe(true);
  });

  it('rejects a cell walled where the page drew a corridor', () => {
    const c = cell({ N: { kind: 'wall' }, E: { kind: 'wall' }, S: { kind: 'wall' } });
    expect(sidesAgree(c, OBSERVED_AT_0_6)).toBe(false);
  });

  it('treats szel as a wall — it is drawn where the maze stops', () => {
    const c = cell({ N: { kind: 'szel' }, E: { kind: 'wall' } });
    expect(sidesAgree(c, OBSERVED_AT_0_6)).toBe(true);
  });

  // The door sprite grammar is unverified against the live game, so a door in
  // the data must never be the reason a cell is rejected: it can cost
  // precision, never correctness.
  it('accepts a door against any observation', () => {
    const c = cell({ N: { kind: 'door', lock: 'vas' } });
    expect(sidesAgree(c, { N: 'open' })).toBe(true);
    expect(sidesAgree(c, { N: 'wall' })).toBe(true);
    expect(sidesAgree(c, { N: 'door' })).toBe(true);
  });

  it('lets an unobserved side match anything', () => {
    const c = cell({ N: { kind: 'wall' } });
    expect(sidesAgree(c, {})).toBe(true);
  });

  it('matches a door the page actually drew as a door', () => {
    const c = cell({ N: { kind: 'wall' } });
    expect(sidesAgree(c, { N: 'door' })).toBe(false);
  });
});

describe('matchCellsInQuest', () => {
  it('pins the live capture to exactly one cell', () => {
    const found = matchCellsInQuest(quest35, RESTED_AT_0_6, OBSERVED_AT_0_6);
    expect(found.map((c) => [c.row, c.col])).toEqual([[0, 6]]);
  });

  it('finds nothing in a quest the narration does not belong to', () => {
    const quest34 = royal.find((q) => q.id === '34')!;
    expect(matchCellsInQuest(quest34, RESTED_AT_0_6, OBSERVED_AT_0_6)).toEqual([]);
  });

  it('finds nothing when the narration carries no cell text', () => {
    expect(matchCellsInQuest(quest35, 'Pihensz egy kicsit...', OBSERVED_AT_0_6)).toEqual([]);
  });

  // The surroundings are what turn a duplicated narration into one answer.
  it('narrows a narration shared by several cells using the sides', () => {
    const shared = royal.find((q) => q.id === '21')!;
    const byText = new Map<string, QuestCell[]>();
    for (const c of shared.cells) {
      if (!c.narration) continue;
      const list = byText.get(c.narration) ?? [];
      list.push(c);
      byText.set(c.narration, list);
    }
    const [text, cells] = [...byText].find(([, cs]) => cs.length > 2)!;
    const target = cells[0];
    const observed: SideObservations = {
      N: target.edges.N.kind === 'open' ? 'open' : 'wall',
      E: target.edges.E.kind === 'open' ? 'open' : 'wall',
      S: target.edges.S.kind === 'open' ? 'open' : 'wall',
      W: target.edges.W.kind === 'open' ? 'open' : 'wall',
    };
    const withSides = matchCellsInQuest(shared, text, observed);
    const withoutSides = matchCellsInQuest(shared, text, {});
    expect(withSides.length).toBeLessThan(withoutSides.length);
    expect(withSides).toContain(target);
  });
});

describe('locateDungeonPosition', () => {
  it('finds the cell in the preferred quest without searching further', () => {
    const found = locateDungeonPosition(RESTED_AT_0_6, OBSERVED_AT_0_6, royal, '35');
    expect(found).toEqual({
      set: 'royal',
      questId: '35',
      cells: [{ row: 0, col: 6 }],
      exact: true,
      source: 'narration',
    });
  });

  // The stored quest goes stale — the player walks into a different labyrinth
  // without opening the quests tab. Falling back to the whole set is what makes
  // the detection self-correcting rather than silently dead.
  it('falls back to the rest of the set when the preferred quest is stale', () => {
    const found = locateDungeonPosition(RESTED_AT_0_6, OBSERVED_AT_0_6, royal, '34');
    expect(found?.questId).toBe('35');
    expect(found?.cells).toEqual([{ row: 0, col: 6 }]);
    expect(found?.exact).toBe(true);
  });

  it('works with no preferred quest at all', () => {
    const found = locateDungeonPosition(RESTED_AT_0_6, OBSERVED_AT_0_6, royal, null);
    expect(found?.questId).toBe('35');
  });

  it('returns null when nothing matches anywhere', () => {
    expect(locateDungeonPosition('Iszol egy sört.', {}, royal, '35')).toBeNull();
  });

  it('returns null for an empty narration without scanning', () => {
    expect(locateDungeonPosition('   ', OBSERVED_AT_0_6, royal, '35')).toBeNull();
  });

  it('reports exact: false when the narration leaves several candidates', () => {
    const quest26 = royal.find((q) => q.id === '26')!;
    const dupes = quest26.cells.filter((c) => c.narration === 'Halál!');
    expect(dupes.length).toBeGreaterThan(1);
    const found = locateDungeonPosition('Halál!', {}, [quest26], '26');
    expect(found?.exact).toBe(false);
    expect(found!.cells.length).toBeGreaterThan(1);
  });

  it('prefers an exact hit in a later quest over an ambiguous one in the preferred quest', () => {
    const quest26 = royal.find((q) => q.id === '26')!;
    const found = locateDungeonPosition(RESTED_AT_0_6, OBSERVED_AT_0_6, [quest26, quest35], '26');
    expect(found?.questId).toBe('35');
    expect(found?.exact).toBe(true);
  });

  it('locates a tavern cell just as well', () => {
    const quest = tavern.find((q) => q.cells.some((c) => c.narration.length > 60))!;
    const cell = quest.cells.find((c) => c.narration.length > 60)!;
    const found = locateDungeonPosition(cell.narration, {}, tavern, quest.id);
    expect(found?.set).toBe('tavern');
    expect(found?.questId).toBe(quest.id);
  });
});

/**
 * Match rates over the whole committed corpus, pinned so a data refresh that
 * degrades detection fails loudly instead of quietly.
 *
 * The figures are measured, not aspirational, and the gap between them is the
 * argument for reading the walls at all: narration alone pins 78% of narrated
 * royal cells, the surroundings lift that to 90%. Tavern is far cleaner
 * because its narrations are near-unique to begin with.
 */
describe('corpus match rates', () => {
  const rate = (quests: Quest[], useSides: boolean): number => {
    let narrated = 0;
    let exact = 0;
    for (const quest of quests) {
      for (const cell of quest.cells) {
        if (!cell.narration.trim()) continue;
        narrated += 1;
        const observed: SideObservations = useSides
          ? {
            N: cell.edges.N.kind === 'open' ? 'open' : 'wall',
            E: cell.edges.E.kind === 'open' ? 'open' : 'wall',
            S: cell.edges.S.kind === 'open' ? 'open' : 'wall',
            W: cell.edges.W.kind === 'open' ? 'open' : 'wall',
          }
          : {};
        const found = matchCellsInQuest(quest, cell.narration, observed);
        if (found.length === 1 && found[0] === cell) exact += 1;
      }
    }
    return exact / narrated;
  };

  it('pins the royal rates, and that the sides earn their keep', () => {
    expect(rate(royal, false)).toBeCloseTo(0.781, 2);
    expect(rate(royal, true)).toBeCloseTo(0.905, 2);
  });

  it('pins the tavern rates', () => {
    expect(rate(tavern, false)).toBeCloseTo(0.984, 2);
    expect(rate(tavern, true)).toBeCloseTo(0.992, 2);
  });

  // Every cell must find *itself* among the candidates. A cell that matched
  // nothing would mean the matcher rejects the very data it was built from.
  it('never loses the true cell', () => {
    for (const quests of [royal, tavern]) {
      for (const quest of quests) {
        for (const cell of quest.cells) {
          if (!cell.narration.trim()) continue;
          const observed: SideObservations = {
            N: cell.edges.N.kind === 'open' ? 'open' : 'wall',
            E: cell.edges.E.kind === 'open' ? 'open' : 'wall',
            S: cell.edges.S.kind === 'open' ? 'open' : 'wall',
            W: cell.edges.W.kind === 'open' ? 'open' : 'wall',
          };
          expect(matchCellsInQuest(quest, cell.narration, observed)).toContain(cell);
        }
      }
    }
  });
});

describe('propagatePosition', () => {
  const at = (row: number, col: number, source: 'narration' | 'move' = 'narration'): QuestPosition => ({
    set: 'royal', questId: quest35.id, cells: [{ row, col }], exact: true, source,
  });
  /** An open-sided cell of quest 35 and its northern neighbour, from the data. */
  const openStep = quest35.cells.find((c) => c.edges.N.kind === 'open' && c.row > 0)!;

  it('steps one cell in the moved direction', () => {
    const cells = propagatePosition(at(openStep.row, openStep.col), 'N', quest35, {});
    expect(cells).toEqual([{ row: openStep.row - 1, col: openStep.col }]);
  });

  // The data's own account of whether the step was even possible. A wall means
  // the click cannot have moved the player, whatever the page then printed.
  it('refuses a step through a wall or a szel edge', () => {
    const walled = quest35.cells.find((c) => c.edges.N.kind === 'wall')!;
    expect(propagatePosition(at(walled.row, walled.col), 'N', quest35, {})).toEqual([]);
  });

  // Quest 35's doors sit on N/S edges only (no E-side door exists in this
  // maze), so this checks the direction the corpus actually has one for.
  it('allows a step through a door', () => {
    const doored = quest35.cells.find((c) => c.edges.S.kind === 'door')!;
    expect(propagatePosition(at(doored.row, doored.col), 'S', quest35, {}))
      .toEqual([{ row: doored.row + 1, col: doored.col }]);
  });

  it('refuses to step off the grid', () => {
    const top = quest35.cells.find((c) => c.row === 0 && c.edges.N.kind === 'open');
    if (top) expect(propagatePosition(at(0, top.col), 'N', quest35, {})).toEqual([]);
    expect(propagatePosition(at(0, 0), 'W', quest35, {})).toEqual([]);
  });

  it('drops a target the page contradicts', () => {
    const target = quest35.cells.find((c) => c.row === openStep.row - 1 && c.col === openStep.col)!;
    // Claim the opposite of one of the target's real sides.
    const lying: SideObservations = { S: target.edges.S.kind === 'open' ? 'wall' : 'open' };
    expect(propagatePosition(at(openStep.row, openStep.col), 'N', quest35, lying)).toEqual([]);
  });

  // The whole point of propagating a *list*: several candidates stepped and
  // filtered often leave one where no single page could.
  it('propagates every candidate of an ambiguous position', () => {
    const previous: QuestPosition = {
      set: 'royal', questId: quest35.id, exact: false, source: 'narration',
      cells: quest35.cells.filter((c) => c.edges.N.kind === 'open' && c.row > 0)
        .slice(0, 3).map((c) => ({ row: c.row, col: c.col })),
    };
    const cells = propagatePosition(previous, 'N', quest35, {});
    expect(cells.length).toBeGreaterThan(1);
    expect(cells.every((c) => previous.cells.some((p) => p.row === c.row + 1 && p.col === c.col))).toBe(true);
  });
});

describe('resolveDungeonPosition', () => {
  const cellAt = (row: number, col: number) =>
    quest35.cells.find((c) => c.row === row && c.col === col)!;
  const sidesOf = (cell: QuestCell): SideObservations => ({
    N: cell.edges.N.kind === 'open' ? 'open' : 'wall',
    E: cell.edges.E.kind === 'open' ? 'open' : 'wall',
    S: cell.edges.S.kind === 'open' ? 'open' : 'wall',
    W: cell.edges.W.kind === 'open' ? 'open' : 'wall',
  });
  /** A pair of vertically adjacent cells of quest 35 where the step is open. */
  const from = quest35.cells.find((c) =>
    c.edges.N.kind === 'open' && c.row > 0 && cellAt(c.row - 1, c.col).narration === '')!;
  const to = cellAt(from.row - 1, from.col);
  const previous: QuestPosition = {
    set: 'royal', questId: '35', cells: [{ row: from.row, col: from.col }], exact: true,
    source: 'narration',
  };

  it('falls back to the step when the page prints no cell text', () => {
    const resolved = resolveDungeonPosition('', sidesOf(to), royal, '35', previous, 'N');
    expect(resolved).toEqual({
      set: 'royal', questId: '35', cells: [{ row: to.row, col: to.col }], exact: true, source: 'move',
    });
  });

  it('keeps the narration match when there is no step to apply', () => {
    const resolved = resolveDungeonPosition(RESTED_AT_0_6, OBSERVED_AT_0_6, royal, '35', null, null);
    expect(resolved).toEqual(locateDungeonPosition(RESTED_AT_0_6, OBSERVED_AT_0_6, royal, '35'));
  });

  /**
   * Quest 16's narration "Hopp, zsákutca. Akkor vissza." is ambiguous between
   * (7,7) and (8,7); an exact step east from (7,6) — a real corridor in the
   * data — lands on (7,7) alone. This is the fixture that actually exercises
   * the intersection: unlike the quest-35 fixtures elsewhere in this file, the
   * narration here stays ambiguous (`exact: false`), so `resolveDungeonPosition`
   * cannot shortcut through `if (detected.exact) return detected;` before
   * reaching the intersection line — proven by mutation, see the fix report.
   */
  const quest16 = royal.find((q) => q.id === '16')!;
  const DEAD_END_NARRATION = 'Hopp, zsákutca. Akkor vissza.';

  it('intersects the two when both have something to say', () => {
    const start: QuestPosition = {
      set: 'royal', questId: '16', cells: [{ row: 7, col: 6 }], exact: true, source: 'narration',
    };
    const resolved = resolveDungeonPosition(DEAD_END_NARRATION, {}, royal, '16', start, 'E');
    expect(resolved).toEqual({
      set: 'royal', questId: '16', cells: [{ row: 7, col: 7 }], exact: true, source: 'move',
    });
  });

  // A locked door is drawn *and* offered: the click fails, the player never
  // moves, and the page still describes the old cell. Evidence must win, or the
  // marker confidently walks through a door the player could not open.
  //
  // The step here must actually succeed and land somewhere *other* than the
  // narrated cell — a step that fails outright (propagatePosition returns no
  // candidates) resolves through the earlier `if (stepped.length === 0) return
  // detected;` and never reaches this rule at all. (9,8) steps north cleanly
  // to (8,8), a real corridor the data agrees with even under `OBSERVED_AT_0_6`
  // — it is simply the wrong cell once the narration is consulted.
  it('believes the narration when the step disagrees, and drops the chain', () => {
    const resolved = resolveDungeonPosition(
      RESTED_AT_0_6, OBSERVED_AT_0_6, royal, '35',
      { set: 'royal', questId: '35', cells: [{ row: 9, col: 8 }], exact: true, source: 'narration' },
      'N',
    );
    expect(resolved?.cells).toEqual([{ row: 0, col: 6 }]);
    expect(resolved?.source).toBe('narration');
  });

  it('returns null when neither source knows anything', () => {
    expect(resolveDungeonPosition('', {}, royal, '35', null, null)).toBeNull();
  });

  // A step is only meaningful inside the maze it was taken in. This covers the
  // case resolved by the earlier `!quest` guard: the previous quest ('GOMB')
  // is not even in the `royal` list handed to this call.
  it('ignores a step from a position in another quest than the one matched', () => {
    const foreign: QuestPosition = {
      set: 'tavern', questId: 'GOMB', cells: [{ row: 0, col: 0 }], exact: true, source: 'narration',
    };
    const resolved = resolveDungeonPosition(RESTED_AT_0_6, OBSERVED_AT_0_6, royal, '35', foreign, 'N');
    expect(resolved?.questId).toBe('35');
  });

  /**
   * A second, distinct cross-quest case: `previous` names a quest ('24') that
   * *is* present in `royal`, so the step actually resolves (unlike the test
   * above, which never gets past the `!quest` guard). Quest 24's (8,7) steps
   * north to (7,7) — the very coordinate quest 16's ambiguous dead-end match
   * also names, purely by coincidence of numbering. Only the `set`/`questId`
   * guard stops that coincidence from being read as agreement: without it, the
   * quest-24 step would "confirm" one of quest 16's candidates and the result
   * would wrongly claim to be standing in quest 24 at (7,7), narrowed and
   * marked exact, instead of quest 16's genuine (still ambiguous) match.
   */
  it('refuses to let a step from a different quest of the same set narrow the match', () => {
    const quest24 = royal.find((q) => q.id === '24')!;
    expect(quest24.cells.find((c) => c.row === 8 && c.col === 7)?.edges.N.kind).not.toBe('wall');
    expect(quest16.cells.find((c) => c.row === 7 && c.col === 7)).toBeDefined();

    const previous: QuestPosition = {
      set: 'royal', questId: '24', cells: [{ row: 8, col: 7 }], exact: true, source: 'narration',
    };
    const resolved = resolveDungeonPosition(DEAD_END_NARRATION, {}, royal, '16', previous, 'N');
    expect(resolved).toEqual({
      set: 'royal',
      questId: '16',
      cells: [{ row: 7, col: 7 }, { row: 8, col: 7 }],
      exact: false,
      source: 'narration',
    });
  });
});

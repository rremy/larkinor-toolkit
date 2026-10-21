import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildPalette, decodePage, decodeText, labelledDoors, labelledKeys, labelMarkers, mazeTables,
  parseAlert, parseArchiveImage, parseArchiveQuestPage, readSide,
} from '../../scripts/quests/parseArchiveQuest.mjs';
import type { Quest } from '@/shared/data';

const page = (n: number): string => decodePage(readFileSync(`scripts/quests/archive/${n}.htm`));

/** The parser is plain JS; its output is the shared `Quest` shape. */
const parse = (n: number, resolve: (base: string, label: string) => null = () => null): Quest[] =>
  parseArchiveQuestPage(page(n), n, resolve) as Quest[];

describe('decodePage / decodeText', () => {
  // No page declares a charset; 0xF5 is ő in Windows-1250 (õ in Latin-1).
  it('reads the bytes as Windows-1250', () => {
    expect(decodePage(Uint8Array.from([0x6b, 0xf5, 0x96]))).toBe('kő–');
  });

  // The pages also spell ő/ű as Latin-1 entities — the mojibake that once
  // broke monster-name matching (see CLAUDE.md).
  it('folds the õ/û spellings back to ő/ű', () => {
    expect(decodeText('k&ouml;vetkez&otilde; sz&ouml;rny&ucirc; &#245;')).toBe('következő szörnyű ő');
  });
});

describe('readSide', () => {
  it('reads per-side style and colour', () => {
    const style = 'border-color:black; border-top-style:solid; border-right-style:dotted; border-right-color:red;';
    expect(readSide(style, 'N')).toEqual({ style: 'solid', colour: 'black' });
    expect(readSide(style, 'E')).toEqual({ style: 'dotted', colour: 'red' });
  });

  // Quest 54 leaves whole rows of cells unstyled: an open field.
  it('treats an unstyled side as open', () => {
    expect(readSide('', 'S')).toEqual({ style: 'none', colour: 'black' });
  });

  it('falls back to the border shorthands', () => {
    expect(readSide('border-style:solid; border-color:rgb(255, 153, 0);', 'W'))
      .toEqual({ style: 'solid', colour: 'rgb(255,153,0)' });
  });
});

describe('labelledDoors', () => {
  it('assigns a lock to every direction before it', () => {
    expect(labelledDoors('Észak-skivei barbár északra és jobbra aranyajtó')).toEqual({ N: 'arany', E: 'arany' });
  });

  it('reads several doors in one label', () => {
    expect(labelledDoors('északra aranyajtó jobbra platinaajtó délre brnntajtó balra aranyajtó'))
      .toEqual({ N: 'arany', E: 'platina', S: 'bronz', W: 'arany' });
  });

  it('lets no prose word carry a direction to a later door', () => {
    expect(labelledDoors('Délre nézel, a varázsajtó')).toEqual({});
  });
});

describe('buildPalette', () => {
  const side = (colour: string) => ({ style: 'solid', colour });
  const none = { style: 'none', colour: 'black' };
  const cell = (label: string, east: string) => ({
    label, sides: { N: none, E: side(east), S: none, W: none }, src: '', alert: '',
  });

  // Quest 46 draws its thief doors red, where the legend has red for réz.
  it("lets a quest's own labels outvote the legend", () => {
    const palette = buildPalette([cell('Jobbra tolvajajtó', 'red'), cell('Jobbra tolvajajtó', 'red')]);
    expect(palette.red).toBe('tolvaj');
  });

  it('falls back to the legend for a colour no label names', () => {
    expect(buildPalette([cell('Óriásharcos', 'aqua')]).aqua).toBe('tolvaj');
    expect(buildPalette([])['rgb(102,153,0)']).toBe('varazs');
  });
});

describe('parseArchiveImage', () => {
  it('splits a key cell into monster and lock', () => {
    expect(parseArchiveImage('46_elemei/oriasharcos_cso.jpg')).toMatchObject({ base: 'oriasharcos', key: 'cso' });
  });

  it('drops the sprite suffix _k', () => {
    expect(parseArchiveImage('54_elemei/eszmeletlentivor_k.gif').base).toBe('eszmeletlentivor');
  });

  it('reads question tiles, with or without a key', () => {
    expect(parseArchiveImage('kerdes_small1.jpg')).toMatchObject({ base: null, question: true });
    expect(parseArchiveImage('kerdes_small1_platina.jpg')).toMatchObject({ base: null, question: true, key: 'platina' });
    expect(parseArchiveImage('kerdes_small_halal.jpg')).toMatchObject({ question: true, death: true });
    expect(parseArchiveImage('paradzsavoroslovagja_kerdes.gif')).toMatchObject({ base: 'paradzsavoroslovagja', question: true });
  });

  it('never takes scenery, teleports or pickups for a monster', () => {
    for (const src of ['ures.gif', 'bejarat.jpg', 'elevator.gif', 'tp_12.gif', 'vizmagiatekercse.gif']) {
      expect(parseArchiveImage(src).base, src).toBeNull();
    }
    expect(parseArchiveImage('bejarat.jpg').entrance).toBe(true);
  });

  // Which keys a several-key cell gives, only its label says.
  it('strips the several-keys markers', () => {
    expect(parseArchiveImage('bukottangyal_ketto.gif')).toMatchObject({ base: 'bukottangyal', key: null });
    expect(parseArchiveImage('dombmelak_kulcsok.gif').base).toBe('dombmelak');
  });
});

describe('labelledKeys / labelMarkers', () => {
  it('lists every key a label names', () => {
    expect(labelledKeys('Csontváz 1 db. vaskulcs, 10 db. rézkulcs, 5 db. csőkulcs')).toEqual(['vas', 'rez', 'cso']);
  });

  // Quest 60 writes `csőkulcs` where it means a door.
  it('skips a key word that follows a direction', () => {
    expect(labelledKeys('Gúzsszalag aranykulcs északra aranyajtó keletre és délre csőkulcs')).toEqual(['arany']);
  });

  it('reads the other markers', () => {
    expect(labelMarkers('Törpeóriás Külditárgy Északra platinaajtó Kijárat'))
      .toMatchObject({ questItem: true, exit: true, trap: false });
    expect(labelMarkers('Csapda Egy').trap).toBe(true);
  });
});

describe('parseAlert', () => {
  it('keeps plain narration on one line', () => {
    expect(parseAlert('Egy.\nKettő.')).toEqual({ narration: 'Egy. Kettő.', question: null });
  });

  it('splits choices and their outcomes, and the closing question', () => {
    const parsed = parseAlert("Egy szellem állít meg. ''Mennyi 2*2?''\n\n---\\> 4 (kivág)\n---\\> 5 (ez a jó)\n---\\> 6");
    expect(parsed.question?.choices).toEqual([
      { index: 1, text: '4', outcome: 'kivág' },
      { index: 2, text: '5', outcome: 'ez a jó' },
      { index: 3, text: '6', outcome: '' },
    ]);
    expect(parsed.narration).toBe("Egy szellem állít meg. ''Mennyi 2*2?''");
  });

  it('pulls a closing question sentence out as the prompt', () => {
    const parsed = parseAlert('Egy inda lóg a fáról. Tehát meghúzod?\n\n---\\> Meghúzom. (teleport!)');
    expect(parsed.narration).toBe('Egy inda lóg a fáról.');
    expect(parsed.question?.prompt).toBe('Tehát meghúzod?');
  });

  it('keeps an outcome with text after it, and drops the door note', () => {
    const parsed = parseAlert('Megkapaszkodsz?\n\n---\\> Á, dehogy! (Ez a jó) teleport_6\n\nJobbra és balra csőajtó');
    expect(parsed.question?.choices).toEqual([{ index: 1, text: 'Á, dehogy!', outcome: 'Ez a jó teleport_6' }]);
  });
});

describe('mazeTables', () => {
  // 50 wraps its maze in a layout table and adds a teleport legend after it.
  it('finds only the maze in a page with layout and legend tables', () => {
    expect(mazeTables(page(50))).toHaveLength(1);
  });

  it('finds all four floors of 59', () => {
    expect(mazeTables(page(59))).toHaveLength(4);
  });
});

describe('parseArchiveQuestPage', () => {
  it('reads the brief, the reward and the maze of quest 46', () => {
    const [quest] = parse(46);
    expect(quest).toMatchObject({ id: '46', set: 'royal', title: '46', rows: 20, cols: 6 });
    expect(quest.description).toMatch(/^Kémeink jelentették/);
    expect(quest.reward).toBe('100000 ezüst, 1 manógomba, 10 aqua dei');
  });

  // 46 (6,1)–(6,2): the thief's door drawn solid on (6,1)'s east and dotted on
  // (6,2)'s west — a door from one side, a corridor from the other.
  it('reads a dotted side as the open half of a one-sided door', () => {
    const [quest] = parse(46);
    const at = (row: number, col: number) => quest.cells.find((c) => c.row === row && c.col === col)!;
    expect(at(6, 1).edges.E).toEqual({ kind: 'door', lock: 'tolvaj' });
    expect(at(6, 2).edges.W).toEqual({ kind: 'open' });
  });

  it('splits quest 59 into floors, the ground floor keeping the plain id', () => {
    const floors = parse(59);
    expect(floors.map((q) => [q.id, q.floor])).toEqual([['59', 'F'], ['59-1', '−1'], ['59-2', '−2'], ['59-3', '−3']]);
  });

  it('passes the label to the resolver, for a sprite the author misspelt', () => {
    const seen: string[] = [];
    parse(47, (base, label) => {
      if (base === 'vamirlord') seen.push(label);
      return null;
    });
    expect(seen).toEqual(['Vámpírlord']);
  });
});

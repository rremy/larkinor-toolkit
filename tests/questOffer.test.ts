import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { matchTavernQuest, parseGridHint } from '../src/utils/questOffer';
import type { Quest } from '@/shared/data';

const quests: Quest[] = JSON.parse(readFileSync('static/db/tavern-quests.json', 'utf-8'));

/**
 * A real pub quest note, captured from the live game on 2026-08-14 (the
 * `font[face="Comic sans MS"]` block, `<br>`s converted to newlines). The
 * quest brief is embedded verbatim in the middle of it, wrapped in the
 * barman's flavour text before and after — which is exactly what makes the
 * match tractable, and exactly why the matcher must not assume the narration
 * *is* the description.
 */
const ZURKHAS_NOTE = `Csókos Zotan kitölt neked egy korsó import sört. Fizetsz, majd felhajtod... Ez jól esett, de az import sörtől semmilyen előnyre nem tettél szert.
Odalép hozzád egy sötét ruhás alak és átad egy papírfecnit! "Ha teljesíted a leírtakat, akkor jutalmat kapsz tőlem." - mondja.
A papíron egy térkép van és a következő szöveget olvasod:
Tudomásunkra jutott, hogy Zurkhas, a vén varázsló új tipusú varázslatokat fejlesztett ki. Most toborozza az embereit, akiket Managernek hívnak, és el akarja foglalni a szigetet. Kémeket küldtünk hozzá, akik neked is segitenek majd. Felismered őket, mert rá lesz irva a ruhájukra, hogy "emberi erőforrás manager". Zurkhas egy nagy varázslatra készül, melynek segítségével minden larkinori tudatát befolyásolni tudná. Ehhez a varázslathoz emberek lelkét orozza el. Akadályozd meg a varázslót ebben! Segíts nekünk, Zurkhas az összes kocsmát be akarja záratni, és valami megdonálszot akar nyitni a helyükön! Hozd el a varázsló varázstekercsét! (10x10, 26- )
Miután elolvastad a szöveget az idegen felé fordulsz, de már nem találod a kocsmában. Elgondolkozol azon hogy elég jó vagy-e ahhoz hogy elvállald vagy inkább tovább iszol...`;

/** An ordinary pub visit: a drink, no quest note. */
const PLAIN_DRINK = `Csókos Zotan kitölt neked egy korsó import sört. Fizetsz, majd felhajtod...
Ez jól esett, de az import sörtől semmilyen előnyre nem tettél szert.`;

describe('parseGridHint', () => {
  it('reads the dimensions out of a quest note', () => {
    expect(parseGridHint(ZURKHAS_NOTE)).toEqual({ cols: 10, rows: 10 });
  });

  // Width first, not height: measured across the 13 committed descriptions
  // that state a size — 5 non-square ones match only when transposed and none
  // matches as rows x cols. `fajatek` is one of the five: it states 9x5 for a
  // grid of 5 rows by 9 columns.
  it('reads the first number as the width, matching the source convention', () => {
    const fajatek = quests.find((q) => q.id === 'fajatek');
    const hint = parseGridHint(fajatek!.description);
    expect(hint).toEqual({ cols: 9, rows: 5 });
    expect([fajatek!.rows, fajatek!.cols]).toEqual([5, 9]);
  });

  it('tolerates spacing around the separator', () => {
    expect(parseGridHint('... (8 x 12, 25-27 szintre)')).toEqual({ cols: 8, rows: 12 });
  });

  it('returns null when the note carries no dimensions', () => {
    expect(parseGridHint(PLAIN_DRINK)).toBeNull();
  });
});

describe('matchTavernQuest', () => {
  it('identifies the quest whose description the note embeds', () => {
    const hit = matchTavernQuest(ZURKHAS_NOTE, quests);
    expect(hit?.quest.id).toBe('Zurkhas');
    expect(hit?.quest.title).toBe('Zurkhas');
  });

  // The whole point: no quest note means the user's current selection must
  // not be disturbed.
  it('matches nothing on an ordinary pub visit', () => {
    expect(matchTavernQuest(PLAIN_DRINK, quests)).toBeNull();
  });

  it('matches nothing in empty or whitespace narration', () => {
    expect(matchTavernQuest('', quests)).toBeNull();
    expect(matchTavernQuest('   \n  ', quests)).toBeNull();
  });

  it('matches nothing when there are no quests to match against', () => {
    expect(matchTavernQuest(ZURKHAS_NOTE, [])).toBeNull();
  });

  // Accent folding matters: the game and the scraped data disagree often
  // enough on Hungarian diacritics that an exact compare would be brittle.
  it('still matches when the note loses its accents', () => {
    const stripped = ZURKHAS_NOTE.normalize('NFD').replace(/[̀-ͯ]/g, '');
    expect(matchTavernQuest(stripped, quests)?.quest.id).toBe('Zurkhas');
  });

  it('still matches when whitespace and line breaks differ', () => {
    expect(matchTavernQuest(ZURKHAS_NOTE.replace(/\s+/g, ' '), quests)?.quest.id).toBe('Zurkhas');
  });

  // A verbatim brief outranks a contradicting size, because the source's own
  // sizes are demonstrably unreliable: 6 of the 13 descriptions stating one
  // disagree with the maze actually drawn. Prose is the evidence; dimensions
  // only harden the fuzzy path.
  it('keeps a verbatim match even when the stated size contradicts it', () => {
    const tampered = ZURKHAS_NOTE.replace('(10x10, 26- )', '(3x3, 26- )');
    expect(matchTavernQuest(tampered, quests)?.quest.id).toBe('Zurkhas');
  });

  it('reports which rule fired, so a weak match is distinguishable', () => {
    expect(matchTavernQuest(ZURKHAS_NOTE, quests)?.method).toBe('signature');
  });

  it('accepts a text match when the grid hint agrees', () => {
    const hit = matchTavernQuest(ZURKHAS_NOTE, quests);
    expect(hit?.quest.rows).toBe(10);
    expect(hit?.quest.cols).toBe(10);
  });

  // A note with no dimensions is still matchable — the hint only vetoes when
  // present, so quests whose notes omit it are not silently unmatchable.
  it('matches on prose alone when the note omits the dimensions', () => {
    const noHint = ZURKHAS_NOTE.replace(' (10x10, 26- )', '');
    expect(matchTavernQuest(noHint, quests)?.quest.id).toBe('Zurkhas');
  });

  // Guards the margin rule: a handful of shared common words must not be
  // enough to claim a match.
  it('does not match on incidental shared vocabulary', () => {
    const vague = 'A varázsló és a kocsma. Elmész a szigetre, majd visszatérsz a városba.';
    expect(matchTavernQuest(vague, quests)).toBeNull();
  });

  // Guards MIN_OVERLAP specifically, which the margin rule alone does not:
  // this narration is built from half of one quest's own distinctive words
  // and nothing else, so the runner-up scores ~0 and the margin is satisfied.
  // Only the absolute threshold can reject it — and it must, because half a
  // description is not evidence the player was handed that quest.
  it('rejects a partial description even with no competing candidate', () => {
    const target = quests.find((q) => q.id === 'Thordus')!;
    const words = [...new Set(
      target.description
        .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ').trim()
        .split(' ').filter((w) => w.length >= 5),
    )];
    // Half the words, reordered so no verbatim run survives for the
    // signature rule to latch onto.
    const half = words.filter((_, i) => i % 2 === 0).reverse().join(' ');
    const hit = matchTavernQuest(half, quests);
    expect(hit).toBeNull();
  });

  // Guards MARGIN. Two quests sharing most of their vocabulary is not
  // hypothetical — several tavern descriptions are under 20 significant
  // words, where a narration can clear 60% of one while still clearing 60%
  // of another. When the two are that close, refusing is right: activating
  // the wrong quest is worse than activating none. Synthetic quests here so
  // the case is exact rather than dependent on which real descriptions
  // happen to be short.
  it('refuses to choose between two quests it cannot separate', () => {
    const make = (id: string, description: string): Quest => ({
      id, set: 'tavern', title: id, description, reward: '', rows: 1, cols: 1, cells: [],
    });
    const pair = [
      make('alpha', 'alfaword betaword gammaword deltaword epszilonword zetaword'),
      make('beta', 'alfaword betaword gammaword deltaword sigmaword omegaword'),
    ];
    // Alpha's own words, reversed — so the verbatim signature cannot fire and
    // the overlap path is what decides. Alpha scores 1.0, beta 0.67.
    const scrambled = 'zetaword epszilonword deltaword gammaword betaword alfaword';
    expect(matchTavernQuest(scrambled, pair)).toBeNull();
  });

  // Every quest's own description must identify itself — this sweeps the
  // whole corpus rather than trusting the one note I happened to capture.
  it('round-trips: every quest description identifies its own quest', () => {
    const misses: string[] = [];
    for (const q of quests) {
      const hit = matchTavernQuest(`Elolvasod a papírfecnit: ${q.description}`, quests);
      if (hit?.quest.id !== q.id) misses.push(`${q.id} -> ${hit?.quest.id ?? 'null'}`);
    }
    expect(misses).toEqual([]);
  });
});

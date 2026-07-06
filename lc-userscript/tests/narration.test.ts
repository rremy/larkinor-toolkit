import { describe, it, expect } from 'vitest';
import { findMonsterMentions } from '../src/utils/narration';

describe('findMonsterMentions', () => {
  it('captures the monster from "Valami X csámborog a közelben!"', () => {
    const m = findMonsterMentions('Valami Vasszűz csámborog a közelben! Megtámadod?');
    expect(m.map(x => x.name)).toEqual(['Vasszűz']);
  });

  it('captures the monster from "X feléd indul!"', () => {
    const m = findMonsterMentions('Vasszűz feléd indul!');
    expect(m.map(x => x.name)).toEqual(['Vasszűz']);
  });

  it('captures the monster from "Megpróbálsz elmenekülni X elől"', () => {
    const m = findMonsterMentions('Megpróbálsz elmenekülni Vasszűz elől...');
    expect(m.map(x => x.name)).toEqual(['Vasszűz']);
  });

  it('captures the monster from "X nem hagy békén, követ!"', () => {
    const m = findMonsterMentions('Vasszűz nem hagy békén, követ!');
    expect(m.map(x => x.name)).toEqual(['Vasszűz']);
  });

  it('captures multi-word monster names', () => {
    const m = findMonsterMentions('Valami Goblin felderítőcsapat csámborog a közelben!');
    expect(m[0].name).toBe('Goblin felderítőcsapat');
  });

  it('finds multiple mentions across sentences and reports their positions', () => {
    const text = 'Megpróbálsz elmenekülni Vasszűz elől...Vasszűz nem hagy békén, követ!';
    const m = findMonsterMentions(text);
    expect(m.length).toBe(2);
    // each reported span points at the actual "Vasszűz" substring
    for (const span of m) {
      expect(text.slice(span.index, span.index + span.length)).toBe('Vasszűz');
    }
    // positions are ascending
    expect(m[0].index).toBeLessThan(m[1].index);
  });

  it('returns nothing when no encounter template is present', () => {
    expect(findMonsterMentions('Sehol egy koldus, vagy rossz szándékú ember!')).toEqual([]);
    expect(findMonsterMentions('')).toEqual([]);
  });

  it('does not let a name capture cross sentence boundaries', () => {
    const text = 'A Parszi léghajó nálad van.Vasszűz feléd indul!';
    const m = findMonsterMentions(text);
    expect(m.map(x => x.name)).toEqual(['Vasszűz']);
  });
});

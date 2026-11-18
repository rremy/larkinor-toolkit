import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { LARKINOR_MARKET_ID, marketLabel } from '../src/shared/markets';
import { marketIdOf } from '../src/utils/marketExtract';

const page = (body: string) => new JSDOM(`<html><body>${body}</body></html>`).window.document;

describe('marketIdOf', () => {
  it("reads Larkinor's market from its building picture", () => {
    expect(marketIdOf(page('<img src="https://l2.larkinor.hu/2/epulet/54piac.gif" title="piac">'))).toBe('54');
  });

  it("reads the island's market, whose grid id is negative", () => {
    expect(marketIdOf(page('<img src="./Piac-2_files/-1627piac.gif" title="piac">'))).toBe('-1627');
  });

  it('ignores the buy button and a picture with no grid id', () => {
    expect(marketIdOf(page('<input type="image" src="/2/gomb/piacvesz.gif"><img src="/2/epulet/piac.gif">'))).toBeNull();
  });
});

describe('marketLabel', () => {
  it('names the known markets', () => {
    expect(LARKINOR_MARKET_ID).toBe('54');
    expect(marketLabel('54')).toBe('Larkinor');
    expect(marketLabel('-1627')).toBe('Thord-Artin');
  });

  it('labels an unknown market by its picture id', () => {
    expect(marketLabel('77')).toBe('Piac (77)');
  });
});

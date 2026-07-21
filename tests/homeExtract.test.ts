import { describe, it, expect } from 'vitest';
import { parseCuccDetail } from '../src/utils/homeExtract';

describe('parseCuccDetail', () => {
  it('parses a stacked plain item', () => {
    const d = parseCuccDetail(
      'Név: opál\nSúly: 0.05 kg.\nÁr: 20 ezüst\nMennyiség: 20\nÖsszár: 400 ezüst\nÖsszsúly: 1 kg.\n'
    );
    expect(d.name).toBe('opál');
    expect(d.type).toBe('tárgy');
    expect(d.weight).toBe(0.05);
    expect(d.amount).toBe(20);
    expect(d.totalWeight).toBe(1);
    expect(d.price).toBe(20);
    expect(d.magical).toBe(false);
  });

  it('parses a magical weapon with no Mennyiség (defaults amount to 1)', () => {
    const d = parseCuccDetail(
      'Típus: fegyver\nNév: mágikus fejsze\nSúly: 1.8 kg.\nÁr: 1000 ezüst\nMin. szint: 15\nMaximum sebzés: 64\nMágikus!!!\n'
    );
    expect(d.type).toBe('fegyver');
    expect(d.amount).toBe(1);
    expect(d.totalWeight).toBeCloseTo(1.8);
    expect(d.magical).toBe(true);
    expect(d.attrs).toContainEqual(['Maximum sebzés', '64']);
  });

  it('parses armor and leaves price null when absent', () => {
    const d = parseCuccDetail('Név: bronzkulcs\nSúly: 0.3 kg.\nExtra: kulcs\n');
    expect(d.type).toBe('tárgy');
    expect(d.price).toBeNull();
  });
});

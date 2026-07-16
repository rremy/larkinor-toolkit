import { describe, it, expect, vi } from 'vitest';
import { HOTKEY_CATALOG, getHotkey, hotkeyIconUrl, partitionHotkeys } from '../src/utils/hotkeys';
import type { Action } from '../src/utils/domExtract';

const act = (label: string, actionKey?: string): Action => ({ label, actionKey, trigger: vi.fn() });

describe('hotkey catalog', () => {
  it('covers the observed free-move tevFajta actions', () => {
    const keys = HOTKEY_CATALOG.map(h => h.key);
    expect(keys).toEqual([
      'kajal', 'imadkozas', 'manaital', 'mobilidoxin',
      'vargyogy', 'burok', 'as', 'ongyilok', 'kilep',
    ]);
  });

  it('looks up a hotkey by its tevFajta value', () => {
    expect(getHotkey('vargyogy')?.icon).toBe('sc_gyogyvarazs');
    expect(getHotkey('burok')?.icon).toBe('sc_durex'); // irregular: shield -> durex
    expect(getHotkey('as')?.icon).toBe('sc_asas'); // "ásol" (dig)
    expect(getHotkey('nincs')).toBeUndefined();
  });

  it('builds the absolute icon URL from the catalog entry', () => {
    expect(hotkeyIconUrl(getHotkey('kajal')!)).toBe('https://l2.larkinor.hu/2/ikon/sc_kaja.gif');
  });
});

describe('partitionHotkeys', () => {
  it('splits actions into enabled+catalogued hotkeys and the rest', () => {
    const actions = [act('kajálsz', 'kajal'), act('imádkozol', 'imadkozas'), act('Körülnéz')];
    const { hotkeyActions, buttonActions } = partitionHotkeys(actions, ['kajal']);
    expect(hotkeyActions.map(a => a.actionKey)).toEqual(['kajal']);
    expect(buttonActions.map(a => a.label)).toEqual(['imádkozol', 'Körülnéz']);
  });

  it('does not promote an enabled key that is not in the catalog', () => {
    const actions = [act('valami', 'nincs_ilyen')];
    const { hotkeyActions, buttonActions } = partitionHotkeys(actions, ['nincs_ilyen']);
    expect(hotkeyActions).toEqual([]);
    expect(buttonActions.length).toBe(1);
  });

  it('leaves everything as buttons when nothing is enabled', () => {
    const actions = [act('kajálsz', 'kajal')];
    const { hotkeyActions, buttonActions } = partitionHotkeys(actions, []);
    expect(hotkeyActions).toEqual([]);
    expect(buttonActions.length).toBe(1);
  });
});

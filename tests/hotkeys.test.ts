import { describe, it, expect, vi } from 'vitest';
import { DOCK_HOTKEY_CATALOG, HOTKEY_CATALOG, REST_HOTKEY, getHotkey, hotkeyIconUrl, partitionHotkeys, withRestAction } from '../src/utils/hotkeys';
import type { Action } from '../src/utils/domExtract';

const act = (label: string, actionKey?: string): Action => ({ label, actionKey, trigger: vi.fn() });

describe('hotkey catalog', () => {
  it('covers the observed free-move tevFajta actions', () => {
    const keys = HOTKEY_CATALOG.map(h => h.key);
    expect(keys).toEqual([
      'kajal', 'imadkozas', 'manaital', 'mobilidoxin', 'csodaflaska',
      'vargyogy', 'homeport', 'burok', 'as', 'ongyilok', 'kilep',
    ]);
  });

  it('maps "kiüríted a csodaflaskát" to its icon', () => {
    // Both read off the live page: option value `csodaflaska`, and a GIF served
    // at /2/ikon/sc_csodaflaska.gif.
    expect(hotkeyIconUrl(getHotkey('csodaflaska')!)).toBe('https://l2.larkinor.hu/2/ikon/sc_csodaflaska.gif');
  });

  it('maps "elmondasz egy hómportot" to its irregular icon', () => {
    // The tevFajta value carries an extra "e" the icon name does not; both were
    // read off the live page (option value, and a 48x29 icon that loads).
    expect(getHotkey('homeport')?.icon).toBe('sc_homport');
    expect(hotkeyIconUrl(getHotkey('homeport')!)).toBe('https://l2.larkinor.hu/2/ikon/sc_homport.gif');
  });

  it('offers every catalogued action in the config list with a label and icon', () => {
    // The config drawer renders straight from the catalog, so an entry missing
    // either field would ship an unlabelled or broken row.
    for (const hk of HOTKEY_CATALOG) {
      expect(hk.label.length, hk.key).toBeGreaterThan(0);
      expect(hk.icon.startsWith('sc_'), hk.key).toBe(true);
    }
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

describe('the rest quick action', () => {
  const rest = { label: 'Pihensz egy kicsit', trigger: vi.fn() };

  it('uses the page\'s own rest icon, which carries no sc_ prefix', () => {
    // The fixtures' rest control: <input type="image" src="/2/ikon/pihen.gif">.
    expect(hotkeyIconUrl(REST_HOTKEY)).toBe('https://l2.larkinor.hu/2/ikon/pihen.gif');
  });

  it('is offered by the dock config only, and first', () => {
    expect(DOCK_HOTKEY_CATALOG[0]).toBe(REST_HOTKEY);
    expect(HOTKEY_CATALOG).not.toContain(REST_HOTKEY);
  });

  it('leads the actions when enabled and on the page', () => {
    const actions = withRestAction([act('kajálsz', 'kajal')], rest, ['kajal', 'pihen']);
    expect(actions.map(a => a.actionKey)).toEqual(['pihen', 'kajal']);
    const { hotkeyActions } = partitionHotkeys(actions, ['kajal', 'pihen']);
    expect(hotkeyActions.map(a => a.actionKey)).toEqual(['pihen', 'kajal']);
    actions[0].trigger();
    expect(rest.trigger).toHaveBeenCalledTimes(1);
  });

  it('is left out when not enabled, or when the page has no rest control', () => {
    const actions = [act('kajálsz', 'kajal')];
    expect(withRestAction(actions, rest, ['kajal'])).toBe(actions);
    expect(withRestAction(actions, null, ['pihen'])).toBe(actions);
  });
});

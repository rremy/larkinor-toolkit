import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { Character } from '../src/pages/Character';
import { CHARACTER_TAB_KEY } from '../src/utils/config';
import { sortPrefKey } from '../src/hooks/useStoredSort';
import type { BackpackItem, CharacterPageState } from '../src/utils/characterPageExtract';
import { emptySlots } from '../src/shared/loadout';

function item(name: string, index: number, over: Partial<BackpackItem> = {}): BackpackItem {
  return {
    name, index, id: String(index), slots: [], bulkIndex: index, marketPrice: null,
    type: 'tárgy', weight: 1, amount: 1, totalWeight: 1, price: 10, magical: false, attrs: [],
    ...over,
  };
}

function makeState(over: Partial<CharacterPageState> = {}): CharacterPageState {
  return {
    name: 'Remy', level: 34, xp: 77718605, hp: { current: 500, max: 573 }, mp: { current: 416, max: 416 }, defense: 124,
    load: { used: 62.4, max: 146 },
    loadout: {
      version: 2, playerLevel: 34, capturedAt: 0,
      slots: { ...emptySlots(), head: { name: 'dracoacél sisak', kind: 'vért', type: 'fejre', level: 32, maxDamage: null, spread: null, defense: 33, magical: false, vampiric: false } },
    },
    backpack: [
      item('arany', 0, { amount: 88 }),
      item('bot', 1, { type: 'fegyver', slots: ['rightHand', 'leftHand'] }),
      item('bőrsisak', 2, { type: 'vért', slots: ['head'] }),
    ],
    equip: vi.fn(), drop: vi.fn(), dropMany: vi.fn(),
    stowWorn: null,
    attributes: [{ key: 'ero', label: 'Erő', value: 45 }, { key: 'iq', label: 'Intelligencia', value: 7 }],
    freePoints: 2,
    saveAttributes: vi.fn(),
    stance: { options: [{ value: '0', label: 'félénk' }, { value: '2', label: 'átlagos' }], selected: '2', save: vi.fn() },
    quickKey: null,
    curses: [{ name: 'Semmi ilyesmi nincs rajtad!!!', count: null, iconUrl: null }],
    attackSpells: [], skills: [{ name: 'Mágia', value: '10' }], otherSpells: [],
    emailPrivacy: null,
    exit: { label: 'Kilépés a karakterlapból', iconUrl: '', trigger: vi.fn() },
    ...over,
  };
}

function tab(name: RegExp): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('.lc-home-tab')].find((b) => name.test(b.textContent ?? ''));
  if (!found) throw new Error(`no tab matching ${name}`);
  return found;
}

function rowFor(container: Element, name: string): Element {
  const row = [...container.querySelectorAll('.lc-mkt-row')].find((r) => r.querySelector('.lc-mkt-name')?.textContent?.trim() === name);
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

const buttonIn = (root: Element, text: RegExp) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => text.test(b.textContent ?? ''))!;

describe('Character (mobile)', () => {
  beforeEach(() => {
    GM_setValue(CHARACTER_TAB_KEY, '');
    GM_setValue(sortPrefKey('character-backpack'), '');
  });

  it('opens on the overview: figures, the worn set and the curses', () => {
    const { container } = render(<Character state={makeState()} />);
    expect(tab(/Karakter/).classList.contains('lc-home-tab--active')).toBe(true);
    expect(container.textContent).toContain('dracoacél sisak');
    expect(container.textContent).toContain('védelem: 33');
    expect(container.textContent).toContain('Semmi ilyesmi nincs rajtad!!!');
  });

  it('shows life and mana current first, the way the stat bar does', () => {
    const { container } = render(<Character state={makeState()} />);
    const figure = (label: string) => [...container.querySelectorAll('.lc-bld-figure')]
      .find((f) => f.querySelector('span')!.textContent === label)!.querySelector('b')!.textContent;
    expect(figure('Életpont')).toBe('500 / 573');
  });

  it('names a curse beside its icon, with its figure', () => {
    const s = makeState({
      curses: [{ name: 'Méreg! Mozgás közben sebződsz!', count: 1, iconUrl: 'https://l2.larkinor.hu/2/ikon/vanmereg.gif' }],
    });
    const { container } = render(<Character state={s} />);
    const row = container.querySelector('.lc-char-curse')!;
    expect(row.querySelector('img')!.getAttribute('src')).toBe('https://l2.larkinor.hu/2/ikon/vanmereg.gif');
    expect(row.textContent).toContain('Méreg! Mozgás közben sebződsz!');
    expect(row.querySelector('b')!.textContent).toBe('1');
  });

  it('offers each slot the backpack items that fit it, right beside the worn one', () => {
    const s = makeState();
    const { container } = render(<Character state={s} />);
    const slotRow = (label: string) => [...container.querySelectorAll('.lc-char-slot')]
      .find((r) => r.querySelector('.lc-char-slot-label')!.textContent === label)!;

    // Nothing fits the legs: said outright, so an absent button is not a mystery.
    expect(slotRow('Láb').textContent).toContain('Nincs ide való tárgy');

    const head = slotRow('Fej');
    fireEvent.click(buttonIn(head, /Csere — 1 tárgy/));
    fireEvent.click(buttonIn(head, /Felvesz/));
    expect(s.equip).toHaveBeenCalledWith(s.backpack[2], 'head');

    // A weapon is offered to both hands.
    fireEvent.click(buttonIn(slotRow('Bal kéz'), /Csere/));
    expect(slotRow('Bal kéz').textContent).toContain('bot');
  });

  it('leaves the page from the ✕ beside the database button, on every tab', () => {
    const s = makeState();
    const { container } = render(<Character state={s} />);
    for (const name of [/Karakter/, /Hátizsák/, /Fejlődés/]) {
      fireEvent.click(tab(name));
      // The page's own wide exit button is gone; the header's ✕ is the one way out.
      expect([...container.querySelectorAll('.lc-home-act')].some((b) => /Kilépés/.test(b.textContent ?? ''))).toBe(false);
    }
    const close = container.querySelector<HTMLButtonElement>('.lc-mkt-stats .lc-exit-btn')!;
    expect(close.previousElementSibling!.getAttribute('aria-label')).toBe('Adatbázis');

    fireEvent.click(close);

    expect(s.exit!.trigger).toHaveBeenCalled();
  });

  it('remembers the tab across the reload every action causes', () => {
    render(<Character state={makeState()} />);
    fireEvent.click(tab(/Hátizsák/));
    expect(GM_getValue(CHARACTER_TAB_KEY, '')).toBe('backpack');
  });

  it('offers only the slots an item fits, and equips into the one pressed', () => {
    GM_setValue(CHARACTER_TAB_KEY, 'backpack');
    const s = makeState();
    const { container } = render(<Character state={s} />);

    expect(rowFor(container, 'arany').querySelector('.lc-char-equip')).toBeNull();
    expect([...rowFor(container, 'bot').querySelectorAll('.lc-char-equip button')].map((b) => b.textContent)).toEqual(['Jobb kéz', 'Bal kéz']);
    fireEvent.click(buttonIn(rowFor(container, 'bőrsisak'), /^Fej$/));

    expect(s.equip).toHaveBeenCalledWith(s.backpack[2], 'head');
  });

  describe('backpack sorting', () => {
    // sárkánykarom: heavy stack, light unit; csodatarisznya: heavy unit, one of it;
    // antiballaszt: negative weight, no price.
    const pack = () => makeState({
      backpack: [
        item('sárkánykarom', 0, { amount: 11, weight: 1, totalWeight: 11, price: 810 }),
        item('csodatarisznya', 1, { amount: 1, weight: 4, totalWeight: 4, price: 1000 }),
        item('antiballaszt', 2, { amount: 1, weight: -20, totalWeight: -20, price: null }),
      ],
    });
    const names = (c: Element) => [...c.querySelectorAll('.lc-mkt-row .lc-mkt-name')].map((n) => n.textContent);
    const sortBy = (c: Element, key: string) => fireEvent.change(c.querySelector('.lc-inv-sort')!, { target: { value: key } });

    beforeEach(() => { GM_setValue(CHARACTER_TAB_KEY, 'backpack'); });

    it('sorts by name to begin with', () => {
      const { container } = render(<Character state={pack()} />);
      expect(names(container)).toEqual(['antiballaszt', 'csodatarisznya', 'sárkánykarom']);
    });

    it('sorts by unit weight and by total weight, which disagree', () => {
      const { container } = render(<Character state={pack()} />);
      sortBy(container, 'weight');
      expect(names(container)).toEqual(['antiballaszt', 'sárkánykarom', 'csodatarisznya']);
      sortBy(container, 'totalWeight');
      expect(names(container)).toEqual(['antiballaszt', 'csodatarisznya', 'sárkánykarom']);
    });

    it('sorts by stack value, heaviest first once flipped', () => {
      const { container } = render(<Character state={pack()} />);
      sortBy(container, 'value');
      fireEvent.click(container.querySelector('.lc-inv-dir')!);
      // 11 × 810, then 1000, then the unpriced one counting as 0.
      expect(names(container)).toEqual(['sárkánykarom', 'csodatarisznya', 'antiballaszt']);
    });

    it('keeps the sort across the reload an equip or drop causes', () => {
      const first = render(<Character state={pack()} />);
      sortBy(first.container, 'totalWeight');
      fireEvent.click(first.container.querySelector('.lc-inv-dir')!);
      first.unmount();

      const { container } = render(<Character state={pack()} />);
      expect(names(container)).toEqual(['sárkánykarom', 'csodatarisznya', 'antiballaszt']);
    });

    it('shows the market price and the stack\'s market value, and sorts by them', () => {
      const s = pack();
      s.backpack[0].marketPrice = 24300;   // sárkánykarom ×11
      s.backpack[1].marketPrice = 30000;   // csodatarisznya ×1
      const { container } = render(<Character state={s} />);
      const meta = rowFor(container, 'sárkánykarom').querySelector('.lc-mkt-meta')!.textContent!;
      expect(meta).toMatch(/piaci ár: 24\s?300/);
      expect(meta).toMatch(/piaci érték: 267\s?300/);

      sortBy(container, 'market');
      fireEvent.click(container.querySelector('.lc-inv-dir')!);
      expect(names(container)).toEqual(['csodatarisznya', 'sárkánykarom', 'antiballaszt']);
      sortBy(container, 'marketValue');
      expect(names(container)).toEqual(['sárkánykarom', 'csodatarisznya', 'antiballaszt']);
    });

    it('shows the unit and total weight, and the stack\'s value', () => {
      const { container } = render(<Character state={pack()} />);
      const meta = rowFor(container, 'sárkánykarom').querySelector('.lc-mkt-meta')!.textContent!;
      expect(meta).toContain('1 kg/db');
      expect(meta).toContain('összsúly: 11 kg');
      expect(meta).toMatch(/(?<!piaci )érték: 8\s?910/);
    });
  });

  it('drops only on the second press', () => {
    GM_setValue(CHARACTER_TAB_KEY, 'backpack');
    const s = makeState();
    const { container } = render(<Character state={s} />);
    const drop = buttonIn(rowFor(container, 'arany'), /Eldob/);

    fireEvent.click(drop);
    expect(s.drop).not.toHaveBeenCalled();
    fireEvent.click(buttonIn(rowFor(container, 'arany'), /Biztos/));
    expect(s.drop).toHaveBeenCalledWith(s.backpack[0], 1);
  });

  it('drops the ticked stacks only on the second press', () => {
    GM_setValue(CHARACTER_TAB_KEY, 'backpack');
    const s = makeState();
    const { container } = render(<Character state={s} />);
    fireEvent.click(rowFor(container, 'arany').querySelector('input[type="checkbox"]')!);
    const bar = container.querySelector('.lc-shop-bulk')!;

    fireEvent.click(buttonIn(bar, /Kijelöltek/));
    expect(s.dropMany).not.toHaveBeenCalled();
    fireEvent.click(buttonIn(bar, /Biztosan/));
    expect(s.dropMany).toHaveBeenCalledWith([s.backpack[0]]);
  });

  it('sums the ticked stacks\' weight and shows the load left after dropping them', () => {
    GM_setValue(CHARACTER_TAB_KEY, 'backpack');
    const s = makeState({
      load: { used: 157.0339, max: 146 },
      backpack: [
        item('arany', 0, { amount: 88, weight: 0.1, totalWeight: 8.8 }),
        item('bot', 1, { weight: 1.2, totalWeight: 1.2 }),
        item('bőrsisak', 2),
      ],
    });
    const { container } = render(<Character state={s} />);
    fireEvent.click(rowFor(container, 'arany').querySelector('input[type="checkbox"]')!);
    fireEvent.click(rowFor(container, 'bot').querySelector('input[type="checkbox"]')!);

    const sum = container.querySelector('.lc-shop-bulk-sum')!.textContent!;
    expect(sum).toContain('2 tétel kijelölve');
    expect(sum).toMatch(/10 kg/);
    expect(sum).toMatch(/terhelés: 147,034 \/ 146 kg/);
  });

  it('spends attribute points up to what is free, then saves them', () => {
    GM_setValue(CHARACTER_TAB_KEY, 'settings');
    const s = makeState();
    const { container } = render(<Character state={s} />);
    const plus = container.querySelector<HTMLButtonElement>('button[aria-label="Erő növelése"]')!;

    fireEvent.click(plus);
    fireEvent.click(plus);
    expect(plus.disabled).toBe(true);
    expect(container.querySelector('.lc-char-attr b')!.textContent).toBe('47');
    fireEvent.click(buttonIn(container, /Pontok mentése/));

    expect(s.saveAttributes).toHaveBeenCalledWith({ ero: 2 });
  });

  it('saves a changed stance, and offers no save until it changes', () => {
    GM_setValue(CHARACTER_TAB_KEY, 'settings');
    const s = makeState();
    const { container } = render(<Character state={s} />);
    const save = buttonIn(container.querySelector('.lc-bld-section:nth-of-type(2)')!, /Mentés/);

    expect(save.disabled).toBe(true);
    fireEvent.change(container.querySelector('select')!, { target: { value: '0' } });
    fireEvent.click(save);

    expect(s.stance!.save).toHaveBeenCalledWith('0');
  });
});

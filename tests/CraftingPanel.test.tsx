import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { CraftingPanel, clampCount } from '../src/components/CraftingPanel';
import { craftSelectedKey } from '../src/shared/prefKeys';
import type { CraftingHallState } from '../src/utils/craftingExtract';
import type { Armor, DataLoader, Item, Weapon } from '../src/shared/data';

function armor(id: number, name: string, craftableAt: string, recipe: Armor['recipe'], minLevel = 30): Armor {
  return {
    id, name, weight: 1, price: 1, marketPrice: null, special: 'Nincs', magical: false,
    craftableAt, minLevel, recipe, droppedBy: [], type: 'Sisak', defense: 1, level: minLevel,
  };
}

const ARMORS: Armor[] = [
  armor(10, 'sárkány szarv', 'Erőd', [
    { name: 'sárkányfog', qty: 10, id: '251' },
    { name: 'sárkánykarom', qty: 5, id: '252' },
    { name: 'sárkánypikkely', qty: 3, id: '250' },
  ], 32),
  armor(11, 'vaspajzs', 'Erőd', [{ name: 'vasérc', qty: 4, id: '199' }], 11),
  armor(12, 'mágikus sapka', 'Mágustorony', [{ name: 'csodaflaska', qty: 1, id: '545' }]),
  armor(13, 'gyíkacél mellény', 'Erőd', [{ name: 'x', qty: 1, id: '107' }]),
  armor(14, 'gyíkacél páncél', 'Erőd', [{ name: 'x', qty: 1, id: '107' }]),
  armor(15, 'ezüstrúd', 'Erőd', [{ name: 'ezüst', qty: 10, id: '0' }]),
];

function loader(armors: Armor[] = ARMORS): DataLoader {
  return {
    loadWeapons: () => Promise.resolve([] as Weapon[]),
    loadArmors: () => Promise.resolve(armors),
    loadItems: () => Promise.resolve([] as Item[]),
  } as unknown as DataLoader;
}

function hallState(overrides: Partial<CraftingHallState> = {}): CraftingHallState {
  return {
    hall: 'forge',
    gold: 1168,
    narration: '',
    owned: new Map([['0', 1168], ['251', 20], ['252', 10], ['250', 6]]),
    options: [],
    craft: vi.fn(),
    exit: null,
    side: null,
    ...overrides,
  };
}

const search = (text: string) =>
  fireEvent.input(screen.getByRole('searchbox'), { target: { value: text } });

describe('clampCount', () => {
  it.each([
    ['2', 5, 2], ['9', 5, 5], ['0', 5, 1], ['-3', 5, 1], ['abc', 5, 1], ['', 5, 1], ['2.7', 5, 2],
  ])('clamps %s into 1…%i as %i', (raw, max, expected) => {
    expect(clampCount(raw, max)).toBe(expected);
  });
});

describe('CraftingPanel', () => {
  beforeEach(() => {
    GM_setValue(craftSelectedKey('forge'), '');
    GM_setValue(craftSelectedKey('mage'), '');
  });

  it('finds an item ignoring case and accents, and only in this hall', async () => {
    render(<CraftingPanel state={hallState()} loader={loader()} />);
    await screen.findByRole('searchbox');
    search('SARKANY szarv');
    expect(await screen.findByText('sárkány szarv')).toBeTruthy();
    search('magikus');
    expect(screen.queryByText('mágikus sapka')).toBeNull();
  });

  it('shows how many each result allows', async () => {
    const { container } = render(<CraftingPanel state={hallState()} loader={loader()} />);
    await screen.findByRole('searchbox');
    search('sa');
    await screen.findByText('sárkány szarv');
    const row = [...container.querySelectorAll('.lc-craft-row')].find((r) => r.textContent?.includes('sárkány szarv'))!;
    expect(row.querySelector('.lc-craft-max')?.textContent).toBe('max 2');
  });

  it('colours each ingredient by whether one piece is covered', async () => {
    const state = hallState({ owned: new Map([['251', 20], ['252', 4], ['250', 6]]) });
    const { container } = render(<CraftingPanel state={state} loader={loader()} />);
    await screen.findByRole('searchbox');
    search('szarv');
    fireEvent.click(await screen.findByText('sárkány szarv'));
    const lines = [...container.querySelectorAll('.lc-craft-line')];
    expect(lines.map((l) => l.classList.contains('lc-craft-line--ok'))).toEqual([true, false, true]);
    expect(lines[1].textContent).toContain('5 / 4');
  });

  it('crafts the chosen count, clamped to what the materials allow', async () => {
    const state = hallState();
    render(<CraftingPanel state={state} loader={loader()} />);
    await screen.findByRole('searchbox');
    search('szarv');
    fireEvent.click(await screen.findByText('sárkány szarv'));
    const count = screen.getByLabelText('Darabszám') as HTMLInputElement;
    fireEvent.input(count, { target: { value: '7' } });
    expect(count.value).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: /Elkészít/ }));
    expect(state.craft).toHaveBeenCalledWith(ARMORS[0].recipe, 2);
  });

  it('lets the count be cleared and retyped without inventing digits', async () => {
    const state = hallState();
    render(<CraftingPanel state={state} loader={loader()} />);
    await screen.findByRole('searchbox');
    search('ezustrud');
    fireEvent.click(await screen.findByText('ezüstrúd'));
    const count = screen.getByLabelText('Darabszám') as HTMLInputElement;
    const button = screen.getByRole('button', { name: /Elkészít/ }) as HTMLButtonElement;
    fireEvent.input(count, { target: { value: '' } });
    expect(count.value).toBe('');
    // An empty count is not "one": nothing is crafted until a number is shown.
    expect(button.disabled).toBe(true);
    fireEvent.input(count, { target: { value: '3' } });
    expect(count.value).toBe('3');
    fireEvent.click(button);
    expect(state.craft).toHaveBeenCalledWith([{ name: 'ezüst', qty: 10, id: '0' }], 3);
  });

  it('puts one back when the count is left empty', async () => {
    render(<CraftingPanel state={hallState()} loader={loader()} />);
    await screen.findByRole('searchbox');
    search('ezustrud');
    fireEvent.click(await screen.findByText('ezüstrúd'));
    const count = screen.getByLabelText('Darabszám') as HTMLInputElement;
    fireEvent.input(count, { target: { value: '' } });
    fireEvent.blur(count);
    expect(count.value).toBe('1');
  });

  it('disables crafting when the materials cover nothing', async () => {
    const state = hallState();
    render(<CraftingPanel state={state} loader={loader()} />);
    await screen.findByRole('searchbox');
    search('vaspajzs');
    fireEvent.click(await screen.findByText('vaspajzs'));
    const button = screen.getByRole('button', { name: /Elkészít/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(state.craft).not.toHaveBeenCalled();
  });

  it('warns when other items share the recipe', async () => {
    render(<CraftingPanel state={hallState()} loader={loader()} />);
    await screen.findByRole('searchbox');
    search('gyikacel melleny');
    fireEvent.click(await screen.findByText('gyíkacél mellény'));
    expect(screen.getByText(/gyíkacél páncél/)).toBeTruthy();
  });

  it('reopens on the remembered item after the reload a craft causes', async () => {
    GM_setValue(craftSelectedKey('forge'), 'armor:10');
    const { container } = render(<CraftingPanel state={hallState()} loader={loader()} />);
    await waitFor(() => expect(container.querySelector('.lc-craft-detail h3')?.textContent).toBe('sárkány szarv'));
  });

  it('closes the list on a pick and shows the chosen name, like a select', async () => {
    const { container } = render(<CraftingPanel state={hallState()} loader={loader()} />);
    await screen.findByRole('searchbox');
    search('sa');
    fireEvent.click(await screen.findByText('sárkány szarv'));
    expect(container.querySelector('.lc-craft-list')).toBeNull();
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('sárkány szarv');
    expect(container.querySelector('.lc-craft-detail h3')?.textContent).toBe('sárkány szarv');
  });

  it('reopens the list when the player types again, keeping the detail until a new pick', async () => {
    const { container } = render(<CraftingPanel state={hallState()} loader={loader()} />);
    await screen.findByRole('searchbox');
    search('szarv');
    fireEvent.click(await screen.findByText('sárkány szarv'));
    search('vaspa');
    expect(container.querySelector('.lc-craft-list')?.textContent).toContain('vaspajzs');
    expect(container.querySelector('.lc-craft-detail h3')?.textContent).toBe('sárkány szarv');
  });

  it('shows a remembered selection closed, with its name in the field', async () => {
    GM_setValue(craftSelectedKey('forge'), 'armor:10');
    const { container } = render(<CraftingPanel state={hallState()} loader={loader()} />);
    await waitFor(() => expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('sárkány szarv'));
    expect(container.querySelector('.lc-craft-list')).toBeNull();
  });

  it('remembers a selection', async () => {
    render(<CraftingPanel state={hallState()} loader={loader()} />);
    await screen.findByRole('searchbox');
    search('szarv');
    fireEvent.click(await screen.findByText('sárkány szarv'));
    expect(GM_getValue(craftSelectedKey('forge'), '')).toBe('armor:10');
  });

  it('ignores a remembered key that no longer matches anything', async () => {
    GM_setValue(craftSelectedKey('forge'), 'armor:99999');
    const { container } = render(<CraftingPanel state={hallState()} loader={loader()} />);
    await screen.findByRole('searchbox');
    expect(container.querySelector('.lc-craft-detail')).toBeNull();
    // Nothing to show closed: the search hint is back.
    expect(screen.getByText(/legalább 2 betűt/)).toBeTruthy();
  });

  it('says so when the database cannot be loaded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = { ...loader(), loadArmors: () => Promise.reject(new Error('offline')) } as DataLoader;
    render(<CraftingPanel state={hallState()} loader={failing} />);
    expect(await screen.findByText(/Nem sikerült betölteni/)).toBeTruthy();
    warn.mockRestore();
  });

  it('reports a craft the form refuses instead of throwing out of the click', async () => {
    const state = hallState({ craft: vi.fn(() => { throw new Error('Ingredient not carried: sárkányfog'); }) });
    render(<CraftingPanel state={state} loader={loader()} />);
    await screen.findByRole('searchbox');
    search('szarv');
    fireEvent.click(await screen.findByText('sárkány szarv'));
    fireEvent.click(screen.getByRole('button', { name: /Elkészít/ }));
    expect(screen.getByText(/nem sikerült kitölteni/i)).toBeTruthy();
  });
});

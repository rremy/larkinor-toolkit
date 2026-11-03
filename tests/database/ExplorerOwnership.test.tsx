import { h } from 'preact';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { ExplorerView } from '@/database/explorer/ExplorerView';
import { buildMonsterDatabase, type DataLoader, type Holding } from '@/shared/data';

const CAPTURED = new Date(2026, 10, 3, 14, 20).getTime();

const item = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, weight: 1, price: 1, marketPrice: null, special: '', magical: false, craftableAt: '',
  minLevel: null, recipe: [], droppedBy: [], defense: null, shops: [], ...extra,
});

const owned = (quantity: number, holdings: Holding[]) => ({ owned: quantity, holdings });
const notOwned = { owned: null, holdings: [] };

function loaderOf(items: unknown[]): DataLoader {
  return {
    loadWeapons: async () => [],
    loadArmors: async () => [],
    loadItems: async () => items,
    loadMonsters: async () => buildMonsterDatabase([]),
  } as unknown as DataLoader;
}

const mount = (loader: DataLoader, selectedId: number | null = null) => render(
  <ExplorerView loader={loader} tab="items" selectedId={selectedId}
    onSelect={() => {}} onJump={() => {}} onShowCell={() => {}} />,
);

const ownedLoader = () => loaderOf([
  item(1, 'opál', owned(12, [
    { location: 'backpack', quantity: 2, capturedAt: CAPTURED },
    { location: 'house', quantity: 10, capturedAt: CAPTURED },
  ])),
  item(2, 'rubin', notOwned),
  item(3, 'gyűrű', { ...notOwned, recipe: [{ name: 'opál', qty: 3, id: '1' }] }),
]);

describe('ExplorerView ownership', () => {
  it('shows what is owned in its own column', async () => {
    mount(ownedLoader());
    await screen.findByText('3 találat (3 összesen)');
    expect(screen.getByRole('columnheader', { name: 'Nálad' })).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
  });

  it('has no column and no filter without any record — the standalone site', async () => {
    mount(loaderOf([item(1, 'opál')]));
    await screen.findByText('1 találat (1 összesen)');
    expect(screen.queryByRole('columnheader', { name: 'Nálad' })).toBeNull();
    expect(screen.queryByText('Nálad van')).toBeNull();
  });

  it('filters down to what is owned', async () => {
    const { container } = mount(ownedLoader());
    await screen.findByText('3 találat (3 összesen)');
    const field = [...container.querySelectorAll('.field')].find((f) => f.textContent?.includes('Nálad van'));
    fireEvent.change(field!.querySelector('select')!, { target: { value: 'yes' } });
    await screen.findByText('1 találat (3 összesen)');
  });

  it('says where it is in the detail panel', async () => {
    mount(ownedLoader(), 1);
    await screen.findByText('Nálad (12)');
    expect(screen.getByText(/hátizsák: 2/)).toBeTruthy();
    expect(screen.getByText(/ház: 10/)).toBeTruthy();
  });

  it('counts what is owned of each ingredient in a recipe', async () => {
    mount(ownedLoader(), 3);
    await screen.findByText('Recept');
    await waitFor(() => expect(screen.getByText(/nálad 12/)).toBeTruthy());
  });
});

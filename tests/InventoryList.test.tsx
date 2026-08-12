import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, within } from '@testing-library/preact';
import { InventoryList } from '../src/components/InventoryList';
import type { HomeItem } from '../src/utils/homeExtract';

function item(over: Partial<HomeItem>): HomeItem {
  return {
    index: 0, name: 'x', type: 'tárgy', weight: 1, amount: 1,
    totalWeight: 1, price: null, magical: false, attrs: [], ...over,
  };
}

const ITEMS: HomeItem[] = [
  item({ index: 0, name: 'halcsont', weight: 0.2, amount: 89, totalWeight: 17.8 }),
  item({ index: 1, name: 'agyar', weight: 4, amount: 6, totalWeight: 24 }),
  item({ index: 2, name: 'ezüst', weight: 0.0001, amount: 2686, totalWeight: 0.2686 }),
  item({ index: 3, name: 'gyíkbőr', weight: 0.2, amount: 7, totalWeight: 1.4 }),
];

describe('InventoryList', () => {
  it('filters by name (case-insensitive)', () => {
    const { getByPlaceholderText, container } = render(
      <InventoryList items={ITEMS} moveGlyph="🎒" moveTitle="Hátizsákba" onMove={vi.fn()} onOpenDetail={vi.fn()} />,
    );
    fireEvent.input(getByPlaceholderText(/Keresés/), { target: { value: 'AGY' } });
    const rows = container.querySelectorAll('.lc-inv-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('agyar');
  });

  it('finds an accented name typed without accents', () => {
    // Nobody types the accents: "gyikbor" has to find "gyíkbőr".
    const { getByPlaceholderText, container } = render(
      <InventoryList items={ITEMS} moveGlyph="🎒" moveTitle="Hátizsákba" onMove={vi.fn()} onOpenDetail={vi.fn()} />,
    );
    fireEvent.input(getByPlaceholderText(/Keresés/), { target: { value: 'gyikbor' } });
    const rows = container.querySelectorAll('.lc-inv-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('gyíkbőr');
  });

  it('sorts by total weight descending', () => {
    const { getByLabelText, getByText, container } = render(
      <InventoryList items={ITEMS} moveGlyph="🎒" moveTitle="Hátizsákba" onMove={vi.fn()} onOpenDetail={vi.fn()} />,
    );
    fireEvent.change(getByLabelText('Rendezés'), { target: { value: 'totalWeight' } });
    fireEvent.click(getByText('↓')); // toggle to descending
    const first = container.querySelector('.lc-inv-row')!;
    expect(first.textContent).toContain('agyar'); // 24 kg is highest
  });

  it('move defaults to the full amount and passes the chosen qty', () => {
    const onMove = vi.fn();
    const { container } = render(
      <InventoryList items={[ITEMS[0]]} moveGlyph="🎒" moveTitle="Hátizsákba" onMove={onMove} onOpenDetail={vi.fn()} />,
    );
    const row = container.querySelector('.lc-inv-row')!;
    within(row as HTMLElement).getByTitle('Hátizsákba').click();
    expect(onMove).toHaveBeenCalledWith(ITEMS[0], 89);
  });

  it('opens the detail when the name is clicked', () => {
    const onOpenDetail = vi.fn();
    const { getByText } = render(
      <InventoryList items={[ITEMS[1]]} moveGlyph="🎒" moveTitle="Hátizsákba" onMove={vi.fn()} onOpenDetail={onOpenDetail} />,
    );
    fireEvent.click(getByText('agyar'));
    expect(onOpenDetail).toHaveBeenCalledWith(ITEMS[1]);
  });
});

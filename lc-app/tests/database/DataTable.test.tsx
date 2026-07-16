import { h } from 'preact';
import { render, fireEvent, screen } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { DataTable } from '@/database/explorer/DataTable';
import type { ColumnDef } from '@/database/explorer/columns';

const cols: ColumnDef[] = [
  { key: 'name', label: 'Név' },
  { key: 'level', label: 'Szint', num: true },
];
const rows = [{ name: 'Kard', level: 5 }, { name: 'Balta', level: 2 }];

describe('DataTable', () => {
  it('renders rows and sorts on header click', () => {
    render(<DataTable columns={cols} rows={rows} onSelect={() => {}} />);
    fireEvent.click(screen.getByText('Szint'));
    const cells = screen.getAllByRole('row').slice(1).map(r => r.textContent);
    expect(cells[0]).toContain('Balta'); // level 2 first, ascending
  });

  it('calls onSelect with the clicked row', () => {
    const onSelect = vi.fn();
    render(<DataTable columns={cols} rows={rows} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Kard'));
    expect(onSelect).toHaveBeenCalledWith(rows[0]);
  });
});

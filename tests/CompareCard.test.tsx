import { h } from 'preact';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { CompareCard } from '../src/components/CompareCard';
import type { CompareColumn } from '../src/shared/compare';

const columns: CompareColumn[] = [
  {
    slot: 'leftHand', slotLabel: 'Bal kéz', currentName: 'balos',
    rows: [
      { label: 'Max sebzés', current: 90, candidate: 100, delta: '+10', direction: 'better' },
      { label: 'Szórás', current: 4, candidate: 10, delta: '+6', direction: 'worse' },
      { label: 'Szint', current: 20, candidate: 40, delta: '+20', direction: 'blocked' },
      { label: 'Vámpirizál', current: false, candidate: true, delta: null, direction: 'better' },
    ],
  },
];

describe('CompareCard', () => {
  it('names the candidate and every compared slot', () => {
    render(<CompareCard name="kard" columns={columns} x={10} y={20} />);
    expect(screen.getByText('kard')).toBeTruthy();
    expect(screen.getByText('Bal kéz')).toBeTruthy();
    expect(screen.getByText('balos')).toBeTruthy();
  });

  it('marks each row with its direction', () => {
    const { container } = render(<CompareCard name="kard" columns={columns} x={0} y={0} />);
    expect(container.querySelectorAll('.lc-cmp-better').length).toBe(2);
    expect(container.querySelectorAll('.lc-cmp-worse').length).toBe(1);
    expect(container.querySelectorAll('.lc-cmp-blocked').length).toBe(1);
  });

  it('shows the delta and renders booleans in Hungarian', () => {
    render(<CompareCard name="kard" columns={columns} x={0} y={0} />);
    expect(screen.getByText('+10')).toBeTruthy();
    expect(screen.getAllByText('igen').length).toBeGreaterThan(0);
    expect(screen.getAllByText('nem').length).toBeGreaterThan(0);
  });

  it('sets colour explicitly, because the game page is quirks mode', () => {
    const { container } = render(<CompareCard name="kard" columns={columns} x={0} y={0} />);
    expect(container.querySelector('table')!.getAttribute('style')).toContain('color');
  });

  it('positions itself at the given point', () => {
    const { container } = render(<CompareCard name="kard" columns={columns} x={40} y={50} />);
    const style = container.querySelector('.lc-cmp')!.getAttribute('style')!;
    expect(style).toContain('left: 40px');
    expect(style).toContain('top: 50px');
  });

  it('renders nothing without columns', () => {
    const { container } = render(<CompareCard name="kard" columns={[]} x={0} y={0} />);
    expect(container.querySelector('.lc-cmp')).toBeNull();
  });
});

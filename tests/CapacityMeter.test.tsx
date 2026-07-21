import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import { CapacityMeter } from '../src/components/CapacityMeter';

describe('CapacityMeter', () => {
  it('renders used/max and a proportional fill', () => {
    const { container, getByText } = render(<CapacityMeter label="Ház" used={70} max={140} />);
    const fill = container.querySelector<HTMLElement>('.lc-cap-fill')!;
    expect(fill.style.width).toBe('50%');
    expect(getByText(/140/)).toBeTruthy();
    expect(fill.className).toContain('lc-cap-fill--ok');
  });

  it('flags a nearly-full container as critical', () => {
    const { container } = render(<CapacityMeter label="Hátizsák" used={106} max={107} />);
    expect(container.querySelector('.lc-cap-fill--crit')).toBeTruthy();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { NavPad } from '../src/components/NavPad';
import type { DirectionOption } from '../src/utils/domExtract';

function makeOption(dir: DirectionOption['dir'], label: string): DirectionOption {
  return { dir, label, trigger: vi.fn() };
}

describe('NavPad', () => {
  it('renders only buttons for provided directions', () => {
    const north = makeOption('north', 'Észak');
    const south = makeOption('south', 'Dél');
    render(<NavPad directions={[north, south]} />);

    expect(screen.getByRole('button', { name: 'north' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'south' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'east' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'west' })).toBeNull();
  });

  it('clicking a direction button calls that option\'s trigger', () => {
    const north = makeOption('north', 'Észak');
    const east = makeOption('east', 'Kelet');
    render(<NavPad directions={[north, east]} />);

    fireEvent.click(screen.getByRole('button', { name: 'north' }));
    expect(north.trigger).toHaveBeenCalledTimes(1);
    expect(east.trigger).not.toHaveBeenCalled();

    expect(screen.queryByRole('button', { name: 'south' })).toBeNull();
  });

  it('does not render the centre cell as a button', () => {
    const north = makeOption('north', 'Észak');
    const { container } = render(<NavPad directions={[north]} />);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(1);
  });

  it('shows the correct Hungarian short label for each direction', () => {
    const options: DirectionOption[] = [
      makeOption('north', 'Észak'),
      makeOption('south', 'Dél'),
      makeOption('east', 'Kelet'),
      makeOption('west', 'Nyugat'),
    ];
    render(<NavPad directions={options} />);

    expect(screen.getByRole('button', { name: 'north' }).textContent).toBe('É');
    expect(screen.getByRole('button', { name: 'south' }).textContent).toBe('D');
    expect(screen.getByRole('button', { name: 'east' }).textContent).toBe('K');
    expect(screen.getByRole('button', { name: 'west' }).textContent).toBe('Ny');
  });

  it('renders the attack button (icon only) in the centre and triggers it on click', () => {
    const attack = { label: 'Támadás!!!', iconUrl: 'https://l2.larkinor.hu/2/ikon/tamadas.gif', trigger: vi.fn() };
    const { container } = render(<NavPad directions={[makeOption('north', 'Észak')]} attack={attack} />);

    const btn = screen.getByRole('button', { name: 'Támadás!!!' });
    expect(btn).toBeTruthy();
    // icon only — no visible text label
    expect(btn.textContent).toBe('');
    expect(container.querySelector('.lc-navpad-attack-icon')?.getAttribute('src'))
      .toBe('https://l2.larkinor.hu/2/ikon/tamadas.gif');

    fireEvent.click(btn);
    expect(attack.trigger).toHaveBeenCalledTimes(1);
  });

  it('renders a plain centre cell when there is no attack', () => {
    const { container } = render(<NavPad directions={[makeOption('north', 'Észak')]} />);
    expect(container.querySelector('.lc-navpad-attack')).toBeNull();
    expect(container.querySelector('.lc-navpad-centre')).not.toBeNull();
  });
});

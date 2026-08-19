import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { MarketActions } from '../src/components/MarketActions';
import type { MarketActions as Actions } from '../src/utils/marketExtract';

function building(label: string) {
  return { label, iconUrl: `https://l2.larkinor.hu/ikon/${label}.gif`, trigger: vi.fn() };
}

function actions(overrides: Partial<Actions> = {}): Actions {
  return {
    exit: building('Elhagyod a piacot'),
    collectMoney: building('Felveszed a pénzt'),
    settings: building('Beállítások'),
    special: [{ label: 'kilépsz a játékból', actionKey: 'kilep', trigger: vi.fn() }],
    ...overrides,
  };
}

describe('MarketActions — collecting sale earnings', () => {
  it('shows what is waiting to be collected', () => {
    render(<MarketActions actions={actions()} earnings={7810} />);
    // On the button itself: it is the one control the figure decides.
    expect(screen.getByTitle('Felveszed a pénzt').textContent).toContain('7810');
  });

  it('goes inactive once the money has been taken', () => {
    const a = actions();
    const { container } = render(<MarketActions actions={a} earnings={0} />);
    const button = container.querySelector('.lc-home-act') as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(a.collectMoney!.trigger).not.toHaveBeenCalled();
  });

  it('says in its own label that there is nothing to take', () => {
    // Not in a tooltip: a phone has no hover, so a title attribute is invisible
    // there — which is exactly where this button is a tab of its own.
    const { container } = render(<MarketActions actions={actions()} earnings={0} />);
    expect(container.querySelector('.lc-home-act')!.textContent).toContain('Nincs felvehető pénz');
  });

  it('stays usable when the page did not say how much is waiting', () => {
    // Null is not zero: a page whose wording we failed to match must not disable
    // a button that works.
    const a = actions();
    render(<MarketActions actions={a} earnings={null} />);
    const button = screen.getByTitle('Felveszed a pénzt') as HTMLButtonElement;

    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(a.collectMoney!.trigger).toHaveBeenCalledTimes(1);
  });
});

describe('MarketActions', () => {
  it('triggers the game control behind each action', () => {
    const a = actions();
    render(<MarketActions actions={a} earnings={7810} />);

    fireEvent.click(screen.getByTitle('Felveszed a pénzt'));

    expect(a.collectMoney!.trigger).toHaveBeenCalledTimes(1);
  });

  it('leaves out an action the page does not offer', () => {
    render(<MarketActions actions={actions({ collectMoney: null })} earnings={null} />);
    // Omitted rather than disabled: a control the page never printed is not a
    // thing the player can do here at all.
    expect(screen.queryByTitle('Felveszed a pénzt')).toBeNull();
    expect(screen.getByTitle('Elhagyod a piacot')).toBeTruthy();
  });

  it('offers each special action of the page as its own button', () => {
    const a = actions({
      special: [
        { label: 'kilépsz a játékból', actionKey: 'kilep', trigger: vi.fn() },
        { label: 'imádkozol', actionKey: 'imadkozas', trigger: vi.fn() },
      ],
    });
    render(<MarketActions actions={a} earnings={null} />);

    fireEvent.click(screen.getByText('imádkozol'));

    expect(a.special[1].trigger).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when the page offers no actions at all', () => {
    const { container } = render(
      <MarketActions actions={{ exit: null, collectMoney: null, settings: null, special: [] }} earnings={null} />,
    );
    expect(container.querySelector('.lc-mkt-actions')).toBeNull();
  });
});

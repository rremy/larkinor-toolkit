import { h } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { LoadoutContext } from '../src/components/LoadoutContext';
import { useCompare } from '../src/hooks/useCompare';
import { emptySlots, type Loadout } from '../src/shared/loadout';
import type { CompareSubject } from '../src/shared/compare';

const loadout: Loadout = {
  version: 1, playerLevel: 30, capturedAt: 1,
  slots: {
    ...emptySlots(),
    head: { name: 'sisak', kind: 'vért', level: 20, maxDamage: null, spread: null, defense: 16, magical: false, vampiric: false },
  },
};

const candidate: CompareSubject = {
  name: 'jobb sisak', kind: 'vért', level: 21, maxDamage: null, spread: null,
  defense: 20, magical: false, vampiric: false, armorType: 'Sisak',
};

function Row({ subject }: { subject: CompareSubject | null }) {
  const cmp = useCompare(subject);
  return <div data-testid="row" {...cmp.props}>sisak{cmp.card}</div>;
}

const mount = (value: Loadout | null, subject: CompareSubject | null = candidate) =>
  render(
    <LoadoutContext.Provider value={value}>
      <Row subject={subject} />
    </LoadoutContext.Provider>,
  );

const row = () => screen.getByTestId('row');
const card = () => document.querySelector('.lc-cmp');

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('useCompare — hover', () => {
  it('opens after the hover delay and closes on leave', async () => {
    mount(loadout);
    fireEvent.mouseEnter(row(), { clientX: 5, clientY: 5 });
    expect(card()).toBeNull();

    await vi.advanceTimersByTimeAsync(200);
    expect(card()).not.toBeNull();
    expect(screen.getByText('jobb sisak')).toBeTruthy();

    fireEvent.mouseLeave(row());
    expect(card()).toBeNull();
  });

  it('does not open when the pointer leaves before the delay elapses', async () => {
    mount(loadout);
    fireEvent.mouseEnter(row(), { clientX: 5, clientY: 5 });
    fireEvent.mouseLeave(row());
    await vi.advanceTimersByTimeAsync(500);
    expect(card()).toBeNull();
  });
});

describe('useCompare — long press', () => {
  it('opens after the press is held, and not before', async () => {
    mount(loadout);
    fireEvent.touchStart(row(), { touches: [{ clientX: 5, clientY: 5 }] });
    await vi.advanceTimersByTimeAsync(300);
    expect(card()).toBeNull();

    await vi.advanceTimersByTimeAsync(300);
    expect(card()).not.toBeNull();
  });

  it('cancels when the finger moves away or lifts early', async () => {
    mount(loadout);
    fireEvent.touchStart(row(), { touches: [{ clientX: 5, clientY: 5 }] });
    fireEvent.touchMove(row(), { touches: [{ clientX: 5, clientY: 40 }] });
    await vi.advanceTimersByTimeAsync(600);
    expect(card()).toBeNull();

    fireEvent.touchStart(row(), { touches: [{ clientX: 5, clientY: 5 }] });
    fireEvent.touchEnd(row());
    await vi.advanceTimersByTimeAsync(600);
    expect(card()).toBeNull();
  });

  it('closes on a tap elsewhere, and on scroll', async () => {
    mount(loadout);
    fireEvent.touchStart(row(), { touches: [{ clientX: 5, clientY: 5 }] });
    await vi.advanceTimersByTimeAsync(600);
    expect(card()).not.toBeNull();

    fireEvent.touchStart(document.body, { touches: [{ clientX: 200, clientY: 200 }] });
    expect(card()).toBeNull();

    fireEvent.touchStart(row(), { touches: [{ clientX: 5, clientY: 5 }] });
    await vi.advanceTimersByTimeAsync(600);
    expect(card()).not.toBeNull();
    fireEvent.scroll(window);
    expect(card()).toBeNull();
  });

  it('suppresses the context menu while a press is pending', async () => {
    mount(loadout);
    fireEvent.touchStart(row(), { touches: [{ clientX: 5, clientY: 5 }] });
    const menu = new Event('contextmenu', { bubbles: true, cancelable: true });
    row().dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });

  it('ignores the emulated mouseenter a tap produces', async () => {
    mount(loadout);
    fireEvent.touchStart(row(), { touches: [{ clientX: 5, clientY: 5 }] });
    fireEvent.touchEnd(row());
    // The browser follows a tap with mouse events; they must not open the card.
    fireEvent.mouseEnter(row(), { clientX: 5, clientY: 5 });
    await vi.advanceTimersByTimeAsync(600);
    expect(card()).toBeNull();
  });
});

describe('useCompare — when there is nothing to compare', () => {
  it('does nothing without a stored loadout', async () => {
    mount(null);
    fireEvent.mouseEnter(row(), { clientX: 5, clientY: 5 });
    await vi.advanceTimersByTimeAsync(600);
    expect(card()).toBeNull();
  });

  it('does nothing without a subject', async () => {
    mount(loadout, null);
    fireEvent.mouseEnter(row(), { clientX: 5, clientY: 5 });
    await vi.advanceTimersByTimeAsync(600);
    expect(card()).toBeNull();
  });

  it('does nothing when the comparison yields no column', async () => {
    mount(loadout, { ...candidate, armorType: 'Nyaklánc' });
    fireEvent.mouseEnter(row(), { clientX: 5, clientY: 5 });
    await vi.advanceTimersByTimeAsync(600);
    expect(card()).toBeNull();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { HotkeyRow } from '../src/components/HotkeyRow';
import type { Action } from '../src/utils/domExtract';

const act = (label: string, actionKey?: string): Action => ({ label, actionKey, trigger: vi.fn() });

describe('HotkeyRow', () => {
  it('renders an icon button per action with the catalog icon', () => {
    const { container } = render(<HotkeyRow actions={[act('kajálsz', 'kajal')]} />);
    const row = container.querySelector('.lc-hotkeys')!;
    expect(row.querySelectorAll('.lc-hotkey').length).toBe(1);
    expect(row.querySelector('img')?.getAttribute('src')).toBe('https://l2.larkinor.hu/2/ikon/sc_kaja.gif');
  });

  it('fires the action trigger on click', () => {
    const a = act('kajálsz', 'kajal');
    const { container } = render(<HotkeyRow actions={[a]} />);
    fireEvent.click(container.querySelector('.lc-hotkey')!);
    expect(a.trigger).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when there are no actions', () => {
    const { container } = render(<HotkeyRow actions={[]} />);
    expect(container.querySelector('.lc-hotkeys')).toBeNull();
  });
});

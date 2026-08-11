import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { ConfigDrawer } from '../src/components/ConfigDrawer';
import { HOTKEY_CATALOG } from '../src/utils/hotkeys';

describe('ConfigDrawer', () => {
  it('renders one toggle row per catalog hotkey', () => {
    const { container } = render(<ConfigDrawer enabled={[]} onToggle={vi.fn()} onClose={vi.fn()} />);
    expect(container.querySelectorAll('.lc-config-hotkey').length).toBe(HOTKEY_CATALOG.length);
  });

  it('marks enabled hotkeys as pressed', () => {
    const { container } = render(<ConfigDrawer enabled={['vargyogy']} onToggle={vi.fn()} onClose={vi.fn()} />);
    const on = container.querySelector('.lc-config-hotkey[data-key="vargyogy"]');
    const off = container.querySelector('.lc-config-hotkey[data-key="kajal"]');
    expect(on?.getAttribute('aria-pressed')).toBe('true');
    expect(off?.getAttribute('aria-pressed')).toBe('false');
  });

  it('toggling a row calls onToggle with the hotkey key', () => {
    const onToggle = vi.fn();
    const { container } = render(<ConfigDrawer enabled={[]} onToggle={onToggle} onClose={vi.fn()} />);
    fireEvent.click(container.querySelector('.lc-config-hotkey[data-key="kajal"]')!);
    expect(onToggle).toHaveBeenCalledWith('kajal');
  });

  it('shows the hotkey icon and label', () => {
    const { container } = render(<ConfigDrawer enabled={[]} onToggle={vi.fn()} onClose={vi.fn()} />);
    const row = container.querySelector('.lc-config-hotkey[data-key="vargyogy"]')!;
    expect(row.querySelector('img')?.getAttribute('src')).toBe('https://l2.larkinor.hu/2/ikon/sc_gyogyvarazs.gif');
    expect(row.textContent).toContain('Gyógyvarázs');
  });

  it('closes when the × button is clicked', () => {
    const onClose = vi.fn();
    render(<ConfigDrawer enabled={[]} onToggle={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /bezár|close|×/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders as a centered modal when the modal variant is requested', () => {
    const { container } = render(
      <ConfigDrawer enabled={[]} onToggle={vi.fn()} onClose={vi.fn()} variant="modal" />
    );
    expect(
      container.querySelector('.lc-drawer-backdrop')!.classList.contains('lc-drawer-backdrop--center')
    ).toBe(true);
  });
});

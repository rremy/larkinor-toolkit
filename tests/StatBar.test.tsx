import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { StatBar } from '../src/components/StatBar';

describe('StatBar', () => {
  it('renders HP and MP values', () => {
    render(<StatBar hp={225} hpMax={260} mp={100} mpMax={232} />);
    expect(screen.getByText(/225\s*\/\s*260/)).toBeTruthy();
    expect(screen.getByText(/100\s*\/\s*232/)).toBeTruthy();
  });

  it('renders gold when provided', () => {
    render(<StatBar hp={100} hpMax={100} mp={50} mpMax={100} gold={587} />);
    expect(screen.getByText(/587/)).toBeTruthy();
  });

  it('does not render gold section when gold is undefined', () => {
    const { container } = render(<StatBar hp={100} hpMax={100} mp={50} mpMax={100} />);
    expect(container.querySelector('.lc-stat-gold')).toBeNull();
  });

  it('HP bar fill width reflects percentage', () => {
    const { container } = render(<StatBar hp={130} hpMax={260} mp={50} mpMax={100} />);
    const hpFill = container.querySelector<HTMLElement>('.lc-stat-bar-fill--hp');
    expect(hpFill?.style.width).toBe('50%');
  });

  it('renders status icons next to the gold', () => {
    const { container } = render(
      <StatBar
        hp={100} hpMax={100} mp={50} mpMax={100} gold={92}
        statusIcons={[
          { iconUrl: 'https://l2.larkinor.hu/2/ikon/bizt_van.gif', label: 'Van biztosításod :-)' },
          { iconUrl: 'https://l2.larkinor.hu/2/ikon/durex2.gif', label: 'Varázsburok! ;-)' },
        ]}
      />
    );
    const icons = container.querySelectorAll('.lc-stat-gold .lc-status-icon');
    expect(icons.length).toBe(2);
    expect(icons[0].getAttribute('src')).toBe('https://l2.larkinor.hu/2/ikon/bizt_van.gif');
    expect(icons[0].getAttribute('title')).toBe('Van biztosításod :-)');
  });

  it('renders the config gear inside the gold/status row when onConfig is provided, and calls it on click', () => {
    const onConfig = vi.fn();
    const { container } = render(<StatBar hp={100} hpMax={100} mp={50} mpMax={100} gold={42} onConfig={onConfig} />);
    const gear = container.querySelector('.lc-stat-gold .lc-statbar-gear') as HTMLButtonElement;
    expect(gear).not.toBeNull();
    fireEvent.click(gear);
    expect(onConfig).toHaveBeenCalledTimes(1);
  });

  it('has no gear button when onConfig is omitted', () => {
    const { container } = render(<StatBar hp={100} hpMax={100} mp={50} mpMax={100} gold={42} />);
    expect(container.querySelector('.lc-statbar-gear')).toBeNull();
  });

  it('renders the quests button when onQuests is provided, and calls it on click', () => {
    const onQuests = vi.fn();
    const { container } = render(<StatBar hp={100} hpMax={100} mp={50} mpMax={100} gold={42} onQuests={onQuests} />);
    const quests = container.querySelector('.lc-stat-gold .lc-statbar-quests') as HTMLButtonElement;
    expect(quests).not.toBeNull();
    fireEvent.click(quests);
    expect(onQuests).toHaveBeenCalledTimes(1);
  });

  it('has no quests button when onQuests is omitted', () => {
    const { container } = render(<StatBar hp={100} hpMax={100} mp={50} mpMax={100} gold={42} onDatabase={vi.fn()} onConfig={vi.fn()} />);
    expect(container.querySelector('.lc-statbar-quests')).toBeNull();
  });

  it('orders the cluster quests, database, gear so the gear keeps the outer edge', () => {
    const { container } = render(
      <StatBar hp={100} hpMax={100} mp={50} mpMax={100} gold={42} onQuests={vi.fn()} onDatabase={vi.fn()} onConfig={vi.fn()} />
    );
    const classes = Array.from(container.querySelectorAll('.lc-statbar-btns .lc-statbar-btn'))
      .map(b => b.className.replace('lc-statbar-btn ', ''));
    expect(classes).toEqual(['lc-statbar-quests', 'lc-statbar-db', 'lc-statbar-gear']);
  });
});

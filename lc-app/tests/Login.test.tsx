import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { Login } from '../src/pages/Login';
import type { LoginState } from '../src/utils/domExtract';

function buildState(overrides: Partial<LoginState> = {}): LoginState {
  return {
    savedUsername: '',
    error: '',
    submit: vi.fn(),
    ...overrides,
  };
}

describe('Login', () => {
  it('renders username, password fields and the Belépés button', () => {
    const { container } = render(<Login state={buildState()} />);
    expect(container.querySelector('input[type="text"]')).not.toBeNull();
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /belépés/i })).toBeTruthy();
  });

  it('pre-fills the username field from savedUsername', () => {
    const { container } = render(<Login state={buildState({ savedUsername: 'Remy' })} />);
    const username = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(username.value).toBe('Remy');
  });

  it('submits the entered credentials when the button is clicked', () => {
    const state = buildState({ savedUsername: 'Remy' });
    const { container } = render(<Login state={state} />);
    const password = container.querySelector('input[type="password"]') as HTMLInputElement;

    fireEvent.input(password, { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: /belépés/i }));

    expect(state.submit).toHaveBeenCalledWith('Remy', 'secret');
  });

  it('shows the error banner when state.error is set', () => {
    const msg = 'Hiányzik a karakter, vagy rossz adatokat adtál meg!';
    const { container } = render(<Login state={buildState({ error: msg })} />);
    const banner = container.querySelector('.lc-login-error');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain(msg);
  });

  it('renders no error banner when state.error is empty', () => {
    const { container } = render(<Login state={buildState({ error: '' })} />);
    expect(container.querySelector('.lc-login-error')).toBeNull();
  });

  it('submits when Enter is pressed in a field (native form submit)', () => {
    const state = buildState();
    const { container } = render(<Login state={state} />);
    const username = container.querySelector('input[type="text"]') as HTMLInputElement;
    const password = container.querySelector('input[type="password"]') as HTMLInputElement;

    fireEvent.input(username, { target: { value: 'Hero' } });
    fireEvent.input(password, { target: { value: 'pw' } });
    fireEvent.submit(container.querySelector('form')!);

    expect(state.submit).toHaveBeenCalledWith('Hero', 'pw');
  });
});

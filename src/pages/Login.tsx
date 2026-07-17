import { h, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { LoginState } from '@/utils/domExtract';

export interface LoginProps {
  state: LoginState;
}

export function Login({ state }: LoginProps): JSX.Element {
  const [username, setUsername] = useState(state.savedUsername);
  const [password, setPassword] = useState('');

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    state.submit(username, password);
  };

  return (
    <div class="lc-page lc-login">
      <form class="lc-login-card" onSubmit={handleSubmit}>
        <h1 class="lc-login-title">Larkinor</h1>

        {state.error && (
          <p class="lc-login-error" role="alert">{state.error}</p>
        )}

        <label class="lc-login-field">
          <span class="lc-login-label">Login</span>
          <input
            class="lc-login-input"
            type="text"
            name="lc-loginname"
            maxLength={18}
            autoFocus
            autoComplete="username"
            value={username}
            onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
          />
        </label>

        <label class="lc-login-field">
          <span class="lc-login-label">Jelszó</span>
          <input
            class="lc-login-input"
            type="password"
            name="lc-loginpassw"
            maxLength={18}
            autoComplete="current-password"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          />
        </label>

        <button class="lc-btn lc-login-submit" type="submit">
          Belépés
        </button>
      </form>
    </div>
  );
}

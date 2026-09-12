import { create } from 'zustand';
import { useFilterStore } from './filterStore';
import type { OfficerAccount } from '../data/officers';

const STORAGE_KEY = 'jaldrishti_demo_officer';
const TOKEN_KEY = 'jaldrishti_auth_token';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface AuthState {
  officer: OfficerAccount | null;
  token: string | null;
  authMode: 'real' | null;
  loginStatus: 'idle' | 'connecting' | 'error';
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

function loadStoredOfficer(): OfficerAccount | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OfficerAccount) : null;
  } catch {
    return null;
  }
}

function loadStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  officer: loadStoredToken() ? loadStoredOfficer() : null,
  token: loadStoredToken(),
  authMode: loadStoredToken() ? 'real' : null,
  loginStatus: 'idle',

  login: async (username, password) => {
    // Render's free tier sleeps the backend after inactivity. The first
    // request can take 30-60s to wake it, longer than a normal request
    // should ever take — so we retry on timeout/network failure with
    // increasing patience, but NEVER retry a real response from the
    // server (a wrong password must fail immediately, not retry).
    const TIMEOUTS_MS = [8000, 15000, 20000, 25000];
    const RETRY_DELAYS_MS = [0, 2000, 3000, 4000];

    for (let attempt = 0; attempt < TIMEOUTS_MS.length; attempt++) {
      if (attempt > 0) {
        set({ loginStatus: 'connecting' });
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      }

      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username,
            password,
          }),
          signal: AbortSignal.timeout(TIMEOUTS_MS[attempt]),
        });

        // A real response arrived — success or genuine failure, either
        // way we stop here and never retry past this point.
        set({ loginStatus: 'idle' });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            data.message || `Login failed (${res.status}).`
          );
        }

        const data = await res.json();

        const { OFFICER_ACCOUNTS } = await import('../data/officers');

        const officer = OFFICER_ACCOUNTS.find(
          (account) => account.id === data.officerId
        );

        if (!officer) {
          throw new Error('Authenticated officer account was not found.');
        }

        try {
          sessionStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(officer)
          );

          sessionStorage.setItem(
            TOKEN_KEY,
            data.token
          );
        } catch {
          // Ignore storage errors
        }

        set({
          officer,
          token: data.token,
          authMode: 'real',
          loginStatus: 'idle',
        });
        return;
      } catch (err) {
        // Only retry on genuine network/timeout failures (the backend
        // waking up) — a real error response from the server (wrong
        // credentials, validation error) must surface immediately.
        const isNetworkOrTimeout =
          (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) ||
          err instanceof TypeError;

        if (!isNetworkOrTimeout) {
          set({ loginStatus: 'idle' });
          throw err;
        }

        if (attempt === TIMEOUTS_MS.length - 1) {
          set({ loginStatus: 'error' });
          throw new Error(
            'Could not reach the server after several attempts. The backend may still be waking up — please wait a moment and try again.'
          );
        }
        // otherwise fall through to the next attempt
      }
    }
  },

  logout: () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // Ignore storage errors
    }

    useFilterStore.getState().resetFilters();

    set({
      officer: null,
      token: null,
      authMode: null,
    });
  },
}));
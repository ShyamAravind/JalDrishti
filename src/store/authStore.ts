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

  login: async (username, password) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password,
      }),
      signal: AbortSignal.timeout(5000),
    });

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
    });
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
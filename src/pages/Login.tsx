import React, { useState } from 'react';
import {
  Droplets,
  Shield,
  LogIn,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const Login: React.FC = () => {
  const login = useAuthStore(s => s.login);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    setError(null);

    if (!username.trim() || !password) {
      setError('Username and password are required.');
      return;
    }

    setLoading(true);

    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Login failed. Please check your credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-5">

        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-primary-600 flex items-center justify-center mx-auto mb-3 shadow">
            <Droplets className="w-7 h-7 text-white" />
          </div>

          <h1 className="text-xl font-bold text-text-dark">
            JalDrishti
          </h1>

          <p className="text-xs text-gray-500 mt-1">
            Watershed Monitoring &amp; Decision Support — SIH26015
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">

          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-primary-600" />

            <h2 className="text-sm font-bold text-text-dark">
              District Officer Login
            </h2>
          </div>

          <p className="text-xs text-gray-500 mb-5">
            Sign in to access the JalDrishti watershed monitoring system.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 text-xs text-red-700 mb-4">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />

              <div>
                <p className="font-semibold">
                  {error}
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">

            <div>
              <label
                htmlFor="username"
                className="block text-xs font-semibold text-gray-700 mb-1.5"
              >
                Username
              </label>

              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="Enter username"
                disabled={loading}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:bg-gray-100"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-gray-700 mb-1.5"
              >
                Password
              </label>

              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter password"
                disabled={loading}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:bg-gray-100"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              <LogIn className="w-4 h-4" />

              {loading ? 'Signing in...' : 'Sign In'}
            </button>

          </form>
        </div>

        <div className="flex gap-2 text-xs text-gray-400 px-1">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />

          <p>
            Access is restricted to authorized watershed officers.
            Credentials are verified securely by the backend.
          </p>
        </div>

      </div>
    </div>
  );
};

export default Login;
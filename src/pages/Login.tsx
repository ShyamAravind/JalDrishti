import React, { useState } from 'react';
import {
  Droplets,
  Shield,
  LogIn,
  AlertTriangle,
  Info,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const Login: React.FC = () => {
  const login = useAuthStore(s => s.login);
  const loginStatus = useAuthStore(s => s.loginStatus);

  // Pre-filled for the SIH demo so a judge can log in with one click —
  // the backend still verifies these credentials for real (bcrypt +
  // JWT); pre-filling the fields does not bypass that check.
  const [username, setUsername] = useState('patel');
  const [password, setPassword] = useState('Patel@123');
  const [showPassword, setShowPassword] = useState(false);
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

                    {loginStatus === 'connecting' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2 text-xs text-blue-700 mb-4">
              <Loader2 className="w-4 h-4 flex-shrink-0 mt-0.5 animate-spin" />
              <div>
                <p className="font-semibold">Connecting to server... please wait</p>
                <p className="mt-0.5 text-blue-600">
                  The backend may be waking up from an idle state — this can take up to a minute on first login.
                </p>
              </div>
            </div>
          )}


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

              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter password"
                  disabled={loading}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:bg-gray-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              <LogIn className="w-4 h-4" />

                            {loginStatus === 'connecting' ? 'Waking up server...' : loading ? 'Signing in...' : 'Sign In'}
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
import { Lock, Shield, User } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { firstSetup } from '../../api/auth';
import { useAuth } from '../../hooks/useAuth';

interface LoginViewProps {
  /** When true, show the first-time setup form instead of the normal login form. */
  isFirstSetup?: boolean;
  onSetupComplete?: () => void;
}

export function LoginView({ isFirstSetup = false, onSetupComplete }: LoginViewProps) {
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isFirstSetup && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      if (isFirstSetup) {
        await firstSetup(username, password);
        // After setup, log in with the new credentials
        await login(username, password);
        onSetupComplete?.();
      } else {
        await login(username, password);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      {/* Background grid effect */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,255,128,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,128,0.3) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Shield className="text-emerald-400" size={32} />
            <span className="text-2xl font-bold text-white tracking-wider uppercase">
              Sovereign Watch
            </span>
          </div>
          <p className="text-gray-400 text-sm uppercase tracking-widest">
            {isFirstSetup ? 'Initial System Setup' : 'Intelligence Fusion Platform'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-8 shadow-2xl">
          <h2 className="text-white font-semibold text-lg mb-1">
            {isFirstSetup ? 'Create Admin Account' : 'Operator Authentication'}
          </h2>
          {isFirstSetup && (
            <p className="text-gray-400 text-sm mb-6">
              No accounts detected. Create the first administrator account to continue.
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {/* Username */}
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Username
              </label>
              <div className="relative">
                <User
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 pl-9 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="Enter username"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                Password
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={isFirstSetup ? 'new-password' : 'current-password'}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 pl-9 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder={isFirstSetup ? 'Min. 8 characters' : 'Enter password'}
                />
              </div>
            </div>

            {/* Confirm password (first-setup only) */}
            {isFirstSetup && (
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 pl-9 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    placeholder="Repeat password"
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-950 border border-red-700 rounded px-3 py-2 text-red-300 text-sm">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded text-sm uppercase tracking-wider transition-colors"
            >
              {loading
                ? 'Authenticating…'
                : isFirstSetup
                  ? 'Create Account & Login'
                  : 'Authenticate'}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6 uppercase tracking-widest">
          Sovereign Watch · Secure Access Required
        </p>
      </div>
    </div>
  );
}

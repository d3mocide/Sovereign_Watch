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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (isFirstSetup && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      if (isFirstSetup) {
        await firstSetup(username, password);
        await login(username, password);
        onSetupComplete?.();
      } else {
        await login(username, password);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-tactical-bg flex items-center justify-center p-4 overflow-hidden relative">

      {/* Background grid */}
      <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none" />

      {/* Ambient green glow centered behind the card */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[700px] h-[500px] rounded-full bg-hud-green/5 blur-[140px]" />
      </div>

      {/* Scanline sweep */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="animate-scanline absolute w-full h-32 opacity-20 scanline" />
      </div>

      {/* Content */}
      <div className="relative w-full max-w-sm animate-in fade-in duration-700">

        {/* Wordmark */}
        <div className="text-center mb-7">
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <Shield
              size={26}
              className="text-hud-green drop-shadow-[0_0_14px_rgba(0,255,65,0.9)]"
            />
            <span className="text-lg font-black text-white tracking-[0.3em] uppercase">
              Sovereign Watch
            </span>
          </div>
          <p className="text-hud-green/50 text-[10px] uppercase tracking-[0.45em]">
            {isFirstSetup ? 'Initial System Setup' : 'Intelligence Fusion Platform'}
          </p>
        </div>

        {/* Glass panel */}
        <div className="bg-black/60 backdrop-blur-md border border-hud-green/20 rounded
                        shadow-[0_0_50px_rgba(0,255,65,0.07),inset_0_1px_1px_rgba(255,255,255,0.06)]">

          {/* Top accent line */}
          <div className="h-px bg-gradient-to-r from-transparent via-hud-green/50 to-transparent rounded-t" />

          <form className="px-6 pt-5 pb-6 space-y-4" onSubmit={handleSubmit}>

            {/* First-run badge */}
            {isFirstSetup && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-amber-400/25
                              bg-amber-400/8 text-amber-400 text-[10px] uppercase tracking-widest font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse
                                 shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
                First run — create admin account
              </div>
            )}

            {/* Panel heading */}
            <p className="text-white font-bold text-xs uppercase tracking-[0.2em]">
              {isFirstSetup ? 'Create Admin Account' : 'Operator Authentication'}
            </p>

            {/* Username */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-hud-green/55 uppercase tracking-[0.3em]">
                Username
              </label>
              <div className="relative">
                <User size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder="Enter username"
                  className="w-full bg-black/40 border border-white/10 rounded px-3 py-2.5 pl-8
                             text-white text-sm placeholder-white/20 font-mono
                             focus:outline-none focus:border-hud-green/45 focus:ring-1 focus:ring-hud-green/20
                             transition-colors"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-hud-green/55 uppercase tracking-[0.3em]">
                Password
              </label>
              <div className="relative">
                <Lock size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={isFirstSetup ? 'new-password' : 'current-password'}
                  placeholder={isFirstSetup ? 'Min. 8 characters' : 'Enter password'}
                  className="w-full bg-black/40 border border-white/10 rounded px-3 py-2.5 pl-8
                             text-white text-sm placeholder-white/20 font-mono
                             focus:outline-none focus:border-hud-green/45 focus:ring-1 focus:ring-hud-green/20
                             transition-colors"
                />
              </div>
            </div>

            {/* Confirm password — first-setup only */}
            {isFirstSetup && (
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-hud-green/55 uppercase tracking-[0.3em]">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="Repeat password"
                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2.5 pl-8
                               text-white text-sm placeholder-white/20 font-mono
                               focus:outline-none focus:border-hud-green/45 focus:ring-1 focus:ring-hud-green/20
                               transition-colors"
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 bg-alert-red/8 border border-alert-red/30 rounded
                              px-3 py-2 text-alert-red text-[11px] uppercase tracking-wider font-bold">
                <span className="mt-px shrink-0">▲</span>
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-hud-green text-black font-black py-2.5 rounded
                         text-[11px] uppercase tracking-[0.25em]
                         transition-all duration-200
                         hover:shadow-[0_0_28px_rgba(0,255,65,0.45)]
                         disabled:opacity-35 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {loading
                ? 'Authenticating…'
                : isFirstSetup
                  ? 'Create Account & Login'
                  : 'Authenticate'}
            </button>
          </form>

          {/* Bottom accent line */}
          <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent rounded-b" />
        </div>

        {/* Footer */}
        <p className="text-center text-white/15 text-[9px] mt-5 uppercase tracking-[0.45em]">
          Sovereign Watch · Secure Access Required
        </p>
      </div>
    </div>
  );
}

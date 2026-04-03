/**
 * UserManagementPanel — Admin-only panel for managing platform users.
 * Accessible from the TopBar system settings area.
 */

import { Plus, Shield, UserCheck, UserX } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
  createUser,
  deactivateUser,
  listUsers,
  updateUser,
  type UserCreate,
  type UserProfile,
  type UserUpdate,
} from '../../api/auth';
import { useAuth } from '../../hooks/useAuth';

const ROLE_COLORS: Record<string, string> = {
  admin: 'text-alert-red border-alert-red/30 bg-alert-red/10',
  operator: 'text-alert-amber border-alert-amber/30 bg-alert-amber/10',
  viewer: 'text-hud-green border-hud-green/30 bg-hud-green/10',
};

interface CreateFormState {
  username: string;
  password: string;
  role: 'viewer' | 'operator' | 'admin';
}

export function UserManagementPanel() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>({
    username: '',
    password: '',
    role: 'viewer',
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listUsers());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const data: UserCreate = {
        username: createForm.username,
        password: createForm.password,
        role: createForm.role,
      };
      await createUser(data);
      setCreateForm({ username: '', password: '', role: 'viewer' });
      setShowCreate(false);
      await fetchUsers();
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (userId: number, role: 'viewer' | 'operator' | 'admin') => {
    try {
      const update: UserUpdate = { role };
      await updateUser(userId, update);
      await fetchUsers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update user');
    }
  };

  const handleToggleActive = async (u: UserProfile) => {
    if (u.id === currentUser?.id) return; // prevent self-lockout
    try {
      if (u.is_active) {
        await deactivateUser(u.id);
      } else {
        const update: UserUpdate = { is_active: true };
        await updateUser(u.id, update);
      }
      await fetchUsers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update user');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded bg-hud-green/10 border border-hud-green/20">
            <Shield size={14} className="text-hud-green drop-shadow-[0_0_8px_rgba(0,255,65,0.6)]" />
          </div>
          <div>
            <h3 className="text-white font-black text-xs uppercase tracking-[0.2em] drop-shadow-[0_0_5px_rgba(0,255,65,0.3)] leading-tight">
              NODE_AUTH
            </h3>
            <p className="mt-0.5 text-[9px] text-white/30 font-mono uppercase tracking-widest">
              Control & Command
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="group flex items-center gap-1.5 bg-hud-green/10 hover:bg-hud-green/20 border border-hud-green/30 text-hud-green text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded transition-all active:scale-95 drop-shadow-[0_0_5px_rgba(0,255,65,0.3)] hover:drop-shadow-[0_0_10px_rgba(0,255,65,0.5)]"
        >
          <Plus size={12} className="group-hover:rotate-90 transition-transform duration-300" />
          {showCreate ? 'ABORT' : 'ADD NODE'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form 
          onSubmit={handleCreate} 
          className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-md p-4 space-y-3 animate-in zoom-in-95 fade-in duration-300"
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-white/40 text-[9px] font-bold uppercase tracking-[0.2em] font-mono">
              Initialize New Node
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-[8px] text-white/30 font-mono uppercase tracking-widest ml-0.5">Identity</label>
              <input
                type="text"
                placeholder="Username"
                value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                required
                className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-white text-[10px] font-mono placeholder:text-white/10 focus:outline-none focus:border-hud-green/30 focus:ring-1 focus:ring-hud-green/10 transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] text-white/30 font-mono uppercase tracking-widest ml-0.5">Credential</label>
              <input
                type="password"
                placeholder="********"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                required
                minLength={8}
                className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-white text-[10px] font-mono placeholder:text-white/10 focus:outline-none focus:border-hud-green/30 focus:ring-1 focus:ring-hud-green/10 transition-all"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[8px] text-white/30 font-mono uppercase tracking-widest ml-0.5">Privilege Level</label>
            <select
              value={createForm.role}
              onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as UserCreate['role'] })}
              className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-white text-[10px] font-mono focus:outline-none focus:border-hud-green/30 focus:ring-1 focus:ring-hud-green/10 transition-all appearance-none"
            >
              <option value="viewer" className="bg-slate-950">Viewer (read-only)</option>
              <option value="operator" className="bg-slate-950">Operator (read + write)</option>
              <option value="admin" className="bg-slate-950">Admin (full access)</option>
            </select>
          </div>

          {createError && (
            <div className="bg-alert-red/10 border border-alert-red/20 rounded-sm p-1.5">
              <p className="text-alert-red text-[8px] font-mono uppercase text-center">{createError}</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={creating}
              className="flex-1 bg-hud-green/10 hover:bg-hud-green/20 border border-hud-green/20 disabled:opacity-50 text-hud-green text-[9px] font-bold uppercase tracking-widest py-2 rounded transition-all active:scale-[0.98] drop-shadow-[0_0_5px_rgba(0,255,65,0.2)] hover:drop-shadow-[0_0_8px_rgba(0,255,65,0.4)]"
            >
              {creating ? 'COMMITTING...' : 'COMMIT CHANGES'}
            </button>
            <button
              type="button"
              onClick={() => { setShowCreate(false); setCreateError(null); }}
              className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 text-[9px] font-bold uppercase tracking-widest py-2 rounded transition-all"
            >
              ABORT
            </button>
          </div>
        </form>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-300 text-[10px] font-mono uppercase tracking-wider animate-shake">
          {error}
        </div>
      )}

      {/* User list */}
      <div className="space-y-2">
        <div className="flex items-center px-4 py-1 text-[9px] text-white/20 font-mono uppercase tracking-widest">
          <span className="flex-1">Active Nodes</span>
          <span className="w-24 text-center">Perms</span>
          <span className="w-8"></span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-4 w-4 rounded-full border-2 border-hud-green/20 border-t-hud-green animate-spin" />
            <span className="ml-3 text-[10px] text-white/40 font-mono uppercase tracking-widest">Scanning...</span>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
            {users.map((u, idx) => (
              <div
                key={u.id}
                className={`group flex items-center gap-2.5 bg-white/5 border border-white/5 rounded-md px-3 py-1.5 transition-all hover:bg-white/10 animate-in fade-in slide-in-from-left-4 duration-300`}
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                {/* Status indicator */}
                <div className={`w-1 h-3 rounded-full ${u.is_active ? 'bg-hud-green shadow-[0_0_8px_rgba(0,255,65,0.6)]' : 'bg-alert-red/40'}`} />

                {/* Username & Metadata */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${u.is_active ? 'text-white' : 'text-white/40'}`}>
                      {u.username}
                    </span>
                    {u.id === currentUser?.id && (
                      <span className="text-[7px] bg-white/10 text-white/40 px-1 rounded font-mono uppercase tracking-widest">SELF</span>
                    )}
                    <span className="text-[8px] text-white/10 font-mono hidden group-hover:inline transition-opacity uppercase">
                      ID:{u.id.toString().padStart(4, '0')}
                    </span>
                  </div>
                </div>

                {/* Role selector */}
                <select
                  value={u.role}
                  aria-label={"Role for user " + u.username}
                  disabled={u.id === currentUser?.id}
                  onChange={(e) => handleRoleChange(u.id, e.target.value as 'viewer' | 'operator' | 'admin')}
                  aria-label={`Role for user ${u.username}`}
                  className={`text-[9px] font-bold border rounded px-1.5 py-0.5 focus:outline-none transition-all cursor-pointer disabled:cursor-default uppercase tracking-widest border-current ${ROLE_COLORS[u.role]} bg-transparent`}
                >
                  <option value="viewer" className="bg-slate-950">Viewer</option>
                  <option value="operator" className="bg-slate-950">Operator</option>
                  <option value="admin" className="bg-slate-950">Admin</option>
                </select>

                {/* Toggle active / deactivate */}
                <button
                  onClick={() => handleToggleActive(u)}
                  disabled={u.id === currentUser?.id}
                  title={u.is_active ? `Deactivate user ${u.username}` : `Activate user ${u.username}`}
                  aria-label={u.is_active ? `Deactivate user ${u.username}` : `Activate user ${u.username}`}
                  className="p-1.5 bg-white/5 hover:bg-white/10 rounded text-white/20 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
                >
                  {u.is_active ? (
                    <UserCheck size={12} className="text-hud-green drop-shadow-[0_0_5px_rgba(0,255,65,0.4)]" aria-hidden="true" />
                  ) : (
                    <UserX size={12} className="text-alert-red" aria-hidden="true" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-white/5 pt-4">
        <p className="text-[9px] text-white/30 font-mono uppercase tracking-[0.1em] leading-relaxed">
          Operational Security Warning: Privilege escalation attempts are logged. 
          Contact System Administrator for credentials restoration.
        </p>
      </div>
    </div>
  );
}

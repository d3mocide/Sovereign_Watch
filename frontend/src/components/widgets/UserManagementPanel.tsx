/**
 * UserManagementPanel — Admin-only panel for managing platform users.
 * Accessible from the TopBar system settings area.
 */

import { Plus, Shield, Trash2, UserCheck, UserX } from 'lucide-react';
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
  admin: 'text-red-400 border-red-700 bg-red-950',
  operator: 'text-amber-400 border-amber-700 bg-amber-950',
  viewer: 'text-emerald-400 border-emerald-700 bg-emerald-950',
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-emerald-400" />
          <h3 className="text-white font-semibold text-sm uppercase tracking-wider">
            User Management
          </h3>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs px-2.5 py-1.5 rounded transition-colors"
        >
          <Plus size={12} />
          Add User
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="bg-gray-800 border border-gray-600 rounded p-3 space-y-2">
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">New User</p>
          <input
            type="text"
            placeholder="Username"
            value={createForm.username}
            onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
            required
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-emerald-500"
          />
          <input
            type="password"
            placeholder="Password (min 8 chars)"
            value={createForm.password}
            onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
            required
            minLength={8}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-emerald-500"
          />
          <select
            value={createForm.role}
            onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as UserCreate['role'] })}
            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-emerald-500"
          >
            <option value="viewer">Viewer (read-only)</option>
            <option value="operator">Operator (read + write)</option>
            <option value="admin">Admin (full access)</option>
          </select>
          {createError && (
            <p className="text-red-400 text-xs">{createError}</p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating}
              className="flex-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs py-1.5 rounded transition-colors"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => { setShowCreate(false); setCreateError(null); }}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs py-1.5 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-950 border border-red-700 rounded px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* User list */}
      {loading ? (
        <p className="text-gray-500 text-xs">Loading users…</p>
      ) : (
        <div className="space-y-1.5">
          {users.map((u) => (
            <div
              key={u.id}
              className={`flex items-center gap-2 bg-gray-800 border rounded px-3 py-2 ${u.is_active ? 'border-gray-700' : 'border-gray-800 opacity-60'}`}
            >
              {/* Username */}
              <span className="text-white text-xs font-medium flex-1 truncate">
                {u.username}
                {u.id === currentUser?.id && (
                  <span className="text-gray-500 ml-1">(you)</span>
                )}
              </span>

              {/* Role selector */}
              <select
                value={u.role}
                disabled={u.id === currentUser?.id}
                onChange={(e) => handleRoleChange(u.id, e.target.value as 'viewer' | 'operator' | 'admin')}
                className={`text-xs border rounded px-1.5 py-0.5 focus:outline-none ${ROLE_COLORS[u.role]} bg-transparent cursor-pointer disabled:cursor-default`}
              >
                <option value="viewer">Viewer</option>
                <option value="operator">Operator</option>
                <option value="admin">Admin</option>
              </select>

              {/* Toggle active */}
              <button
                onClick={() => handleToggleActive(u)}
                disabled={u.id === currentUser?.id}
                title={u.is_active ? 'Deactivate user' : 'Activate user'}
                className="text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {u.is_active ? (
                  <UserCheck size={14} className="text-emerald-400" />
                ) : (
                  <UserX size={14} className="text-red-400" />
                )}
              </button>

              {/* Deactivate button */}
              {u.is_active && u.id !== currentUser?.id && (
                <button
                  onClick={() => handleToggleActive(u)}
                  title="Deactivate user"
                  className="text-gray-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-gray-600 text-xs">
        Roles: <span className="text-emerald-400">viewer</span> = read-only ·{' '}
        <span className="text-amber-400">operator</span> = read + write ·{' '}
        <span className="text-red-400">admin</span> = full access
      </p>
    </div>
  );
}

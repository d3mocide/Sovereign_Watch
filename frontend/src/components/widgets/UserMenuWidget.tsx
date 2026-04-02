import { LogOut, User, X } from "lucide-react";
import React from "react";
import { useAuth } from "../../hooks/useAuth";
import { UserManagementPanel } from "./UserManagementPanel";

interface UserMenuWidgetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserMenuWidget: React.FC<UserMenuWidgetProps> = ({
  isOpen,
  onClose,
}) => {
  const { user, logout, hasRole } = useAuth();
  if (!isOpen || !user) return null;

  return (
    <div
      className="absolute top-[calc(100%+20px)] right-0 z-[100] w-[320px] animate-in slide-in-from-top-2 fade-in duration-200"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="User Menu"
    >
      <div className="bg-black/95 backdrop-blur-xl border border-hud-green/30 rounded-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header - User Profile */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hud-green/20 bg-hud-green/5">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${
              user.role === 'admin' ? 'bg-red-500/10' : 'bg-hud-green/10'
            }`}>
              <User
                size={18}
                className={user.role === 'admin' ? 'text-red-400' : 'text-hud-green'}
              />
            </div>
            <span className="text-xs font-black tracking-widest text-white uppercase italic">
              {user.username}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[8px] font-bold uppercase tracking-[0.2em] px-1.5 py-0.5 rounded ${
              user.role === 'admin'
                ? 'text-red-400 bg-red-950/60 border border-red-800/40'
                : user.role === 'operator'
                  ? 'text-amber-400 bg-amber-950/60 border border-amber-800/40'
                  : 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/40'
            }`}>
              {user.role}
            </span>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col p-2 max-h-[400px] overflow-y-auto custom-scrollbar">
          {/* User Management Section (Admin Only) */}
          {hasRole('admin') && (
            <div className="mb-2">
              <div className="px-2 py-1.5 mb-1">
                <span className="text-[9px] font-bold text-white/30 uppercase tracking-[0.3em]">
                  Admin Controls
                </span>
              </div>
              <div className="p-2 bg-white/5 rounded border border-white/5">
                <UserManagementPanel />
              </div>
            </div>
          )}

          {/* Logout Action */}
          <button
            onClick={() => {
              logout();
              onClose();
            }}
            className="flex items-center gap-3 w-full px-3 py-2.5 mt-1 rounded-md text-white/60 hover:text-red-400 hover:bg-red-400/10 transition-all group"
          >
            <LogOut size={16} className="group-hover:translate-x-0.5 transition-transform" />
            <span className="text-[11px] font-bold tracking-widest uppercase">
              Terminate Session
            </span>
          </button>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-white/5 bg-black/40">
          <p className="text-[8px] text-white/20 tracking-tighter uppercase font-mono">
            Sovereign_Watch_Auth_Node // {new Date().toISOString().split('T')[0]}
          </p>
        </div>
      </div>
    </div>
  );
};

import { Eye, Loader2, Plus, Trash2 } from "lucide-react";
import React, { useEffect } from "react";
import { useWatchlist } from "../../hooks/useWatchlist";

interface WatchlistManagerProps {
  isOpen: boolean;
}

export const WatchlistManager: React.FC<WatchlistManagerProps> = ({
  isOpen,
}) => {
  const {
    watchlist,
    loading,
    error,
    newIcao24,
    setNewIcao24,
    addLoading,
    fetchWatchlist,
    addEntry,
    removeEntry,
  } = useWatchlist();

  useEffect(() => {
    if (isOpen) fetchWatchlist();
  }, [isOpen, fetchWatchlist]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <Eye size={11} className="text-hud-green/70" />
          <span className="text-[9px] font-bold text-white/40 tracking-widest">
            GLOBAL WATCHLIST
          </span>
        </div>
        {loading && (
          <Loader2 size={10} className="text-hud-green/50 animate-spin" />
        )}
      </div>

      {/* Add ICAO24 input */}
      <div className="flex gap-1.5">
        <input
          type="text"
          maxLength={6}
          placeholder="ICAO24 HEX..."
          aria-label="ICAO24 Hex Code"
          value={newIcao24}
          onChange={(e) =>
            setNewIcao24(
              e.target.value.toLowerCase().replace(/[^0-9a-f]/g, ""),
            )
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") addEntry();
          }}
          className="flex-1 bg-black/50 border border-white/10 rounded px-2 py-1 text-[10px] font-mono text-white placeholder-white/20 focus:outline-none focus:border-hud-green/50 focus:ring-1 focus:ring-hud-green/50 uppercase"
        />
        <button
          onClick={addEntry}
          disabled={newIcao24.length !== 6 || addLoading}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-hud-green/10 border border-hud-green/30 text-hud-green hover:bg-hud-green/20 disabled:opacity-30 disabled:hover:bg-hud-green/10 transition-colors focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
          title="Add to watchlist (permanent)"
        >
          {addLoading ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Plus size={11} />
          )}
          <span className="text-[9px] font-bold tracking-wider">ADD</span>
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-[9px] text-alert-red/80 px-1 font-mono">{error}</p>
      )}

      {/* Watchlist entries */}
      {watchlist.length > 0 ? (
        <div className="flex flex-col gap-1 max-h-[130px] overflow-y-auto pr-1 custom-scrollbar">
          {watchlist.map((entry) => (
            <div
              key={entry.icao24}
              className="flex items-center justify-between rounded border border-hud-green/10 bg-hud-green/5 group"
            >
              <div className="flex flex-col px-2 py-1 min-w-0">
                <span className="text-[10px] font-mono font-bold text-hud-green/90 uppercase tracking-wider">
                  {entry.icao24}
                </span>
                <span className="text-[8px] text-white/30 tracking-wide">
                  {entry.permanent
                    ? "PERMANENT"
                    : entry.expires_at
                      ? `EXP ${new Date(entry.expires_at).toLocaleDateString()}`
                      : ""}
                </span>
              </div>
              <button
                onClick={() => removeEntry(entry.icao24)}
                className="p-1.5 text-alert-red/40 hover:text-alert-red hover:bg-alert-red/10 rounded-r transition-colors outline-none focus-visible:ring-1 focus-visible:ring-alert-red"
                aria-label={`Remove ${entry.icao24} from watchlist`}
                title="Remove from watchlist"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        !loading && (
          <p className="text-[9px] text-white/20 px-1 italic">
            No entries — aircraft added here are tracked globally.
          </p>
        )
      )}
    </div>
  );
};

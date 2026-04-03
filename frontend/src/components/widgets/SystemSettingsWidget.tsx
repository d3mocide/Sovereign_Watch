import { Server, X } from "lucide-react";
import React from "react";
import { FilterPresets } from "./FilterPresets";
import { WatchlistManager } from "./WatchlistManager";

interface SystemSettingsWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  filters: Record<string, boolean | string | number | string[]>;
  onFilterChange: (
    key: string,
    value: boolean | string | number | string[],
  ) => void;
}

export const SystemSettingsWidget: React.FC<SystemSettingsWidgetProps> = ({
  isOpen,
  onClose,
  filters,
  onFilterChange,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="absolute top-[calc(100%+20px)] left-1/2 -translate-x-1/2 z-[100] w-[320px] animate-in slide-in-from-top-2 fade-in duration-200"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="System Settings"
    >
      <div className="bg-black/90 backdrop-blur-xl border border-hud-green/30 rounded-lg shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-hud-green/20 bg-hud-green/10">
          <div className="flex items-center gap-2">
            <Server
              size={14}
              className="text-hud-green drop-shadow-[0_0_8px_rgba(0,255,65,0.8)]"
            />
            <h3 className="text-[10px] font-black tracking-widest text-hud-green drop-shadow-[0_0_5px_rgba(0,255,65,0.5)] uppercase">
              SYSTEM SETTINGS
            </h3>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
          >
            <X size={12} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-3 p-3">
          <FilterPresets filters={filters} onFilterChange={onFilterChange} />

          <div className="h-px w-full bg-hud-green/10" />

          {/* H3 Coverage Toggle */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold text-white/40 tracking-widest px-1 mb-0.5">
              VISUALIZERS
            </span>
            <label
              className={`group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showH3Coverage === true ? "border-hud-green/20 bg-hud-green/5" : "border-white/5 bg-white/5 hover:bg-white/10"}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-hud-green/60">⬡</span>
                <span
                  className={`text-[9px] font-bold tracking-wide ${filters.showH3Coverage === true ? "text-hud-green/80" : "text-white/40"}`}
                >
                  H3 POLLER MESH (DEBUG)
                </span>
              </div>
              <input
                type="checkbox"
                className="sr-only"
                checked={filters.showH3Coverage === true}
                onChange={(e) =>
                  onFilterChange("showH3Coverage", e.target.checked)
                }
              />
              <div
                className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showH3Coverage === true ? "bg-hud-green/80" : "bg-white/10"}`}
              >
                <div
                  className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showH3Coverage === true ? "left-2.5" : "left-0.5"}`}
                />
              </div>
            </label>
          </div>

          <div className="h-px w-full bg-hud-green/10" />

          <WatchlistManager isOpen={isOpen} />
        </div>
      </div>
    </div>
  );
};

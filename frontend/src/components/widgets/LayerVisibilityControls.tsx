import {
  Anchor,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Globe,
  Layers,
  Network,
  Radio,
  RefreshCw,
  Sparkles,
  TowerControl,
  WifiOff,
} from "lucide-react";
import React, { useState } from "react";
import { MapFilters } from "../../types";
import { getFilterPref, saveFilterPref } from "../../utils/filterPreferences";

interface LayerVisibilityControlsProps {
  filters?: MapFilters;
  onFilterChange?: (key: string, value: boolean | number) => void;
  radiorefEnabled?: boolean;
}

export const LayerVisibilityControls: React.FC<
  LayerVisibilityControlsProps
> = ({ filters, onFilterChange, radiorefEnabled }) => {
  const [showLayers, setShowLayers] = useState(false);
  const [infraExpanded, setInfraExpanded] = useState(false);
  const [rfExpanded, setRfExpanded] = useState(false);
  const [hazardsExpanded, setHazardsExpanded] = useState(false);

  const handleSubFilterChange = (key: string, value: boolean) => {
    if (onFilterChange) {
      onFilterChange(key, value);
      saveFilterPref(key, value);
    }
  };

  const infraIsOn =
    !!filters &&
    (filters.showCables !== false ||
      filters.showLandingStations !== false ||
      filters.showOutages === true ||
      filters.showTowers === true);

  const hazardsIsOn = !!filters && (!!filters.showAurora || !!filters.showJamming || filters.showHoldingPatterns !== false);

  const toggleInfra = () => {
    if (!onFilterChange || !filters) return;
    if (infraIsOn) {
      onFilterChange("showCables", false);
      onFilterChange("showLandingStations", false);
      onFilterChange("showOutages", false);
      onFilterChange("showTowers", false);
    } else {
      onFilterChange("showCables", getFilterPref("showCables", true));
      onFilterChange("showOutages", getFilterPref("showOutages", true));
      onFilterChange("showTowers", getFilterPref("showTowers", false));
      onFilterChange(
        "showLandingStations",
        getFilterPref("showLandingStations", false),
      );
    }
  };

  const toggleHazards = () => {
    if (!onFilterChange || !filters) return;
    if (hazardsIsOn) {
      onFilterChange("showAurora", false);
      onFilterChange("showJamming", false);
      onFilterChange("showHoldingPatterns", false);
    } else {
      onFilterChange("showAurora", getFilterPref("showAurora", false));
      onFilterChange("showJamming", getFilterPref("showJamming", true));
      onFilterChange("showHoldingPatterns", getFilterPref("showHoldingPatterns", true));
    }
  };

  return (
    <>
      {/* Map Layers header with quick-toggle icons */}
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-2 transition-colors relative">
        <button
          className="absolute inset-0 h-full w-full cursor-pointer text-left focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
          onClick={() => setShowLayers(!showLayers)}
          aria-expanded={showLayers}
          aria-label="Toggle Map Layers"
        />
        <div className="relative flex items-center gap-2 pointer-events-none">
          <Layers size={13} className="text-cyan-400" aria-hidden="true" />
          <span className="text-[10px] font-bold tracking-[.3em] text-white/50 uppercase">
            Map Layers
          </span>
        </div>
        <div className="flex items-center gap-3 relative pointer-events-none">
          {filters && onFilterChange && (
            <div className="flex items-center gap-2 mr-2 pointer-events-auto">
              <button
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onFilterChange("showRepeaters", !filters.showRepeaters);
                }}
                className={`p-1 rounded transition-all active:scale-95 focus-visible:ring-1 focus-visible:ring-emerald-400 outline-none ${
                  filters.showRepeaters
                    ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/30"
                    : "text-white/30 hover:text-white/70 hover:bg-white/5 border border-transparent"
                }`}
                title="Toggle Amateur Radio Repeaters"
                aria-label="Toggle Amateur Radio Repeaters"
                aria-pressed={!!filters.showRepeaters}
              >
                <Radio size={12} aria-hidden="true" />
              </button>
              <button
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  toggleInfra();
                }}
                className={`p-1 rounded transition-all active:scale-95 focus-visible:ring-1 focus-visible:ring-hud-green outline-none ${
                  infraIsOn
                    ? "bg-cyan-400/10 text-cyan-400 border border-cyan-400/30"
                    : "text-white/30 hover:text-white/70 hover:bg-white/5 border border-transparent"
                }`}
                title="Toggle Global Network"
                aria-label="Toggle Global Network"
                aria-pressed={infraIsOn}
              >
                <Network size={12} aria-hidden="true" />
              </button>
              <button
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  toggleHazards();
                }}
                className={`p-1 rounded transition-all active:scale-95 focus-visible:ring-1 focus-visible:ring-purple-400 outline-none ${
                  hazardsIsOn
                    ? "bg-purple-400/10 text-purple-400 border border-purple-400/30"
                    : "text-white/30 hover:text-white/70 hover:bg-white/5 border border-transparent"
                }`}
                title="Toggle Hazards Layers"
                aria-label="Toggle Hazards Layers"
                aria-pressed={hazardsIsOn}
              >
                <WifiOff size={12} aria-hidden="true" />
              </button>
            </div>
          )}

          {showLayers ? (
            <ChevronUp
              size={14}
              className="text-white/40 pointer-events-none transition-colors relative"
              aria-hidden="true"
            />
          ) : (
            <ChevronDown
              size={14}
              className="text-white/40 pointer-events-none transition-colors relative"
              aria-hidden="true"
            />
          )}
        </div>
      </div>

      {/* Expanded layer controls panel */}
      {showLayers && filters && onFilterChange && (
        <div className="p-2 space-y-2 border-b border-white/10 bg-black/60 max-h-[60vh] overflow-y-auto">
          {/* RF Infrastructure */}
          <div className="flex flex-col gap-1">
            <div
              className={`group flex items-center justify-between rounded border transition-all ${filters.showRepeaters ? "border-emerald-400/30 bg-emerald-400/10 shadow-[0_0_8px_rgba(16,185,129,0.2)]" : "border-white/5 bg-white/5 hover:bg-white/10"}`}
            >
              <button
                className="flex flex-1 items-center justify-between p-2 cursor-pointer text-left focus-visible:ring-1 focus-visible:ring-hud-green outline-none w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  setRfExpanded(!rfExpanded);
                }}
                aria-expanded={rfExpanded}
              >
                <div className="flex items-center gap-3">
                  <Radio
                    size={14}
                    className={
                      filters.showRepeaters
                        ? "text-emerald-400"
                        : "text-white/30 group-hover:text-white/50"
                    }
                    aria-hidden="true"
                  />
                  <div className="flex flex-col">
                    <span className="text-mono-sm font-bold tracking-wider uppercase text-white/90">
                      RF Infrastructure
                    </span>
                  </div>
                </div>
                <div
                  className="w-4 flex justify-center transition-transform duration-200 shrink-0"
                  style={{ transform: rfExpanded ? "rotate(90deg)" : "none" }}
                >
                  <ChevronRight
                    size={14}
                    className="text-white/40"
                    aria-hidden="true"
                  />
                </div>
              </button>
              <button
                className="border-l border-white/10 p-2 focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
                onClick={(e) => {
                  e.stopPropagation();
                  onFilterChange("showRepeaters", !filters.showRepeaters);
                }}
                aria-label="Toggle RF Infrastructure"
                aria-pressed={!!filters.showRepeaters}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={!!filters.showRepeaters}
                  onChange={() =>
                    onFilterChange("showRepeaters", !filters.showRepeaters)
                  }
                  tabIndex={-1}
                />
                <div
                  className={`h-3 w-6 cursor-pointer rounded-full transition-colors relative ${filters.showRepeaters ? "bg-emerald-400" : "bg-white/10 hover:bg-white/20"}`}
                >
                  <div
                    className={`absolute top-0.5 h-2 w-2 rounded-full bg-black transition-all ${filters.showRepeaters ? "left-3.5" : "left-0.5"}`}
                  />
                </div>
              </button>
            </div>

            {rfExpanded && (
              <div className="flex flex-col gap-1 px-0 mt-1">
                <div className="flex flex-row gap-1">
                  {/* Ham / GMRS */}
                  <label
                    className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${
                      filters.rfEmcommOnly
                        ? "opacity-20 pointer-events-none grayscale"
                        : ""
                    } ${
                      filters.showHam !== false
                        ? "border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                        : "border-white/5 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <span
                      className={`text-[9px] font-bold tracking-tight ${filters.showHam !== false ? "text-emerald-400" : "text-emerald-400/30"}`}
                    >
                      HAM
                    </span>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={filters.showHam !== false}
                      onChange={() =>
                        onFilterChange("showHam", filters.showHam === false)
                      }
                    />
                    <div
                      className={`h-1.5 w-3 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showHam !== false ? "bg-emerald-400" : "bg-white/10"}`}
                    >
                      <div
                        className={`absolute top-0.25 h-1 w-1 rounded-full bg-black transition-all ${filters.showHam !== false ? "left-1.75" : "left-0.25"}`}
                      />
                    </div>
                  </label>

                  {/* NOAA NWR */}
                  <label
                    className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${
                      filters.rfEmcommOnly
                        ? "opacity-20 pointer-events-none grayscale"
                        : ""
                    } ${
                      filters.showNoaa !== false
                        ? "border-sky-500/50 bg-sky-500/10 shadow-[0_0_8px_rgba(56,189,248,0.2)]"
                        : "border-white/5 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <span
                      className={`text-[9px] font-bold tracking-tight ${filters.showNoaa !== false ? "text-sky-400" : "text-sky-400/30"}`}
                    >
                      NOAA
                    </span>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={filters.showNoaa !== false}
                      onChange={() =>
                        onFilterChange("showNoaa", filters.showNoaa === false)
                      }
                    />
                    <div
                      className={`h-1.5 w-3 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showNoaa !== false ? "bg-sky-400" : "bg-white/10"}`}
                    >
                      <div
                        className={`absolute top-0.25 h-1 w-1 rounded-full bg-black transition-all ${filters.showNoaa !== false ? "left-1.75" : "left-0.25"}`}
                      />
                    </div>
                  </label>

                  {/* Public Safety + EMCOMM (RadioRef-gated) */}
                  {radiorefEnabled !== false && (
                    <>
                      <label
                        className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${
                          filters.rfEmcommOnly
                            ? "opacity-20 pointer-events-none grayscale"
                            : ""
                        } ${
                          filters.showPublicSafety !== false
                            ? "border-amber-500/50 bg-amber-500/10 shadow-[0_0_8px_rgba(251,191,36,0.2)]"
                            : "border-white/5 bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <span
                          className={`text-[9px] font-bold tracking-tight ${filters.showPublicSafety !== false ? "text-amber-400" : "text-amber-400/30"}`}
                        >
                          PSB
                        </span>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={filters.showPublicSafety !== false}
                          onChange={() =>
                            onFilterChange(
                              "showPublicSafety",
                              filters.showPublicSafety === false,
                            )
                          }
                        />
                        <div
                          className={`h-1.5 w-3 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showPublicSafety !== false ? "bg-amber-400" : "bg-white/10"}`}
                        >
                          <div
                            className={`absolute top-0.25 h-1 w-1 rounded-full bg-black transition-all ${filters.showPublicSafety !== false ? "left-1.75" : "left-0.25"}`}
                          />
                        </div>
                      </label>
                      {/* EMCOMM Only */}
                      <label
                        className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.rfEmcommOnly ? "border-red-500/50 bg-red-500/10 shadow-[0_0_8px_rgba(239,68,68,0.2)]" : "border-white/5 bg-white/5"}`}
                      >
                        <span
                          className={`text-[9px] font-bold tracking-tight ${filters.rfEmcommOnly ? "text-red-400/80" : "text-red-400/30"}`}
                        >
                          EMCOMM
                        </span>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={!!filters.rfEmcommOnly}
                          onChange={(e) =>
                            onFilterChange("rfEmcommOnly", e.target.checked)
                          }
                        />
                        <div
                          className={`h-1.5 w-3 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.rfEmcommOnly ? "bg-red-400/80" : "bg-white/10"}`}
                        >
                          <div
                            className={`absolute top-0.25 h-1 w-1 rounded-full bg-black transition-all ${filters.rfEmcommOnly ? "left-1.75" : "left-0.25"}`}
                          />
                        </div>
                      </label>
                    </>
                  )}
                </div>

                {/* RF Range Buttons */}
                <div className="mt-2 mb-2 p-1 border border-white/5 bg-white/5 rounded">
                  <div className="flex items-center justify-between gap-1 mb-1 px-1">
                    <span className="text-[9px] font-bold text-white/40 tracking-wider">
                      RANGE
                    </span>
                    <span className="text-[9px] font-bold text-emerald-400/80">
                      {filters.rfRadius || 300} NM
                    </span>
                  </div>
                  <div className="flex w-full gap-1">
                    {[150, 300, 600].map((dist) => (
                      <button
                        key={dist}
                        className={`flex-1 py-1 text-[9px] font-bold rounded border transition-all ${
                          (filters.rfRadius || 300) === dist
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                            : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10 hover:text-white/60"
                        }`}
                        onClick={() => onFilterChange("rfRadius", dist)}
                      >
                        {dist > 999 ? `${dist / 1000}K` : dist}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Global Network */}
          <div className="flex flex-col gap-1">
            <div
              className={`group flex items-center justify-between rounded border transition-all ${infraIsOn ? "border-cyan-400/30 bg-cyan-400/10 shadow-[0_0_8px_rgba(34,211,238,0.2)]" : "border-white/5 bg-white/5 hover:bg-white/10"}`}
            >
              <button
                className="flex flex-1 items-center justify-between p-2 cursor-pointer text-left focus-visible:ring-1 focus-visible:ring-hud-green outline-none w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  setInfraExpanded(!infraExpanded);
                }}
                aria-expanded={infraExpanded}
              >
                <div className="flex items-center gap-3">
                  <Network
                    size={14}
                    className={infraIsOn ? "text-cyan-400" : "text-white/20"}
                    aria-hidden="true"
                  />
                  <div className="flex flex-col">
                    <span className="text-mono-sm font-bold tracking-wider uppercase text-white/90">
                      GLOBAL NETWORK
                    </span>
                  </div>
                </div>
                <div
                  className="w-4 flex justify-center transition-transform duration-200 shrink-0"
                  style={{
                    transform: infraExpanded ? "rotate(90deg)" : "none",
                  }}
                >
                  <ChevronRight
                    size={14}
                    className="text-white/40"
                    aria-hidden="true"
                  />
                </div>
              </button>

              <button
                className="border-l border-white/10 p-2 focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleInfra();
                }}
                aria-label="Toggle Global Network"
                aria-pressed={infraIsOn}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={infraIsOn}
                  onChange={toggleInfra}
                  tabIndex={-1}
                />
                <div
                  className={`h-3 w-6 cursor-pointer rounded-full transition-colors relative ${infraIsOn ? "bg-cyan-400" : "bg-white/10 hover:bg-white/20"}`}
                >
                  <div
                    className={`absolute top-0.5 h-2 w-2 rounded-full bg-black transition-all ${infraIsOn ? "left-3.5" : "left-0.5"}`}
                  />
                </div>
              </button>
            </div>

            {infraExpanded && (
              <div className="flex flex-col gap-1 px-0 opacity-90 mt-1">
                {/* Undersea Cables */}
                <label
                  className={`group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showCables !== false ? "border-cyan-500/50 bg-cyan-500/10 shadow-[0_0_8px_rgba(34,211,238,0.2)]" : "border-white/5 bg-white/5"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <Globe
                      size={10}
                      className={
                        filters.showCables !== false
                          ? "text-cyan-400"
                          : "text-white/20"
                      }
                    />
                    <span
                      className={`text-[9px] font-bold tracking-wide ${filters.showCables !== false ? "text-cyan-400/80" : "text-cyan-400/30"}`}
                    >
                      UNDERSEA CABLES
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={filters.showCables !== false}
                    onChange={(e) =>
                      handleSubFilterChange("showCables", e.target.checked)
                    }
                  />
                  <div
                    className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showCables !== false ? "bg-cyan-400/80" : "bg-white/10"}`}
                  >
                    <div
                      className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showCables !== false ? "left-2.5" : "left-0.5"}`}
                    />
                  </div>
                </label>

                {/* Landing Stations */}
                <label
                  className={`group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showLandingStations !== false ? "border-cyan-500/50 bg-cyan-500/10 shadow-[0_0_8px_rgba(34,211,238,0.2)]" : "border-white/5 bg-white/5"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <Anchor
                      size={10}
                      className={
                        filters.showLandingStations !== false
                          ? "text-cyan-400"
                          : "text-white/20"
                      }
                    />
                    <span
                      className={`text-[9px] font-bold tracking-wide ${filters.showLandingStations !== false ? "text-cyan-400/80" : "text-cyan-400/30"}`}
                    >
                      LANDING STATIONS
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={filters.showLandingStations !== false}
                    onChange={(e) =>
                      handleSubFilterChange(
                        "showLandingStations",
                        e.target.checked,
                      )
                    }
                  />
                  <div
                    className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showLandingStations !== false ? "bg-cyan-400/80" : "bg-white/10"}`}
                  >
                    <div
                      className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showLandingStations !== false ? "left-2.5" : "left-0.5"}`}
                    />
                  </div>
                </label>

                {/* Internet Outages */}
                <label
                  className={`group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showOutages === true ? "border-red-500/50 bg-red-500/10 shadow-[0_0_8px_rgba(239,68,68,0.2)]" : "border-white/5 bg-white/5"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <WifiOff
                      size={10}
                      className={
                        filters.showOutages === true
                          ? "text-red-400"
                          : "text-white/20"
                      }
                    />
                    <span
                      className={`text-[9px] font-bold tracking-wide ${filters.showOutages === true ? "text-red-400/80" : "text-red-400/30"}`}
                    >
                      INTERNET OUTAGES
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={filters.showOutages === true}
                    onChange={(e) =>
                      handleSubFilterChange("showOutages", e.target.checked)
                    }
                  />
                  <div
                    className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showOutages === true ? "bg-red-400/80" : "bg-white/10"}`}
                  >
                    <div
                      className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showOutages === true ? "left-2.5" : "left-0.5"}`}
                    />
                  </div>
                </label>

                {/* FCC Towers */}
                <label
                  className={`group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showTowers ? "border-orange-500/50 bg-orange-500/10 shadow-[0_0_8px_rgba(249,115,22,0.2)]" : "border-white/5 bg-white/5"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <TowerControl
                      size={10}
                      className={
                        filters.showTowers ? "text-orange-500" : "text-white/20"
                      }
                    />
                    <span
                      className={`text-[9px] font-bold tracking-wide ${filters.showTowers ? "text-orange-500/80" : "text-white/30"}`}
                    >
                      FCC TOWERS
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={!!filters.showTowers}
                    onChange={(e) =>
                      handleSubFilterChange("showTowers", e.target.checked)
                    }
                  />
                  <div
                    className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showTowers ? "bg-orange-500/80" : "bg-white/10"}`}
                  >
                    <div
                      className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showTowers ? "left-2.5" : "left-0.5"}`}
                    />
                  </div>
                </label>

                {/* Cable Opacity Slider */}
                <div className="group flex flex-col gap-1 rounded border border-white/5 bg-white/5 p-1.5 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold tracking-wide text-white/50">
                      CABLE OPACITY
                    </span>
                    <span className="text-[9px] text-white/50">
                      {Math.round(
                        ((filters.cableOpacity as unknown as number) ?? 0.6) *
                          100,
                      )}
                      %
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="1"
                    step="0.1"
                    value={(filters.cableOpacity as unknown as number) ?? 0.6}
                    onChange={(e) =>
                      onFilterChange(
                        "cableOpacity",
                        parseFloat(e.target.value) as unknown as boolean,
                      )
                    }
                    className="h-1 w-full appearance-none rounded bg-white/10 outline-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Hazards */}
          <div className="flex flex-col gap-1">
            <div
              className={`group flex items-center justify-between rounded border transition-all ${hazardsIsOn ? "border-purple-400/30 bg-purple-400/10 shadow-[0_0_8px_rgba(168,85,247,0.2)]" : "border-white/5 bg-white/5 hover:bg-white/10"}`}
            >
              <button
                className="flex flex-1 items-center justify-between p-2 cursor-pointer text-left focus-visible:ring-1 focus-visible:ring-hud-green outline-none w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  setHazardsExpanded(!hazardsExpanded);
                }}
                aria-expanded={hazardsExpanded}
              >
                <div className="flex items-center gap-3">
                  <Globe
                    size={14}
                    className={hazardsIsOn ? "text-purple-400" : "text-white/20"}
                    aria-hidden="true"
                  />
                  <div className="flex flex-col">
                    <span className="text-mono-sm font-bold tracking-wider uppercase text-white/90">
                      Hazards
                    </span>
                  </div>
                </div>
                <div
                  className="w-4 flex justify-center transition-transform duration-200 shrink-0"
                  style={{ transform: hazardsExpanded ? "rotate(90deg)" : "none" }}
                >
                  <ChevronRight
                    size={14}
                    className="text-white/40"
                    aria-hidden="true"
                  />
                </div>
              </button>

              <button
                className="border-l border-white/10 p-2 focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleHazards();
                }}
                aria-label="Toggle Hazards Layers"
                aria-pressed={hazardsIsOn}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={hazardsIsOn}
                  onChange={() => toggleHazards()}
                  tabIndex={-1}
                />
                <div
                  className={`h-3 w-6 cursor-pointer rounded-full transition-colors relative ${hazardsIsOn ? "bg-purple-400" : "bg-white/10 hover:bg-white/20"}`}
                >
                  <div
                    className={`absolute top-0.5 h-2 w-2 rounded-full bg-black transition-all ${hazardsIsOn ? "left-3.5" : "left-0.5"}`}
                  />
                </div>
              </button>
            </div>

            {hazardsExpanded && (
              <div className="flex flex-col gap-1 px-0 opacity-90 mt-1">
                {/* Aurora Forecast */}
                <label
                  className={`group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showAurora ? "border-purple-500/50 bg-purple-500/10 shadow-[0_0_8px_rgba(168,85,247,0.2)]" : "border-white/5 bg-white/5"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <Sparkles
                      size={10}
                      className={
                        filters.showAurora ? "text-purple-400" : "text-white/20"
                      }
                    />
                    <span
                      className={`text-[9px] font-bold tracking-wide ${filters.showAurora ? "text-purple-400/80" : "text-white/30"}`}
                    >
                      AURORA FORECAST
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={filters.showAurora || false}
                    onChange={(e) =>
                      onFilterChange("showAurora", e.target.checked)
                    }
                  />
                  <div
                    className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showAurora ? "bg-purple-400/80" : "bg-white/10"}`}
                  >
                    <div
                      className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showAurora ? "left-2.5" : "left-0.5"}`}
                    />
                  </div>
                </label>

                <label
                  className={`group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showJamming ? "border-rose-500/50 bg-rose-500/10 shadow-[0_0_8px_rgba(244,63,94,0.2)]" : "border-white/5 bg-white/5"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <WifiOff
                      size={10}
                      className={
                        filters.showJamming ? "text-rose-400" : "text-white/20"
                      }
                    />
                    <span
                      className={`text-[9px] font-bold tracking-wide ${filters.showJamming ? "text-rose-400/80" : "text-white/30"}`}
                    >
                      GPS INTEGRITY ZONES
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={filters.showJamming || false}
                    onChange={(e) =>
                      handleSubFilterChange("showJamming", e.target.checked)
                    }
                  />
                  <div
                    className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showJamming ? "bg-rose-400/80" : "bg-white/10"}`}
                  >
                    <div
                      className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showJamming ? "left-2.5" : "left-0.5"}`}
                    />
                  </div>
                </label>

                <label
                  className={`group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showHoldingPatterns !== false ? "border-amber-500/50 bg-amber-500/10 shadow-[0_0_8px_rgba(245,158,11,0.2)]" : "border-white/5 bg-white/5"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <RefreshCw
                      size={10}
                      className={
                        filters.showHoldingPatterns !== false ? "text-amber-400" : "text-white/20"
                      }
                    />
                    <span
                      className={`text-[9px] font-bold tracking-wide ${filters.showHoldingPatterns !== false ? "text-amber-400/80" : "text-white/30"}`}
                    >
                      HOLDING PATTERNS
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={filters.showHoldingPatterns !== false}
                    onChange={(e) =>
                      handleSubFilterChange("showHoldingPatterns", e.target.checked)
                    }
                  />
                  <div
                    className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showHoldingPatterns !== false ? "bg-amber-400/80" : "bg-white/10"}`}
                  >
                    <div
                      className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showHoldingPatterns !== false ? "left-2.5" : "left-0.5"}`}
                    />
                  </div>
                </label>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

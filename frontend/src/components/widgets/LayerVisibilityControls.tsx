import {
  AlertCircle,
  AlertTriangle,
  Anchor,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CloudRain,
  GitBranch,
  Globe,
  Layers,
  Network,
  Radio,
  RefreshCw,
  Server,
  Sparkles,
  TowerControl,
  Waves,
  WifiOff,
  Flame,
  Ghost,
} from "lucide-react";
import React, { useState, useEffect } from "react";
import { MapFilters } from "../../types";
import { getFilterPref, saveFilterPref } from "../../utils/filterPreferences";

interface LayerVisibilityControlsProps {
  filters?: MapFilters;
  onFilterChange?: (key: string, value: boolean | number | string[]) => void;
  radiorefEnabled?: boolean;
}

export const LayerVisibilityControls: React.FC<
  LayerVisibilityControlsProps
> = ({ filters, onFilterChange, radiorefEnabled }) => {
  const preventMouseFocusScroll = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("label") || target.closest("button")) {
      event.preventDefault();
    }
  };

  const suppressHiddenInputFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.classList.contains("sr-only")) {
      target.blur();
    }
  };

  // Persistent expansion states (Map Layers panel)
  const [showLayers, setShowLayers] = useState(() => {
    return localStorage.getItem("ui_layers_expanded") === "true";
  });
  const [infraExpanded, setInfraExpanded] = useState(() => {
    return localStorage.getItem("ui_infra_expanded") === "true";
  });
  const [rfExpanded, setRfExpanded] = useState(() => {
    return localStorage.getItem("ui_rf_expanded") === "true";
  });
  const [environmentalExpanded, setEnvironmentalExpanded] = useState(() => {
    return localStorage.getItem("ui_enviro_expanded") === "true";
  });
  const [analysisExpanded, setAnalysisExpanded] = useState(() => {
    return localStorage.getItem("ui_analysis_expanded") === "true";
  });
  const [hazardsExpanded, setHazardsExpanded] = useState(() => {
    return localStorage.getItem("ui_hazards_expanded") === "true";
  });

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem("ui_layers_expanded", String(showLayers));
  }, [showLayers]);
  useEffect(() => {
    localStorage.setItem("ui_infra_expanded", String(infraExpanded));
  }, [infraExpanded]);
  useEffect(() => {
    localStorage.setItem("ui_rf_expanded", String(rfExpanded));
  }, [rfExpanded]);
  useEffect(() => {
    localStorage.setItem("ui_enviro_expanded", String(environmentalExpanded));
  }, [environmentalExpanded]);
  useEffect(() => {
    localStorage.setItem("ui_analysis_expanded", String(analysisExpanded));
  }, [analysisExpanded]);
  useEffect(() => {
    localStorage.setItem("ui_hazards_expanded", String(hazardsExpanded));
  }, [hazardsExpanded]);

  const handleSubFilterChange = (key: string, value: boolean | string[]) => {
    if (onFilterChange) {
      onFilterChange(key, value as boolean);
      if (typeof value === "boolean") saveFilterPref(key, value);
    }
  };

  const infraIsOn =
    !!filters &&
    (filters.showCables !== false ||
      filters.showLandingStations !== false ||
      filters.showOutages === true ||
      filters.showTowers === true ||
      filters.showIXPs === true ||
      filters.showFacilities === true ||
      filters.showISS === true ||
      filters.showDnsRoot === true);

  const environmentalIsOn = !!(
    filters?.showAurora ||
    filters?.showBuoys ||
    filters?.showNWSAlerts ||
    filters?.showFIRMS ||
    filters?.showDarkVessels
  );

  const analysisIsOn = !!(filters?.showH3Risk || filters?.showClusters || filters?.showClausalChains);

  const hazardsIsOn =
    !!filters &&
    (!!filters.showJamming ||
      filters.showHoldingPatterns !== false ||
      !!filters.showAirspaceZones);

  const toggleInfra = () => {
    if (!onFilterChange || !filters) return;
    if (infraIsOn) {
      onFilterChange("showCables", false);
      onFilterChange("showLandingStations", false);
      onFilterChange("showOutages", false);
      onFilterChange("showTowers", false);
      onFilterChange("showIXPs", false);
      onFilterChange("showFacilities", false);
      onFilterChange("showISS", false);
      onFilterChange("showDnsRoot", false);
    } else {
      onFilterChange("showCables", getFilterPref("showCables", true));
      onFilterChange("showOutages", getFilterPref("showOutages", true));
      onFilterChange("showTowers", getFilterPref("showTowers", false));
      onFilterChange(
        "showLandingStations",
        getFilterPref("showLandingStations", false),
      );
      onFilterChange("showIXPs", getFilterPref("showIXPs", false));
      onFilterChange("showFacilities", getFilterPref("showFacilities", false));
      onFilterChange("showISS", getFilterPref("showISS", true));
      onFilterChange("showDnsRoot", getFilterPref("showDnsRoot", false));
    }
  };

  const toggleEnvironmental = () => {
    if (!onFilterChange || !filters) return;
    if (environmentalIsOn) {
      onFilterChange("showAurora", false);
      onFilterChange("showBuoys", false);
      onFilterChange("showNWSAlerts", false);
      onFilterChange("showFIRMS", false);
      onFilterChange("showDarkVessels", false);
    } else {
      onFilterChange("showAurora", getFilterPref("showAurora", true));
      onFilterChange("showBuoys", getFilterPref("showBuoys", true));
      onFilterChange("showNWSAlerts", getFilterPref("showNWSAlerts", true));
      onFilterChange("showFIRMS", getFilterPref("showFIRMS", true));
      onFilterChange("showDarkVessels", getFilterPref("showDarkVessels", true));
    }
  };

  const toggleHazards = () => {
    if (!onFilterChange || !filters) return;
    if (hazardsIsOn) {
      onFilterChange("showJamming", false);
      onFilterChange("showHoldingPatterns", false);
      onFilterChange("showAirspaceZones", false);
    } else {
      onFilterChange("showJamming", getFilterPref("showJamming", true));
      onFilterChange(
        "showHoldingPatterns",
        getFilterPref("showHoldingPatterns", true),
      );
      onFilterChange("showAirspaceZones", getFilterPref("showAirspaceZones", false));
    }
  };

  const toggleAnalysis = () => {
    if (!onFilterChange || !filters) return;
    if (analysisIsOn) {
      onFilterChange("showH3Risk", false);
      onFilterChange("showClusters", false);
      onFilterChange("showClausalChains", false);
    } else {
      onFilterChange("showH3Risk", getFilterPref("showH3Risk", false));
      onFilterChange("showClusters", getFilterPref("showClusters", true));
      onFilterChange("showClausalChains", getFilterPref("showClausalChains", false));
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
          title={showLayers ? "Collapse Map Layers" : "Expand Map Layers"}
          aria-label={showLayers ? "Collapse Map Layers" : "Expand Map Layers"}
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
                title={filters.showRepeaters ? "Hide Amateur Radio Repeaters" : "Show Amateur Radio Repeaters"}
                aria-label={filters.showRepeaters ? "Hide Amateur Radio Repeaters" : "Show Amateur Radio Repeaters"}
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
                title={infraIsOn ? "Hide Global Network" : "Show Global Network"}
                aria-label={infraIsOn ? "Hide Global Network" : "Show Global Network"}
                aria-pressed={infraIsOn}
              >
                <Network size={12} aria-hidden="true" />
              </button>
              <button
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  toggleEnvironmental();
                }}
                className={`p-1 rounded transition-all active:scale-95 focus-visible:ring-1 focus-visible:ring-purple-400 outline-none ${
                  environmentalIsOn
                    ? "bg-purple-400/10 text-purple-400 border border-purple-400/30"
                    : "text-white/30 hover:text-white/70 hover:bg-white/5 border border-transparent"
                }`}
                title={environmentalIsOn ? "Hide Environmental Layers" : "Show Environmental Layers"}
                aria-label={environmentalIsOn ? "Hide Environmental Layers" : "Show Environmental Layers"}
                aria-pressed={environmentalIsOn}
              >
                <Sparkles size={12} aria-hidden="true" />
              </button>
              <button
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  toggleAnalysis();
                }}
                className={`p-1 rounded transition-all active:scale-95 focus-visible:ring-1 focus-visible:ring-red-400 outline-none ${
                  analysisIsOn
                    ? "bg-red-500/10 text-red-400 border border-red-500/30"
                    : "text-white/30 hover:text-white/70 hover:bg-white/5 border border-transparent"
                }`}
                title={analysisIsOn ? "Hide Risk Grid" : "Show Risk Grid"}
                aria-label={analysisIsOn ? "Hide Risk Grid" : "Show Risk Grid"}
                aria-pressed={analysisIsOn}
              >
                <AlertCircle size={12} aria-hidden="true" />
              </button>
              <button
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  toggleHazards();
                }}
                className={`p-1 rounded transition-all active:scale-95 focus-visible:ring-1 focus-visible:ring-amber-400 outline-none ${
                  hazardsIsOn
                    ? "bg-amber-400/10 text-amber-400 border border-amber-400/30"
                    : "text-white/30 hover:text-white/70 hover:bg-white/5 border border-transparent"
                }`}
                title={hazardsIsOn ? "Hide Hazards Layers" : "Show Hazards Layers"}
                aria-label={hazardsIsOn ? "Hide Hazards Layers" : "Show Hazards Layers"}
                aria-pressed={hazardsIsOn}
              >
                <AlertTriangle size={12} aria-hidden="true" />
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
        <div
          className="max-h-[26vh] space-y-2 overflow-y-auto border-b border-white/10 bg-black/60 p-2"
          onMouseDownCapture={preventMouseFocusScroll}
          onFocusCapture={suppressHiddenInputFocus}
        >
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
                title={rfExpanded ? "Collapse RF Infrastructure" : "Expand RF Infrastructure"}
                aria-label={rfExpanded ? "Collapse RF Infrastructure" : "Expand RF Infrastructure"}
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
                title={filters.showRepeaters ? "Hide RF Infrastructure" : "Show RF Infrastructure"}
                aria-label={filters.showRepeaters ? "Hide RF Infrastructure" : "Show RF Infrastructure"}
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
                title={infraExpanded ? "Collapse Global Network" : "Expand Global Network"}
                aria-label={infraExpanded ? "Collapse Global Network" : "Expand Global Network"}
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
                title={infraIsOn ? "Hide Global Network" : "Show Global Network"}
                aria-label={infraIsOn ? "Hide Global Network" : "Show Global Network"}
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

                {/* Cable Opacity Slider */}
                {filters.showCables !== false && (
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
                )}

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
                    onChange={(e) => {
                      e.stopPropagation();
                      handleSubFilterChange("showOutages", e.target.checked);
                    }}
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

                {/* Internet Exchanges (IXPs) */}
                <label
                  className={`group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showIXPs ? "border-cyan-400/50 bg-cyan-400/10 shadow-[0_0_8px_rgba(34,211,238,0.2)]" : "border-white/5 bg-white/5"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <Network
                      size={10}
                      className={filters.showIXPs ? "text-cyan-400" : "text-white/20"}
                    />
                    <span
                      className={`text-[9px] font-bold tracking-wide ${filters.showIXPs ? "text-cyan-400/80" : "text-white/30"}`}
                    >
                      INTERNET EXCHANGES
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={!!filters.showIXPs}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleSubFilterChange("showIXPs", e.target.checked);
                    }}
                  />
                  <div
                    className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showIXPs ? "bg-cyan-400/80" : "bg-white/10"}`}
                  >
                    <div
                      className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showIXPs ? "left-2.5" : "left-0.5"}`}
                    />
                  </div>
                </label>

                {/* Data Centers / Facilities */}
                <label
                  className={`group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showFacilities ? "border-purple-500/50 bg-purple-500/10 shadow-[0_0_8px_rgba(168,85,247,0.2)]" : "border-white/5 bg-white/5"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <Layers
                      size={10}
                      className={filters.showFacilities ? "text-purple-400" : "text-white/20"}
                    />
                    <span
                      className={`text-[9px] font-bold tracking-wide ${filters.showFacilities ? "text-purple-400/80" : "text-white/30"}`}
                    >
                      DATA CENTERS
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={!!filters.showFacilities}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleSubFilterChange("showFacilities", e.target.checked);
                    }}
                  />
                  <div
                    className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showFacilities ? "bg-purple-400/80" : "bg-white/10"}`}
                  >
                    <div
                      className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showFacilities ? "left-2.5" : "left-0.5"}`}
                    />
                  </div>
                </label>

                {/* ISS Tracker */}
                <label
                  className={`group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showISS !== false ? "border-yellow-400/50 bg-yellow-400/10 shadow-[0_0_8px_rgba(250,204,21,0.2)]" : "border-white/5 bg-white/5"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <Anchor
                      size={10}
                      className={filters.showISS !== false ? "text-yellow-400" : "text-white/20"}
                    />
                    <span
                      className={`text-[9px] font-bold tracking-wide ${filters.showISS !== false ? "text-yellow-400/80" : "text-white/30"}`}
                    >
                      ISS TRACKER
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={filters.showISS !== false}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleSubFilterChange("showISS", e.target.checked);
                    }}
                  />
                  <div
                    className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showISS !== false ? "bg-yellow-400/80" : "bg-white/10"}`}
                  >
                    <div
                      className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showISS !== false ? "left-2.5" : "left-0.5"}`}
                    />
                  </div>
                </label>

                {/* DNS Root Servers */}
                <label
                  className={`group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showDnsRoot ? "border-green-400/50 bg-green-400/10 shadow-[0_0_8px_rgba(74,222,128,0.2)]" : "border-white/5 bg-white/5"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <Server
                      size={10}
                      className={filters.showDnsRoot ? "text-green-400" : "text-white/20"}
                    />
                    <span
                      className={`text-[9px] font-bold tracking-wide ${filters.showDnsRoot ? "text-green-400/80" : "text-white/30"}`}
                    >
                      DNS ROOT SERVERS
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={!!filters.showDnsRoot}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleSubFilterChange("showDnsRoot", e.target.checked);
                    }}
                  />
                  <div
                    className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showDnsRoot ? "bg-green-400/80" : "bg-white/10"}`}
                  >
                    <div
                      className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showDnsRoot ? "left-2.5" : "left-0.5"}`}
                    />
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* Environmental */}
          <div className="flex flex-col gap-1">
            <div
              className={`group flex items-center justify-between rounded border transition-all ${environmentalIsOn ? "border-purple-400/30 bg-purple-400/10 shadow-[0_0_8px_rgba(168,85,247,0.2)]" : "border-white/5 bg-white/5 hover:bg-white/10"}`}
            >
              <button
                className="flex flex-1 items-center justify-between p-2 cursor-pointer text-left focus-visible:ring-1 focus-visible:ring-hud-green outline-none w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  setEnvironmentalExpanded(!environmentalExpanded);
                }}
                aria-expanded={environmentalExpanded}
                title={environmentalExpanded ? "Collapse Environmental" : "Expand Environmental"}
                aria-label={environmentalExpanded ? "Collapse Environmental" : "Expand Environmental"}
              >
                <div className="flex items-center gap-3">
                  <Sparkles
                    size={14}
                    className={
                      environmentalIsOn ? "text-purple-400" : "text-white/20"
                    }
                    aria-hidden="true"
                  />
                  <div className="flex flex-col">
                    <span className="text-mono-sm font-bold tracking-wider uppercase text-white/90">
                      Environmental
                    </span>
                  </div>
                </div>
                <div
                  className="w-4 flex justify-center transition-transform duration-200 shrink-0"
                  style={{
                    transform: environmentalExpanded ? "rotate(90deg)" : "none",
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
                  toggleEnvironmental();
                }}
                title={environmentalIsOn ? "Hide Environmental Layers" : "Show Environmental Layers"}
                aria-label={environmentalIsOn ? "Hide Environmental Layers" : "Show Environmental Layers"}
                aria-pressed={environmentalIsOn}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={environmentalIsOn}
                  onChange={() => toggleEnvironmental()}
                  tabIndex={-1}
                />
                <div
                  className={`h-3 w-6 cursor-pointer rounded-full transition-colors relative ${environmentalIsOn ? "bg-purple-400" : "bg-white/10 hover:bg-white/20"}`}
                >
                  <div
                    className={`absolute top-0.5 h-2 w-2 rounded-full bg-black transition-all ${environmentalIsOn ? "left-3.5" : "left-0.5"}`}
                  />
                </div>
              </button>
            </div>

            {environmentalExpanded && (
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
                      handleSubFilterChange("showAurora", e.target.checked)
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

                {/* Ocean Buoys */}
                <label
                  className={`group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showBuoys ? "border-blue-500/50 bg-blue-500/10 shadow-[0_0_8px_rgba(59,130,246,0.2)]" : "border-white/5 bg-white/5"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <Waves
                      size={10}
                      className={
                        filters.showBuoys ? "text-blue-400" : "text-white/20"
                      }
                    />
                    <span
                      className={`text-[9px] font-bold tracking-wide ${filters.showBuoys ? "text-blue-400/80" : "text-blue-400/30"}`}
                    >
                      OCEAN BUOYS
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={!!filters.showBuoys}
                    onChange={(e) =>
                      handleSubFilterChange("showBuoys", e.target.checked)
                    }
                  />
                  <div
                    className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showBuoys ? "bg-blue-400/80" : "bg-white/10"}`}
                  >
                    <div
                      className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showBuoys ? "left-2.5" : "left-0.5"}`}
                    />
                  </div>
                </label>

                {/* NWS Alerts */}
                <label
                  className={`group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showNWSAlerts ? "border-amber-500/50 bg-amber-500/10 shadow-[0_0_8px_rgba(245,158,11,0.2)]" : "border-white/5 bg-white/5"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <CloudRain
                      size={10}
                      className={
                        filters.showNWSAlerts
                          ? "text-amber-400"
                          : "text-white/20"
                      }
                    />
                    <span
                      className={`text-[9px] font-bold tracking-wide ${filters.showNWSAlerts ? "text-amber-400/80" : "text-amber-400/30"}`}
                    >
                      NWS ALERTS
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={!!filters.showNWSAlerts}
                    onChange={(e) =>
                      handleSubFilterChange("showNWSAlerts", e.target.checked)
                    }
                  />
                  <div
                    className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showNWSAlerts ? "bg-amber-400/80" : "bg-white/10"}`}
                  >
                    <div
                      className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showNWSAlerts ? "left-2.5" : "left-0.5"}`}
                    />
                  </div>
                </label>

                {/* NASA FIRMS (Thermal) */}
                <div
                  className={`group flex items-center rounded border p-1 transition-all ${filters.showFIRMS ? "border-orange-500/50 bg-orange-500/10 shadow-[0_0_8px_rgba(249,115,22,0.2)]" : "border-white/5 bg-white/5"}`}
                >
                  <label className="flex flex-1 cursor-pointer items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <Flame
                        size={10}
                        className={
                          filters.showFIRMS ? "text-orange-500" : "text-white/20"
                        }
                      />
                      <span
                        className={`text-[9px] font-bold tracking-wide ${filters.showFIRMS ? "text-orange-500/80" : "text-orange-500/30"}`}
                      >
                        NASA FIRMS (THERMAL)
                      </span>
                    </div>
                  </label>

                  {/* GLOBAL coverage chip */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (filters.showFIRMS) {
                        handleSubFilterChange("firmsGlobal", !filters.firmsGlobal);
                      }
                    }}
                    title={
                      filters.showFIRMS
                        ? filters.firmsGlobal
                          ? "Switch to mission-area FIRMS"
                          : "Switch to global FIRMS coverage"
                        : "Enable FIRMS layer first"
                    }
                    className={`ml-1.5 shrink-0 rounded px-1 py-0.5 text-[8px] font-bold tracking-widest transition-all border ${
                      filters.firmsGlobal && filters.showFIRMS
                        ? "border-orange-400/50 bg-orange-500/30 text-orange-300"
                        : "border-white/10 bg-white/5 text-white/20"
                    } ${!filters.showFIRMS ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-orange-500/20 hover:text-orange-400/60"}`}
                  >
                    GLOBAL
                  </button>

                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={!!filters.showFIRMS}
                    onChange={(e) =>
                      handleSubFilterChange("showFIRMS", e.target.checked)
                    }
                  />
                  <div
                    className={`ml-1.5 h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showFIRMS ? "bg-orange-500/80" : "bg-white/10"}`}
                  >
                    <div
                      className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showFIRMS ? "left-2.5" : "left-0.5"}`}
                    />
                  </div>
                </div>

                {/* Dark Vessel Detection */}
                <label
                  className={`group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showDarkVessels ? "border-red-500/50 bg-red-500/10 shadow-[0_0_8px_rgba(239,68,68,0.2)]" : "border-white/5 bg-white/5"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <Ghost
                      size={10}
                      className={
                        filters.showDarkVessels
                          ? "text-red-400"
                          : "text-white/20"
                      }
                    />
                    <span
                      className={`text-[9px] font-bold tracking-wide ${filters.showDarkVessels ? "text-red-400/80" : "text-red-400/30"}`}
                    >
                      DARK VESSELS (AIS-GAP)
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={!!filters.showDarkVessels}
                    onChange={(e) =>
                      handleSubFilterChange("showDarkVessels", e.target.checked)
                    }
                  />
                  <div
                    className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showDarkVessels ? "bg-red-400/80" : "bg-white/10"}`}
                  >
                    <div
                      className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showDarkVessels ? "left-2.5" : "left-0.5"}`}
                    />
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* Analysis */}
          <div className="flex flex-col gap-1">
            <div
              className={`group flex items-center justify-between rounded border transition-all ${analysisIsOn ? "border-red-500/30 bg-red-500/10 shadow-[0_0_8px_rgba(239,68,68,0.2)]" : "border-white/5 bg-white/5 hover:bg-white/10"}`}
            >
              <button
                className="flex flex-1 items-center justify-between p-2 cursor-pointer text-left focus-visible:ring-1 focus-visible:ring-hud-green outline-none w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  setAnalysisExpanded(!analysisExpanded);
                }}
                aria-expanded={analysisExpanded}
                title={analysisExpanded ? "Collapse Analysis" : "Expand Analysis"}
                aria-label={analysisExpanded ? "Collapse Analysis" : "Expand Analysis"}
              >
                <div className="flex items-center gap-3">
                  <AlertCircle
                    size={14}
                    className={analysisIsOn ? "text-red-400" : "text-white/20"}
                    aria-hidden="true"
                  />
                  <div className="flex flex-col">
                    <span className="text-mono-sm font-bold tracking-wider uppercase text-white/90">
                      Analysis
                    </span>
                  </div>
                </div>
                <div
                  className="w-4 flex justify-center transition-transform duration-200 shrink-0"
                  style={{
                    transform: analysisExpanded ? "rotate(90deg)" : "none",
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
                  toggleAnalysis();
                }}
                title={analysisIsOn ? "Hide Analysis Layers" : "Show Analysis Layers"}
                aria-label={analysisIsOn ? "Hide Analysis Layers" : "Show Analysis Layers"}
                aria-pressed={analysisIsOn}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={analysisIsOn}
                  onChange={() => toggleAnalysis()}
                  tabIndex={-1}
                />
                <div
                  className={`h-3 w-6 cursor-pointer rounded-full transition-colors relative ${analysisIsOn ? "bg-red-500" : "bg-white/10 hover:bg-white/20"}`}
                >
                  <div
                    className={`absolute top-0.5 h-2 w-2 rounded-full bg-black transition-all ${analysisIsOn ? "left-3.5" : "left-0.5"}`}
                  />
                </div>
              </button>
            </div>

            {analysisExpanded && (
              <div className="flex flex-col gap-1 px-0 opacity-90 mt-1">
                <label
                  className={`group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showH3Risk ? "border-red-500/50 bg-red-500/10 shadow-[0_0_8px_rgba(239,68,68,0.2)]" : "border-white/5 bg-white/5"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <AlertCircle
                      size={10}
                      className={
                        filters.showH3Risk ? "text-red-400" : "text-white/20"
                      }
                    />
                    <span
                      className={`text-[9px] font-bold tracking-wide ${filters.showH3Risk ? "text-red-400/80" : "text-white/30"}`}
                    >
                      RISK GRID
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={!!filters.showH3Risk}
                    onChange={(e) =>
                      handleSubFilterChange("showH3Risk", e.target.checked)
                    }
                  />
                  <div
                    className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showH3Risk ? "bg-red-400/80" : "bg-white/10"}`}
                  >
                    <div
                      className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showH3Risk ? "left-2.5" : "left-0.5"}`}
                    />
                  </div>
                </label>

                <label
                  className={`group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showClusters ? "border-cyan-500/50 bg-cyan-500/10 shadow-[0_0_8px_rgba(6,182,212,0.2)]" : "border-white/5 bg-white/5"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <Network
                      size={10}
                      className={
                        filters.showClusters ? "text-cyan-400" : "text-white/20"
                      }
                    />
                    <span
                      className={`text-[9px] font-bold tracking-wide ${filters.showClusters ? "text-cyan-400/80" : "text-white/30"}`}
                    >
                      TRAJECTORY CLUSTERS
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={!!filters.showClusters}
                    onChange={(e) =>
                      handleSubFilterChange("showClusters", e.target.checked)
                    }
                  />
                  <div
                    className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showClusters ? "bg-cyan-400/80" : "bg-white/10"}`}
                  >
                    <div
                      className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showClusters ? "left-2.5" : "left-0.5"}`}
                    />
                  </div>
                </label>
                {filters.showClusters && (
                  <div className="flex w-full gap-1 px-0.5">
                    {([1, 4, 24] as const).map((h) => (
                      <button
                        key={h}
                        className={`flex-1 py-1 text-[9px] font-bold rounded border transition-all ${
                          (filters.clusterLookbackHours ?? 4) === h
                            ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/50 shadow-[0_0_6px_rgba(6,182,212,0.3)]"
                            : "bg-white/5 text-white/30 border-white/10 hover:bg-white/10 hover:text-white/50"
                        }`}
                        onClick={() => onFilterChange("clusterLookbackHours", h)}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                )}

                {/* Clausal Chains narrative layer */}
                <label
                  className={`group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showClausalChains ? "border-indigo-500/50 bg-indigo-500/10 shadow-[0_0_8px_rgba(99,102,241,0.2)]" : "border-white/5 bg-white/5"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <GitBranch
                      size={10}
                      className={filters.showClausalChains ? "text-indigo-400" : "text-white/20"}
                    />
                    <span
                      className={`text-[9px] font-bold tracking-wide ${filters.showClausalChains ? "text-indigo-400/80" : "text-white/30"}`}
                    >
                      CLAUSAL CHAINS
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={!!filters.showClausalChains}
                    onChange={(e) =>
                      handleSubFilterChange("showClausalChains", e.target.checked)
                    }
                  />
                  <div
                    className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showClausalChains ? "bg-indigo-400/80" : "bg-white/10"}`}
                  >
                    <div
                      className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showClausalChains ? "left-2.5" : "left-0.5"}`}
                    />
                  </div>
                </label>
                {filters.showClausalChains && (
                  <div className="flex w-full gap-1 px-0.5">
                    {([1, 6, 24] as const).map((h) => (
                      <button
                        key={h}
                        className={`flex-1 py-1 text-[9px] font-bold rounded border transition-all ${
                          (filters.clausalLookbackHours ?? 6) === h
                            ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/50 shadow-[0_0_6px_rgba(99,102,241,0.3)]"
                            : "bg-white/5 text-white/30 border-white/10 hover:bg-white/10 hover:text-white/50"
                        }`}
                        onClick={() => onFilterChange("clausalLookbackHours", h)}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Hazards */}
          <div className="flex flex-col gap-1">
            <div
              className={`group flex items-center justify-between rounded border transition-all ${hazardsIsOn ? "border-amber-400/30 bg-amber-400/10 shadow-[0_0_8px_rgba(251,191,36,0.2)]" : "border-white/5 bg-white/5 hover:bg-white/10"}`}
            >
              <button
                className="flex flex-1 items-center justify-between p-2 cursor-pointer text-left focus-visible:ring-1 focus-visible:ring-hud-green outline-none w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  setHazardsExpanded(!hazardsExpanded);
                }}
                aria-expanded={hazardsExpanded}
                title={hazardsExpanded ? "Collapse Hazards" : "Expand Hazards"}
                aria-label={hazardsExpanded ? "Collapse Hazards" : "Expand Hazards"}
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle
                    size={14}
                    className={hazardsIsOn ? "text-amber-400" : "text-white/20"}
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
                  style={{
                    transform: hazardsExpanded ? "rotate(90deg)" : "none",
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
                  toggleHazards();
                }}
                title={hazardsIsOn ? "Hide Hazards Layers" : "Show Hazards Layers"}
                aria-label={hazardsIsOn ? "Hide Hazards Layers" : "Show Hazards Layers"}
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
                  className={`h-3 w-6 cursor-pointer rounded-full transition-colors relative ${hazardsIsOn ? "bg-amber-400" : "bg-white/10 hover:bg-white/20"}`}
                >
                  <div
                    className={`absolute top-0.5 h-2 w-2 rounded-full bg-black transition-all ${hazardsIsOn ? "left-3.5" : "left-0.5"}`}
                  />
                </div>
              </button>
            </div>

            {hazardsExpanded && (
              <div className="flex flex-col gap-1 px-0 opacity-90 mt-1">
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
                        filters.showHoldingPatterns !== false
                          ? "text-amber-400"
                          : "text-white/20"
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
                      handleSubFilterChange(
                        "showHoldingPatterns",
                        e.target.checked,
                      )
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

                <label
                  className={`group flex cursor-pointer items-center justify-between rounded border p-1 transition-all ${filters.showAirspaceZones ? "border-orange-500/50 bg-orange-500/10 shadow-[0_0_8px_rgba(249,115,22,0.2)]" : "border-white/5 bg-white/5"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle
                      size={10}
                      className={
                        filters.showAirspaceZones
                          ? "text-orange-400"
                          : "text-white/20"
                      }
                    />
                    <span
                      className={`text-[9px] font-bold tracking-wide ${filters.showAirspaceZones ? "text-orange-400/80" : "text-white/30"}`}
                    >
                      AIRSPACE ZONES
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={!!filters.showAirspaceZones}
                    onChange={(e) =>
                      handleSubFilterChange("showAirspaceZones", e.target.checked)
                    }
                  />
                  <div
                    className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showAirspaceZones ? "bg-orange-400/80" : "bg-white/10"}`}
                  >
                    <div
                      className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showAirspaceZones ? "left-2.5" : "left-0.5"}`}
                    />
                  </div>
                </label>

                {/* ── Airspace zone-type sub-filters ───────────────────────── */}
                {filters.showAirspaceZones && (() => {
                  type ZoneTypeDef = { type: string; tailwindActive: string; tailwindIcon: string; tailwindToggle: string; label: string; icon: React.ReactNode; };
                  const ALL_ZONE_TYPES: ZoneTypeDef[] = [
                    { type: "PROHIBITED", tailwindActive: "border-rose-500/50 bg-rose-500/10 shadow-[0_0_8px_rgba(244,63,94,0.2)]",  tailwindIcon: "text-rose-500",  tailwindToggle: "bg-rose-500/80",  label: "PROHIB",    icon: <AlertTriangle size={10} /> },
                    { type: "RESTRICTED", tailwindActive: "border-orange-500/50 bg-orange-500/10 shadow-[0_0_8px_rgba(249,115,22,0.2)]", tailwindIcon: "text-orange-500", tailwindToggle: "bg-orange-500/80", label: "RESTRI",  icon: <AlertTriangle size={10} /> },
                    { type: "DANGER",     tailwindActive: "border-yellow-500/50 bg-yellow-500/10 shadow-[0_0_8px_rgba(234,179,8,0.2)]",  tailwindIcon: "text-yellow-500", tailwindToggle: "bg-yellow-500/80", label: "DANGER",  icon: <AlertTriangle size={10} /> },
                    { type: "WARNING",    tailwindActive: "border-amber-400/50 bg-amber-400/10 shadow-[0_0_8px_rgba(251,191,36,0.2)]",   tailwindIcon: "text-amber-400",  tailwindToggle: "bg-amber-400/80",  label: "WARN",    icon: <AlertTriangle size={10} /> },
                    { type: "TRA",        tailwindActive: "border-indigo-400/50 bg-indigo-400/10 shadow-[0_0_8px_rgba(129,140,248,0.2)]", tailwindIcon: "text-indigo-400", tailwindToggle: "bg-indigo-400/80", label: "TRA",     icon: <AlertTriangle size={10} /> },
                    { type: "TSA",        tailwindActive: "border-fuchsia-500/50 bg-fuchsia-500/10 shadow-[0_0_8px_rgba(217,70,239,0.2)]",tailwindIcon: "text-fuchsia-500",tailwindToggle: "bg-fuchsia-500/80",label: "TSA",     icon: <AlertTriangle size={10} /> },
                    { type: "ADIZ",       tailwindActive: "border-cyan-500/50 bg-cyan-500/10 shadow-[0_0_8px_rgba(6,182,212,0.2)]",       tailwindIcon: "text-cyan-500",   tailwindToggle: "bg-cyan-500/80",   label: "ADIZ",    icon: <AlertTriangle size={10} /> },
                    { type: "MILITARY",   tailwindActive: "border-slate-400/50 bg-slate-400/10 shadow-[0_0_8px_rgba(148,163,184,0.2)]",   tailwindIcon: "text-slate-400",  tailwindToggle: "bg-slate-400/80",  label: "MIL",     icon: <AlertTriangle size={10} /> },
                    { type: "CTR",        tailwindActive: "border-blue-500/50 bg-blue-500/10 shadow-[0_0_8px_rgba(59,130,246,0.2)]",      tailwindIcon: "text-blue-500",   tailwindToggle: "bg-blue-500/80",   label: "CTR",     icon: <AlertTriangle size={10} /> },
                    { type: "FIR",        tailwindActive: "border-indigo-500/50 bg-indigo-500/10 shadow-[0_0_8px_rgba(99,102,241,0.2)]",  tailwindIcon: "text-indigo-500", tailwindToggle: "bg-indigo-500/80", label: "FIR",     icon: <AlertTriangle size={10} /> },
                    { type: "FIS",        tailwindActive: "border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_8px_rgba(16,185,129,0.2)]",tailwindIcon: "text-emerald-500",tailwindToggle: "bg-emerald-500/80",label: "FIS",     icon: <AlertTriangle size={10} /> },
                    { type: "VFR",        tailwindActive: "border-emerald-400/50 bg-emerald-400/10 shadow-[0_0_8px_rgba(52,211,153,0.2)]",tailwindIcon: "text-emerald-400",tailwindToggle: "bg-emerald-400/80",label: "VFR",     icon: <AlertTriangle size={10} /> },
                  ];
                  const enabledTypes = (filters.airspaceZoneTypes as string[] | undefined) ?? ALL_ZONE_TYPES.map(z => z.type);
                  const toggleType = (type: string) => {
                    const next = enabledTypes.includes(type)
                      ? enabledTypes.filter(t => t !== type)
                      : [...enabledTypes, type];
                    handleSubFilterChange("airspaceZoneTypes", next);
                  };
                  return (
                    <div className="grid grid-cols-2 gap-1.5 mt-1">
                      {ALL_ZONE_TYPES.map(({ type, tailwindActive, tailwindIcon, tailwindToggle, label, icon }) => {
                        const active = enabledTypes.includes(type);
                        return (
                          <label
                            key={type}
                            className={`flex-1 group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${active ? tailwindActive : "border-white/5 bg-white/5"}`}
                          >
                            <div className={`flex items-center gap-1.5 ${tailwindIcon}`}>
                              <span className={active ? "opacity-100" : "opacity-20"}>{icon}</span>
                              <span className={`text-[9px] font-bold tracking-wide ${active ? `${tailwindIcon}/80` : "text-white/30"}`}>{label}</span>
                            </div>
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={active}
                              onChange={() => toggleType(type)}
                            />
                            <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${active ? tailwindToggle : "bg-white/10"}`}>
                              <div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${active ? "left-2.5" : "left-0.5"}`} />
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  );
                })()}

              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

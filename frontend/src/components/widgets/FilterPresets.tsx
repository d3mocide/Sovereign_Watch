import {
  Check,
  Copy,
  Download,
  Globe,
  Layers,
  Plane,
  Save,
  Satellite,
  Ship,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import React, { useState } from "react";

type FilterValue = boolean | string | number | string[];
type Filters = Record<string, FilterValue>;

interface FilterPresetsProps {
  filters: Filters;
  onFilterChange: (key: string, value: FilterValue) => void;
}

const ALL_FILTER_KEYS = [
  "showAir",
  "showHelicopter",
  "showCommercial",
  "showPrivate",
  "showMilitary",
  "showGovernment",
  "showCargo",
  "showTanker",
  "showPassenger",
  "showFishing",
  "showSeaMilitary",
  "showLawEnforcement",
  "showSar",
  "showTug",
  "showPleasure",
  "showHsc",
  "showPilot",
  "showSpecial",
  "showDrone",
  "showSea",
  "showSatellites",
  "showSatGPS",
  "showSatWeather",
  "showSatComms",
  "showSatSurveillance",
  "showSatOther",
  "showConstellation_Starlink",
  "showRepeaters",
  "showHam",
  "showNoaa",
  "showPublicSafety",
  "showCables",
  "showLandingStations",
  "showOutages",
  "showTowers",
  "showAurora",
  "showJamming",
  "showGdelt",
  "showGdeltLabels",
  "showSatNOGS",
  "showH3Coverage",
  "showTerminator",
];

function loadCustomPresets(): Record<string, Record<string, unknown>> {
  try {
    const saved = localStorage.getItem("sovereignCustomPresets");
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

export const FilterPresets: React.FC<FilterPresetsProps> = ({
  filters,
  onFilterChange,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [customPresets, setCustomPresets] =
    useState<Record<string, Record<string, unknown>>>(loadCustomPresets);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const applyPreset = (
    presetType: "air" | "sea" | "orbital" | "map" | "all" | "clear",
  ) => {
    const newFilters: Record<string, boolean> = {};
    ALL_FILTER_KEYS.forEach((k) => {
      newFilters[k] = false;
    });

    if (presetType === "air") {
      newFilters.showAir = true;
      newFilters.showHelicopter = true;
      newFilters.showCommercial = true;
      newFilters.showPrivate = true;
      newFilters.showMilitary = true;
      newFilters.showGovernment = true;
      newFilters.showDrone = true;
    } else if (presetType === "sea") {
      newFilters.showSea = true;
      newFilters.showCargo = true;
      newFilters.showTanker = true;
      newFilters.showPassenger = true;
      newFilters.showFishing = true;
      newFilters.showSeaMilitary = true;
      newFilters.showLawEnforcement = true;
      newFilters.showSar = true;
      newFilters.showTug = true;
      newFilters.showPleasure = true;
      newFilters.showHsc = true;
      newFilters.showPilot = true;
      newFilters.showSpecial = true;
    } else if (presetType === "orbital") {
      newFilters.showSatellites = true;
      newFilters.showSatGPS = true;
      newFilters.showSatWeather = true;
      newFilters.showSatComms = true;
      newFilters.showSatSurveillance = true;
      newFilters.showSatOther = true;
      newFilters.showConstellation_Starlink = true;
      newFilters.showSatNOGS = true;
    } else if (presetType === "map") {
      const orbitalKeys = [
        "showSatellites",
        "showSatGPS",
        "showSatWeather",
        "showSatComms",
        "showSatSurveillance",
        "showSatOther",
        "showConstellation_Starlink",
        "showSatNOGS",
      ];
      ALL_FILTER_KEYS.forEach((k) => {
        if (!orbitalKeys.includes(k)) {
          newFilters[k] = true;
        }
      });
    } else if (presetType === "all") {
      ALL_FILTER_KEYS.forEach((k) => {
        newFilters[k] = true;
      });
    }

    Object.keys(newFilters).forEach((key) => {
      if (filters[key] !== newFilters[key]) {
        onFilterChange(key, newFilters[key]);
      }
    });
  };

  const handleSaveCustomPreset = () => {
    if (!presetName.trim()) return;
    const newPresets = { ...customPresets, [presetName.trim()]: { ...filters } };
    setCustomPresets(newPresets);
    localStorage.setItem("sovereignCustomPresets", JSON.stringify(newPresets));
    setPresetName("");
  };

  const applyCustomPreset = (name: string) => {
    const preset = customPresets[name];
    if (!preset) return;
    Object.keys(preset).forEach((key) => {
      const value = preset[key];
      const isValidValue =
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        (Array.isArray(value) && value.every((v) => typeof v === "string"));
      if (isValidValue && filters[key] !== value) {
        onFilterChange(key, value as FilterValue);
      }
    });
  };

  const deleteCustomPreset = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newPresets = { ...customPresets };
    delete newPresets[name];
    setCustomPresets(newPresets);
    localStorage.setItem("sovereignCustomPresets", JSON.stringify(newPresets));
  };

  const handleExportPresets = () => {
    const dataStr = JSON.stringify(customPresets, null, 2);
    const dataUri =
      "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);
    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", "sovereign-presets.json");
    linkElement.click();
  };

  const handleImportPresets = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target?.result as string);
        if (typeof importedData === "object" && !Array.isArray(importedData)) {
          const newPresets = { ...customPresets, ...importedData };
          setCustomPresets(newPresets);
          localStorage.setItem(
            "sovereignCustomPresets",
            JSON.stringify(newPresets),
          );
        } else {
          alert("Invalid preset file format. Expected a JSON object.");
        }
      } catch (err) {
        console.error("Failed to parse imported JSON", err);
        alert("Failed to parse imported JSON.");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[9px] font-bold text-white/40 tracking-widest px-1 mb-0.5">
        MISSION STATE & PRESETS
      </span>

      {/* Share URL */}
      <button
        onClick={handleCopyUrl}
        className="flex items-center justify-center gap-2 w-full py-1.5 px-3 rounded border border-hud-green/30 bg-hud-green/10 hover:bg-hud-green/20 transition-colors text-hud-green focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
      >
        {copiedUrl ? (
          <>
            <Check size={12} />
            <span className="text-[10px] font-bold tracking-widest">
              COPIED TO CLIPBOARD!
            </span>
          </>
        ) : (
          <>
            <Copy size={12} />
            <span className="text-[10px] font-bold tracking-widest">
              SHARE MISSION URL
            </span>
          </>
        )}
      </button>

      {/* Quick Presets Grid */}
      <div className="grid grid-cols-2 gap-1.5 mt-1">
        <button
          onClick={() => applyPreset("air")}
          className="flex items-center gap-1.5 p-1.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-white/70 hover:text-white focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
        >
          <Plane size={12} className="text-air-accent" />
          <span className="text-[9px] font-bold tracking-wider">AIR ONLY</span>
        </button>
        <button
          onClick={() => applyPreset("sea")}
          className="flex items-center gap-1.5 p-1.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-white/70 hover:text-white focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
        >
          <Ship size={12} className="text-sea-accent" />
          <span className="text-[9px] font-bold tracking-wider">SEA ONLY</span>
        </button>
        <button
          onClick={() => applyPreset("orbital")}
          className="flex items-center gap-1.5 p-1.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-white/70 hover:text-white focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
        >
          <Satellite size={12} className="text-purple-400" />
          <span className="text-[9px] font-bold tracking-wider">
            ORBITAL ONLY
          </span>
        </button>
        <button
          onClick={() => applyPreset("map")}
          className="flex items-center gap-1.5 p-1.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-white/70 hover:text-white focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
        >
          <Layers size={12} className="text-hud-green" />
          <span className="text-[9px] font-bold tracking-wider">
            MAP LAYERS
          </span>
        </button>
        <button
          onClick={() => applyPreset("all")}
          className="flex items-center gap-1.5 p-1.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-white/70 hover:text-white focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
        >
          <Globe size={12} className="text-purple-400" />
          <span className="text-[9px] font-bold tracking-wider">
            ALL INTELLIGENCE
          </span>
        </button>
        <button
          onClick={() => applyPreset("clear")}
          className="flex items-center gap-1.5 p-1.5 rounded border border-alert-red/30 bg-alert-red/10 hover:bg-alert-red/20 transition-colors text-alert-red focus-visible:ring-1 focus-visible:ring-alert-red outline-none"
        >
          <XCircle size={12} />
          <span className="text-[9px] font-bold tracking-wider">CLEAR ALL</span>
        </button>
      </div>

      {/* Custom Presets Section */}
      <div className="flex flex-col gap-1.5 mt-2">
        <span className="text-[9px] font-bold text-white/40 tracking-widest px-1">
          CUSTOM PRESETS
        </span>

        {/* Save Input */}
        <div className="flex gap-1.5">
          <input
            type="text"
            placeholder="PRESET NAME..."
            aria-label="Custom preset name"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveCustomPreset();
            }}
            className="flex-1 bg-black/50 border border-white/10 rounded px-2 py-1 text-[10px] font-mono text-white placeholder-white/20 focus:outline-none focus:border-hud-green/50 focus:ring-1 focus:ring-hud-green/50"
          />
          <button
            onClick={handleSaveCustomPreset}
            disabled={!presetName.trim()}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-hud-green/10 border border-hud-green/30 text-hud-green hover:bg-hud-green/20 disabled:opacity-30 disabled:hover:bg-hud-green/10 transition-colors focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
          >
            <Save size={12} />
            <span className="text-[9px] font-bold tracking-wider">SAVE</span>
          </button>
        </div>

        {/* Custom Presets List */}
        {Object.keys(customPresets).length > 0 && (
          <div className="flex flex-col gap-1 mt-1 max-h-[120px] overflow-y-auto pr-1 custom-scrollbar">
            {Object.entries(customPresets).map(([name]) => (
              <div
                key={name}
                className="flex items-center justify-between rounded border border-white/5 bg-white/5 hover:bg-white/10 group transition-colors"
              >
                <button
                  onClick={() => applyCustomPreset(name)}
                  className="flex-1 text-left px-2 py-1.5 text-[10px] font-bold tracking-widest text-white/70 group-hover:text-white truncate outline-none focus-visible:ring-1 focus-visible:ring-hud-green"
                >
                  {name}
                </button>
                <button
                  onClick={(e) => deleteCustomPreset(name, e)}
                  className="p-1.5 text-alert-red/50 hover:text-alert-red hover:bg-alert-red/10 rounded-r transition-colors outline-none focus-visible:ring-1 focus-visible:ring-alert-red"
                  aria-label={`Delete preset ${name}`}
                  title="Delete Preset"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Export / Import */}
        <div className="flex items-center gap-1.5 mt-1 pt-1.5 border-t border-white/5">
          <button
            onClick={handleExportPresets}
            disabled={Object.keys(customPresets).length === 0}
            className="flex-1 flex items-center justify-center gap-1.5 py-1 rounded border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 transition-colors text-white/70 hover:text-white focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
          >
            <Download size={10} />
            <span className="text-[9px] font-bold tracking-wider">
              EXPORT JSON
            </span>
          </button>
          <label className="flex-1 flex items-center justify-center gap-1.5 py-1 rounded border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-white/70 hover:text-white cursor-pointer focus-within:ring-1 focus-within:ring-hud-green outline-none">
            <Upload size={10} />
            <span className="text-[9px] font-bold tracking-wider">
              IMPORT JSON
            </span>
            <input
              type="file"
              accept=".json"
              className="sr-only"
              onChange={handleImportPresets}
            />
          </label>
        </div>
      </div>
    </div>
  );
};

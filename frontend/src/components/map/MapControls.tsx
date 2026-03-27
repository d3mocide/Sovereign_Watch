/**
 * MapControls — shared bottom-centre HUD for all map views.
 *
 * Renders the control bar that was previously duplicated ~120 lines per file
 * across TacticalMap, OrbitalMap, and IntelGlobe:
 *
 *   [ 2D | 3D | ─── | GLOBE ]  [ DARK | SAT ]   [ − | + ]
 *    (hidden in globe)           (shown in globe)   (zoom)
 *
 * Optional 3D camera controls (bearing/pitch) appear above the main row when
 * `enable3d` is true and `globeMode` is false.
 *
 * All actions are injected as callbacks so the component stays stateless and
 * portable across views that use different zoom mechanisms (mapRef vs setState).
 */

import {
  ChevronDown,
  ChevronUp,
  Globe,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";

/** A single option in the map style picker (shown when in globe mode). */
export interface MapStyleOption {
  key: string;
  label: string;
}

export interface MapControlsProps {
  // ---- Globe toggle --------------------------------------------------------
  globeMode: boolean;
  onToggleGlobe: () => void;

  // ---- 2D / 3D perspective toggle (hidden when in globe mode) --------------
  enable3d: boolean;
  onSet2D: () => void;
  onSet3D: () => void;

  // ---- Style picker (rendered only when in globe mode) ---------------------
  /** Active style key. */
  mapStyleMode: string;
  /** If omitted no style buttons are shown. */
  styleOptions?: MapStyleOption[];
  onSetStyleMode: (mode: string) => void;

  // ---- Zoom ----------------------------------------------------------------
  onZoomIn: () => void;
  onZoomOut: () => void;

  // ---- Optional 3D camera controls (bearing + pitch) ----------------------
  // Only rendered when enable3d=true and globeMode=false.
  onAdjustBearing?: (delta: number) => void;
  onResetNorth?: () => void;
  onAdjustPitch?: (delta: number) => void;

  // ---- Optional Auto-spin --------------------------------------------------
  spin?: boolean;
  onToggleSpin?: () => void;
}

/** Tailwind class sets shared across every mode button. */
const modeBtn = (active: boolean) =>
  `px-3 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-2 focus-visible:ring-1 focus-visible:ring-hud-green outline-none ${
    active
      ? "bg-hud-green/20 text-hud-green shadow-[0_0_8px_rgba(0,255,65,0.3)] border border-hud-green/40"
      : "text-white/40 hover:text-white/80 hover:bg-white/10 border border-transparent"
  }`;

const globeBtn = (active: boolean) =>
  `px-3 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-2 focus-visible:ring-1 focus-visible:ring-indigo-400 outline-none ${
    active
      ? "bg-indigo-500/20 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.4)] border border-indigo-500/50"
      : "text-white/40 hover:text-white/80 hover:bg-white/10 border border-transparent"
  }`;

const styleBtn = (active: boolean) =>
  `px-3 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1 focus-visible:ring-1 focus-visible:ring-indigo-400 outline-none ${
    active
      ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/50"
      : "text-white/40 hover:text-white/80 hover:bg-white/10 border border-transparent"
  }`;

const camBtn =
  "p-1.5 rounded-md bg-transparent border border-white/5 text-white/40 hover:text-white hover:bg-white/5 transition-all active:scale-95 w-8 h-8 flex items-center justify-center focus-visible:ring-1 focus-visible:ring-hud-green outline-none";

const zoomBtn =
  "p-1 text-white/40 hover:text-hud-green hover:bg-white/10 rounded-md transition-all active:scale-95 focus-visible:ring-1 focus-visible:ring-hud-green outline-none";

const panel =
  "flex gap-1 bg-black/40 backdrop-blur-md p-1 rounded-lg border border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-bottom-2 duration-300";

const divider = <div className="w-[1px] h-4 bg-white/10 my-auto mx-1" />;

export function MapControls({
  globeMode,
  onToggleGlobe,
  enable3d,
  onSet2D,
  onSet3D,
  mapStyleMode,
  styleOptions,
  onSetStyleMode,
  onZoomIn,
  onZoomOut,
  onAdjustBearing,
  onResetNorth,
  onAdjustPitch,
  spin,
  onToggleSpin,
}: MapControlsProps) {
  const showCameraControls =
    enable3d &&
    !globeMode &&
    onAdjustBearing !== undefined &&
    onResetNorth !== undefined &&
    onAdjustPitch !== undefined;

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-[100] pointer-events-auto">
      {/* Optional 3D camera controls — bearing + pitch */}
      {showCameraControls && (
        <div className="flex flex-row gap-2">
          {/* Bearing */}
          <div className={panel}>
            <button
              onClick={() => onAdjustBearing!(-45)}
              className={camBtn}
              title="Rotate Left"
              aria-label="Rotate Left"
            >
              <RotateCcw size={16} />
            </button>
            <button
              onClick={onResetNorth}
              className={`${camBtn} hover:text-hud-green hover:border-hud-green/30 font-mono font-bold text-sm`}
              title="Reset to North"
              aria-label="Reset to North"
            >
              N
            </button>
            <button
              onClick={() => onAdjustBearing!(45)}
              className={camBtn}
              title="Rotate Right"
              aria-label="Rotate Right"
            >
              <RotateCcw size={16} className="scale-x-[-1]" />
            </button>
          </div>

          {/* Pitch */}
          <div className={panel}>
            <button
              onClick={() => onAdjustPitch!(15)}
              className={camBtn}
              title="Tilt Down"
              aria-label="Tilt Down"
            >
              <ChevronUp size={16} />
            </button>
            <button
              onClick={() => onAdjustPitch!(-15)}
              className={camBtn}
              title="Tilt Up"
              aria-label="Tilt Up"
            >
              <ChevronDown size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Main row: view mode + style + zoom */}
      <div className="flex flex-row items-center gap-4">
        {/* View mode picker */}
        <div className="flex bg-black/40 backdrop-blur-md border border-white/10 rounded-lg p-1 gap-1 h-fit">
          {!globeMode && (
            <>
              <button
                onClick={onSet2D}
                className={modeBtn(!enable3d)}
              >
                2D
              </button>
              <button
                onClick={onSet3D}
                className={modeBtn(enable3d)}
              >
                3D
              </button>
              {divider}
            </>
          )}

          <button
            onClick={onToggleGlobe}
            className={globeBtn(globeMode)}
            title="Toggle Globe View"
          >
            <Globe size={12} className={globeMode ? "animate-pulse" : ""} />
            GLOBE
          </button>

          {/* Optional Spin Switcher */}
          {onToggleSpin && (
            <>
              {divider}
              <button
                onClick={onToggleSpin}
                className={globeBtn(!!spin)}
                title="Toggle Auto-Spin"
              >
                <RotateCcw
                  size={12}
                  className={spin ? "animate-spin-slow" : ""}
                />
              </button>
              {!(globeMode && styleOptions && styleOptions.length > 0) && divider}
            </>
          )}

          {/* Style picker — only shown when in globe mode and options provided */}
          {globeMode && styleOptions && styleOptions.length > 0 && (
            <>
              {divider}
              {styleOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => onSetStyleMode(opt.key)}
                  className={styleBtn(mapStyleMode === opt.key)}
                  title={opt.label}
                >
                  {opt.label}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Zoom */}
        <div className="flex bg-black/40 backdrop-blur-md border border-white/10 rounded-lg p-1 gap-1 h-fit">
          <button
            onClick={onZoomOut}
            className={zoomBtn}
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <Minus size={14} strokeWidth={3} />
          </button>
          <button
            onClick={onZoomIn}
            className={zoomBtn}
            title="Zoom In"
            aria-label="Zoom In"
          >
            <Plus size={14} strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  );
}

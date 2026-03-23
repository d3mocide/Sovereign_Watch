import {
  Crosshair,
  ExternalLink,
  Map as MapIcon,
  Network,
  Newspaper,
  Radio,
  Shield,
  Signal,
  Terminal,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { useMissionLocation } from "../../hooks/useMissionLocation";
import { usePassPredictions } from "../../hooks/usePassPredictions";
import { CoTEntity, HistorySegment } from "../../types";
import { satAzEl } from "../../utils/map/geoUtils";
import { AnalysisWidget } from "../widgets/AnalysisWidget";
import { Compass } from "../widgets/Compass";
import { PayloadInspector } from "../widgets/PayloadInspector";

import { PolarPlotWidget } from "../widgets/PolarPlotWidget";
import { TrackHistoryPanel } from "../widgets/TrackHistoryPanel";
import { TimeTracked } from "./TimeTracked";

import { NAV_STATUS_MAP, SHIP_TYPE_MAP } from "../../constants/maritime";

// ---------------------------------------------------------------------------
// Satellite-specific inspector section (hooks isolated here to avoid
// violating Rules of Hooks in the main component's conditional branches)
// ---------------------------------------------------------------------------

function SatelliteSpectrumVerification({
  noradIdStr,
  fetchSatnogsVerification,
}: {
  noradIdStr: string;
  fetchSatnogsVerification?: (noradId: string) => Promise<any>;
}) {
  const [verificationData, setVerificationData] = useState<any>(null);

  useEffect(() => {
    if (noradIdStr && fetchSatnogsVerification) {
      fetchSatnogsVerification(noradIdStr)
        .then((data) => setVerificationData(data))
        .catch((err) =>
          console.error("Error fetching SatNOGS verification:", err),
        );
    }
  }, [noradIdStr, fetchSatnogsVerification]);

  if (!verificationData) return null;

  return (
    <section className="space-y-1 mb-2">
      <div className="flex items-center gap-2 text-purple-400 pb-1">
        <Radio size={14} className="animate-pulse" />
        <h3 className="text-[10px] font-bold tracking-[.2em]">
          SPECTRUM_VERIFICATION
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
        <div className="bg-purple-900/20 border border-purple-500/20 p-2 rounded">
          <div className="text-white/40 mb-1">STATION_COUNT</div>
          <div className="text-purple-300 font-bold">
            {verificationData.station_count || 0}
          </div>
        </div>
        <div className="bg-purple-900/20 border border-purple-500/20 p-2 rounded">
          <div className="text-white/40 mb-1">LAST_OBS</div>
          <div className="text-purple-300 font-bold">
            {verificationData.last_observation
              ? new Date(verificationData.last_observation).toLocaleTimeString()
              : "---"}
          </div>
        </div>
      </div>
    </section>
  );
}

function SatelliteInspectorSection({
  entity,
  onPassData,
}: {
  entity: CoTEntity;
  onPassData?: (
    pass: any,
    nextPassAos?: string,
    nextPassMaxEl?: number,
    satelliteName?: string,
    nextPassDuration?: number,
  ) => void;
}) {
  const { lat: obsLat, lon: obsLon } = useMissionLocation();
  const [now, setNow] = useState(() => Date.now());

  // Prefer detail.norad_id; fall back to parsing from uid string e.g. "SAT-40044"
  const noradIdStr = entity.detail?.norad_id
    ? String(entity.detail.norad_id)
    : (entity.uid?.replace?.(/^SAT-/i, "") ?? "");

  const { passes } = usePassPredictions(obsLat, obsLon, {
    noradIds: noradIdStr ? [noradIdStr] : [],
    hours: 6,
    skip: !noradIdStr,
  });

  // Live az/el and countdown tick
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Live az/el from current entity position
  const altKm = (entity.altitude || 0) / 1000;
  const { az, el, rangeKm } =
    altKm > 0
      ? satAzEl(obsLat, obsLon, entity.lat, entity.lon, altKm)
      : { az: 0, el: -90, rangeKm: 0 };

  // Next upcoming pass
  const nextPass = passes.find((p) => Date.parse(p.los) > now);

  const inclination =
    entity.detail?.inclinationDeg != null
      ? Number(entity.detail.inclinationDeg).toFixed(2) + "°"
      : "---";
  const eccentricity =
    entity.detail?.eccentricity != null
      ? Number(entity.detail.eccentricity).toFixed(5)
      : "---";

  // Build polar pass shape from next pass points
  const polarPass =
    nextPass && nextPass.points?.length > 0
      ? {
          points: nextPass.points.map((pt, i) => ({
            azimuth: pt.az,
            elevation: pt.el,
            time: pt.t,
            isAos: i === 0,
            isTca: pt.t === nextPass.tca,
            isLos: i === nextPass.points.length - 1,
          })),
        }
      : undefined;

  // Bubble pass data up to OrbitalMap so it can render the floating HUD widget
  useEffect(() => {
    onPassData?.(
      polarPass,
      nextPass?.aos,
      nextPass?.max_elevation,
      entity.callsign,
      nextPass?.duration_seconds,
    );
     
  }, [nextPass?.aos, polarPass != null, entity.callsign]);

  return (
    <section className="space-y-1 pt-2">
      <h3 className="text-[10px] text-white/50 font-bold pb-1">
        Orbital_Parameters
      </h3>

      {/* Inclination / Eccentricity */}
      <div className="grid grid-cols-2 gap-4 text-mono-xs font-medium">
        <div className="flex justify-between border-b border-white/5 pb-1">
          <span className="text-white/30">INC:</span>
          <span className="text-purple-300 tabular-nums">{inclination}</span>
        </div>
        <div className="flex justify-between border-b border-white/5 pb-1">
          <span className="text-white/30">ECC:</span>
          <span className="text-white/70 tabular-nums">{eccentricity}</span>
        </div>
      </div>

      {/* Live Az / El / Range */}
      {altKm > 0 && (
        <div className="grid grid-cols-3 gap-2 text-mono-xs font-medium">
          <div className="flex justify-between border-b border-white/5 pb-1">
            <span className="text-white/30">AZ:</span>
            <span className="text-purple-300 tabular-nums">
              {az.toFixed(1)}°
            </span>
          </div>
          <div className="flex justify-between border-b border-white/5 pb-1">
            <span className="text-white/30">EL:</span>
            <span
              className={`tabular-nums ${el >= 10 ? "text-hud-green" : "text-white/50"}`}
            >
              {el.toFixed(1)}°
            </span>
          </div>
          <div className="flex justify-between border-b border-white/5 pb-1">
            <span className="text-white/30">RNG:</span>
            <span className="text-white/70 tabular-nums">
              {Math.round(rangeKm).toLocaleString()} km
            </span>
          </div>
        </div>
      )}

      {/* ── Polar Pass Geometry ── */}
      <div className="mt-4 pt-4 border-t border-purple-500/20">
        <div className="bg-black/40 border border-purple-500/10 rounded overflow-hidden">
          <PolarPlotWidget pass={polarPass} />
        </div>

        {/* AOS / TCA footer integrated into sidebar flow */}
        {nextPass && (
          <div className="mt-2 flex items-center justify-between px-1 text-[9px] font-mono">
            <div className="flex gap-3">
              <span className="text-white/40 uppercase tracking-widest">
                AOS:
              </span>
              <span className="text-white font-bold">
                {nextPass.aos.split("T")[1].substring(0, 5)}Z
              </span>
            </div>
            <div className="flex gap-3">
              <span className="text-white/40 uppercase tracking-widest">
                MAX:
              </span>
              <span className="text-hud-green font-bold">
                {nextPass.max_elevation.toFixed(0)}°
              </span>
            </div>
            <div className="flex gap-3">
              <span className="text-white/40 uppercase tracking-widest">
                DUR:
              </span>
              <span className="text-white font-bold">
                {Math.round(nextPass.duration_seconds / 60)}m
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

interface InfraProperties {
  entity_type?: string;
  id?: string;
  fcc_id?: string;
  tower_type?: string;
  owner?: string;
  height_m?: string | number;
  elevation_m?: string | number;
  source?: string;
  severity?: string | number;
  region?: string;
  country?: string;
  status?: string;
  rfs?: string;
  length_km?: string | number;
  capacity?: string;
  owners?: string;
  datasource?: string;
  landing_points?: string;
  cables?: string;
}

interface InfraDetail {
  properties?: InfraProperties;
  geometry?: {
    type: string;
  };
}

interface SidebarRightProps {
  entity: CoTEntity | null;
  onClose: () => void;
  onCenterMap?: () => void;
  onOpenAnalystPanel?: () => void;
  onHistoryLoaded?: (segments: HistorySegment[]) => void;
  fetchSatnogsVerification?: (noradId: string) => Promise<any>;
  onPassData?: (
    pass: any,
    nextPassAos?: string,
    nextPassMaxEl?: number,
    satelliteName?: string,
    nextPassDuration?: number,
  ) => void;
}

export const SidebarRight: React.FC<SidebarRightProps> = ({
  entity,
  onClose,
  onCenterMap,
  onOpenAnalystPanel,
  onHistoryLoaded,
  fetchSatnogsVerification,
  onPassData,
}) => {
  const [showInspector, setShowInspector] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [prevUid, setPrevUid] = useState<string | undefined>(entity?.uid);

  if (entity?.uid !== prevUid) {
    setPrevUid(entity?.uid);
    setShowInspector(false);
    setShowHistory(false);
  }

  if (!entity) return null;

  // ── JS8Call radio station ───────────────────────────────────────────────
  if (entity.type === "js8") {
    const snr = entity.detail?.snr as number | undefined;
    const grid = entity.detail?.grid as string | undefined;
    const distKm = entity.detail?.distance_km as number | undefined;
    const bearingDeg = entity.detail?.bearing_deg as number | undefined;
    const freq = entity.detail?.freq as number | undefined;

    function snrClass(v: number | undefined): string {
      if (v == null) return "text-white/40";
      if (v >= -10) return "text-emerald-400";
      if (v >= -18) return "text-yellow-400";
      return "text-red-400";
    }

    return (
      <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
        {/* Header */}
        <div className="p-3 border border-b-0 border-indigo-400/30 bg-gradient-to-br from-indigo-400/20 to-indigo-400/5 backdrop-blur-md rounded-t-sm">
          <div className="flex justify-between items-start">
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Radio size={14} className="text-indigo-400 shrink-0" />
                <span className="text-[10px] font-bold tracking-[.3em] text-white/40">
                  HF_RADIO_CONTACT
                </span>
              </div>
              <h2 className="text-mono-xl font-bold tracking-tighter text-indigo-300 drop-shadow-[0_0_8px_currentColor] mb-2">
                {entity.callsign}
              </h2>
              <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
                <h3 className="text-mono-sm font-bold text-white/90">
                  JS8CALL STATION
                </h3>
                <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">Grid:</span>
                    <span className="text-white/80">{grid || "UNKNOWN"}</span>
                  </div>
                  {freq != null && (
                    <div className="flex gap-2">
                      <span className="text-white/30 w-16">Freq:</span>
                      <span className="text-white/80">
                        {(freq / 1000).toFixed(3)} kHz
                      </span>
                    </div>
                  )}
                </div>
              </section>
            </div>
            <button
              onClick={onClose}
              aria-label="Close details"
              title="Close details"
              className="p-1 text-white/30 hover:text-white transition-colors shrink-0 focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
            >
              x
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onCenterMap?.();
              }}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-hud-green/30 to-hud-green/10 hover:from-hud-green/40 hover:to-hud-green/20 border border-hud-green/50 py-1.5 rounded text-[10px] font-bold tracking-widest text-hud-green transition-all active:scale-[0.98]"
            >
              <Crosshair size={12} />
              CENTER_VIEW
            </button>
          </div>
        </div>

        {/* Signal data body */}
        <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
          <section className="space-y-2">
            <h3 className="text-[10px] text-white/50 font-bold">Signal_Data</h3>
            <div className="space-y-1 text-mono-xs font-medium">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span className="text-white/30">SNR:</span>
                  <span className={`tabular-nums font-bold ${snrClass(snr)}`}>
                    {snr != null ? `${snr > 0 ? "+" : ""}${snr} dB` : "---"}
                  </span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span className="text-white/30">BRG:</span>
                  <span className="text-white tabular-nums">
                    {bearingDeg != null ? `${Math.round(bearingDeg)}°` : "---"}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span className="text-white/30">DIST:</span>
                  <span className="text-white tabular-nums">
                    {distKm != null ? `${distKm} km` : "---"}
                  </span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span className="text-white/30">GRID:</span>
                  <span className="text-white tabular-nums">
                    {grid || "---"}
                  </span>
                </div>
              </div>
            </div>
            <div className="pt-1 flex justify-center opacity-80">
              <Compass
                heading={bearingDeg ?? 0}
                size={180}
                accentColor="indigo-400"
              />
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-3 border border-t-0 border-tactical-border bg-black/40 backdrop-blur-md rounded-b-sm flex flex-col gap-2">
          <div className="flex gap-2 w-full">
            <AnalysisWidget
              accentColor="text-indigo-400"
              onOpenPanel={onOpenAnalystPanel}
            />
          </div>
          {/* Compact Metadata Footer */}
          <div className="flex items-center justify-between text-[8px] font-mono text-white/30 pt-1 border-t border-white/5">
            <span>
              SIG: <span className="text-hud-green/70">JS8CALL_HF</span>
            </span>
            <span>
              <TimeTracked lastSeen={entity.lastSeen} />
            </span>
          </div>
        </div>
      </div>
    );
  }
  // ── end JS8 branch ─────────────────────────────────────────────────────────

  // ── Repeater Infrastructure branch ───────────────────────────────────────────────
  if (entity.type === "repeater") {
    const detail = entity.detail || {};

    // Format frequencies
    const formatFreq = (mhz?: string | number) =>
      mhz ? `${Number(mhz).toFixed(4)} MHz` : "UNKNOWN";
    const offset =
      detail.input_freq && detail.frequency
        ? Number(detail.input_freq) - Number(detail.frequency) > 0
          ? `+${(Number(detail.input_freq) - Number(detail.frequency)).toFixed(2)}`
          : (Number(detail.input_freq) - Number(detail.frequency)).toFixed(2)
        : "SIMPLEX";

    const getHamBand = (freqMhz?: number | string): string => {
      const f = Number(freqMhz);
      if (!f || isNaN(f)) return "UNKNOWN";
      if (f >= 28 && f <= 29.7) return "10m";
      if (f >= 50 && f <= 54) return "6m";
      if (f >= 144 && f <= 148) return "2m";
      if (f >= 219 && f <= 225) return "1.25m";
      if (f >= 420 && f <= 450) return "70cm";
      if (f >= 902 && f <= 928) return "33cm";
      if (f >= 1240 && f <= 1300) return "23cm";
      if (f >= 162.4 && f <= 162.55) return "WX (VHF)";
      if (f >= 462 && f <= 468) return "GMRS (UHF)";
      if (f >= 136 && f <= 174) return "VHF COMMERCIAL";
      if (f >= 380 && f <= 512) return "UHF COMMERCIAL";
      if (f >= 769 && f <= 869) return "700/800 MHz";
      return "OTHER";
    };

    return (
      <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
        {/* Header */}
        <div className="p-3 border border-b-0 border-teal-400/30 bg-gradient-to-br from-teal-400/20 to-teal-400/5 backdrop-blur-md rounded-t-sm">
          <div className="flex justify-between items-start">
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Radio size={14} className="text-teal-400 shrink-0" />
                <span className="text-[10px] font-bold tracking-[.3em] text-white/40">
                  RF_INFRASTRUCTURE
                </span>
                <span className="px-1.5 py-[2px] rounded text-[9px] font-bold border border-white/20 text-white/70 bg-white/5 whitespace-nowrap mt-[-2px]">
                  {getHamBand(detail.frequency as number)}
                </span>
              </div>
              <h2
                className="text-mono-xl font-bold tracking-tighter text-teal-300 drop-shadow-[0_0_8px_currentColor] mb-2 truncate"
                title={entity.callsign}
              >
                {entity.callsign}
              </h2>
              <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
                <h3 className="text-mono-sm font-bold text-white/90 tracking-[0.15em]">
                  {String(detail.use || "REPEATER").toUpperCase()}
                </h3>
                <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">City:</span>
                    <span className="text-white/80">
                      {String(detail.city || "UNKNOWN")}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">State:</span>
                    <span className="text-white/80">
                      {String(detail.state || "UNKNOWN")}
                    </span>
                  </div>
                </div>
              </section>
            </div>
            <button
              onClick={onClose}
              aria-label="Close details"
              title="Close details"
              className="p-1 text-white/30 hover:text-white transition-colors shrink-0 focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
            >
              x
            </button>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onCenterMap?.();
              }}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-hud-green/30 to-hud-green/10 hover:from-hud-green/40 hover:to-hud-green/20 border border-hud-green/50 py-1.5 rounded text-[10px] font-bold tracking-widest text-hud-green transition-all active:scale-[0.98]"
            >
              <Crosshair size={12} />
              CENTER_VIEW
            </button>
          </div>
        </div>

        {/* Signal data body */}
        <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
          <section className="space-y-2">
            <h3 className="text-[10px] text-white/50 font-bold">
              RF_Parameters
            </h3>
            <div className="space-y-1 text-mono-xs font-medium">
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">BAND:</span>
                <span className="text-purple-300 font-bold">
                  {getHamBand(detail.frequency as number)}
                </span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">OUTPUT:</span>
                <span className="text-teal-400 tabular-nums font-bold">
                  {formatFreq(detail.frequency as number)}
                </span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">OFFSET:</span>
                <span className="text-white tabular-nums">{offset} MHz</span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">CTCSS/PL:</span>
                <span className="text-amber-400 tabular-nums">
                  {String(detail.ctcss || "NONE")}
                </span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">MODES:</span>
                <span
                  className="text-purple-400 truncate"
                  title={String(detail.modes || "FM")}
                >
                  {String(detail.modes || "FM").toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">STATUS:</span>
                <span
                  className={`tabular-nums ${String(detail.status).toLowerCase().includes("on-air") ? "text-hud-green" : "text-slate-400"}`}
                >
                  {String(detail.status || "UNKNOWN").toUpperCase()}
                </span>
              </div>
            </div>

            <div className="flex gap-4 text-mono-xs mt-3 pt-2 border-t border-white/5">
              <div className="flex gap-2">
                <span className="text-white/30">LAT:</span>
                <span className="text-white tabular-nums">
                  {entity.lat.toFixed(6)}°
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-white/30">LON:</span>
                <span className="text-white tabular-nums">
                  {entity.lon.toFixed(6)}°
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-3 border border-t-0 border-tactical-border bg-black/40 backdrop-blur-md rounded-b-sm flex flex-col gap-2">
          <div className="flex gap-2 w-full">
            <AnalysisWidget
              accentColor="text-teal-400"
              onOpenPanel={onOpenAnalystPanel}
            />
          </div>
          {/* Compact Metadata Footer */}
          <div className="flex items-center justify-between text-[8px] font-mono text-white/30 pt-1 border-t border-white/5">
            <span>
              SRC: <span className="text-teal-400/70">REPEATERBOOK_API</span>
            </span>
            <span>
              <TimeTracked lastSeen={entity.lastSeen} />
            </span>
          </div>
        </div>
      </div>
    );
  }
  // ── FCC Tower branch ───────────────────────────────────────────────────────
  if (entity.type === "tower") {
    const detail = (entity.detail || {}) as InfraDetail;
    const props = detail.properties || {};

    return (
      <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
        <div className="p-3 border border-b-0 border-orange-400/30 bg-gradient-to-br from-orange-400/20 to-orange-400/5 backdrop-blur-md rounded-t-sm">
          <div className="flex justify-between items-start">
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Radio size={14} className="text-orange-400 shrink-0" />
                <span className="text-[10px] font-bold tracking-[.3em] text-white/40">
                  FCC_INFRASTRUCTURE
                </span>
              </div>
              <h2
                className="text-mono-xl font-bold tracking-tighter text-orange-300 drop-shadow-[0_0_8px_currentColor] mb-2 truncate"
                title={entity.callsign}
              >
                {entity.callsign}
              </h2>
              <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
                <h3 className="text-mono-sm font-bold text-white/90">
                  COMMUNICATIONS TOWER
                </h3>
                <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">FCC ID:</span>
                    <span className="text-white/80">
                      {String(props.fcc_id || "UNKNOWN")}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">Type:</span>
                    <span className="text-white/80 uppercase">
                      {String(props.tower_type || "COMMERCIAL")}
                    </span>
                  </div>
                </div>
              </section>
            </div>
            <button
              onClick={onClose}
              aria-label="Close details"
              title="Close details"
              className="p-1 text-white/30 hover:text-white transition-colors shrink-0 focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
            >
              x
            </button>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onCenterMap?.();
              }}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-orange-400/30 to-orange-400/10 hover:from-orange-400/40 hover:to-orange-400/20 border border-orange-400/50 py-1.5 rounded text-[10px] font-bold tracking-widest text-orange-400 transition-all active:scale-[0.98]"
            >
              <Crosshair size={12} />
              CENTER_VIEW
            </button>
          </div>
        </div>

        <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
          <section className="space-y-2">
            <h3 className="text-[10px] text-white/50 font-bold uppercase tracking-wider">
              Tower_Specs
            </h3>
            <div className="space-y-1 text-mono-xs font-medium">
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">STATUS:</span>
                <span className="text-hud-green tabular-nums font-bold uppercase">
                  {String(props.status || "ACTIVE")}
                </span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">HEIGHT:</span>
                <span className="text-orange-400 tabular-nums font-bold">
                  {props.height_m != null
                    ? `${Number(props.height_m).toLocaleString()} m`
                    : "N/A"}
                </span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">ELEVATION:</span>
                <span className="text-white tabular-nums">
                  {props.elevation_m != null
                    ? `${Number(props.elevation_m).toLocaleString()} m`
                    : "N/A"}
                </span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">OWNER:</span>
                <span
                  className="text-amber-400 truncate"
                  title={String(props.owner || "UNKNOWN")}
                >
                  {String(props.owner || "UNKNOWN")}
                </span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">ID:</span>
                <span className="text-white/50">{props.id || "N/A"}</span>
              </div>
            </div>

            <div className="flex gap-4 text-mono-xs mt-3 pt-2 border-t border-white/5">
              <div className="flex gap-2">
                <span className="text-white/30">LAT:</span>
                <span className="text-white tabular-nums">
                  {entity.lat.toFixed(6)}°
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-white/30">LON:</span>
                <span className="text-white tabular-nums">
                  {entity.lon.toFixed(6)}°
                </span>
              </div>
            </div>
          </section>
        </div>

        <div className="p-3 border border-t-0 border-tactical-border bg-black/40 backdrop-blur-md rounded-b-sm flex flex-col gap-2">
          <div className="flex gap-2 w-full">
            <AnalysisWidget
              accentColor="text-orange-400"
              onOpenPanel={onOpenAnalystPanel}
            />
          </div>
          <div className="flex items-center justify-between text-[8px] font-mono text-white/30 pt-1 border-t border-white/5">
            <span>
              SRC: <span className="text-orange-400/70">FCC_Tower_DB</span>
            </span>
            <span>
              <TimeTracked lastSeen={entity.lastSeen} />
            </span>
          </div>
        </div>
      </div>
    );
  }
  // ── Infrastructure branch (Cables & Stations) ──────────────────────────────────
  if (entity.type === "infra") {
    const detail = (entity.detail || {}) as InfraDetail;
    const props = detail.properties || {};
    const isStation = detail.geometry?.type === "Point";
    const isOutage =
      props.entity_type === "outage" ||
      props.id?.includes("outage") ||
      props.severity !== undefined;
    const severity = Number(props.severity || 0);

    // Color theme based on type and severity
    const accentColor = isOutage
      ? severity > 50
        ? "text-red-400"
        : "text-amber-400"
      : "text-cyan-400";
    const accentBorder = isOutage
      ? severity > 50
        ? "border-red-400/30"
        : "border-amber-400/30"
      : "border-cyan-400/30";
    const accentBg = isOutage
      ? severity > 50
        ? "from-red-400/20 to-red-400/5"
        : "from-amber-400/20 to-amber-400/5"
      : "from-cyan-400/20 to-cyan-400/5";
    const accentGlow = isOutage
      ? severity > 50
        ? "text-red-300 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]"
        : "text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]"
      : "text-cyan-300 drop-shadow-[0_0_8px_currentColor]";

    return (
      <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
        {/* Header */}
        <div
          className={`p-3 border border-b-0 ${accentBorder} bg-gradient-to-br ${accentBg} backdrop-blur-md rounded-t-sm`}
        >
          <div className="flex justify-between items-start">
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {isOutage ? (
                  <Signal size={14} className={accentColor} />
                ) : (
                  <Network size={14} className="text-cyan-400 shrink-0" />
                )}
                <span className="text-[10px] font-bold tracking-[.3em] text-white/40">
                  {isOutage ? "CRITICAL_EVENT" : "UNDERSEA_INFRASTRUCTURE"}
                </span>
              </div>
              <h2
                className={`text-mono-xl font-bold tracking-tighter ${accentGlow} mb-2 truncate`}
                title={entity.callsign}
              >
                {entity.callsign}
              </h2>
              <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
                <h3 className="text-mono-sm font-bold text-white/90">
                  {props.entity_type === "outage" ||
                  props.id?.includes("outage")
                    ? "INTERNET OUTAGE"
                    : isStation
                      ? "LANDING STATION"
                      : "SUBMARINE CABLE"}
                </h3>
                <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">
                      {isOutage
                        ? "Impact:"
                        : isStation
                          ? "Country:"
                          : "Location:"}
                    </span>
                    <span className="text-white/80">
                      {String(
                        props.region ||
                          props.country ||
                          props.status ||
                          "ACTIVE",
                      )}
                    </span>
                  </div>
                  {isOutage && (
                    <div className="flex gap-2">
                      <span className="text-white/30 w-16">Severity:</span>
                      <span className={accentColor}>{severity}%</span>
                    </div>
                  )}
                  {!isStation && props.rfs && !isOutage && (
                    <div className="flex gap-2">
                      <span className="text-white/30 w-16">RFS:</span>
                      <span className="text-white/80">{props.rfs}</span>
                    </div>
                  )}
                </div>
              </section>
            </div>
            <button
              onClick={onClose}
              aria-label="Close details"
              title="Close details"
              className="p-1 text-white/30 hover:text-white transition-colors shrink-0 focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
            >
              x
            </button>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onCenterMap?.();
              }}
              className={`flex-1 flex items-center justify-center gap-2 bg-gradient-to-b ${isOutage ? "from-amber-400/30 to-amber-400/10 border-amber-400/50 text-amber-400" : "from-cyan-400/30 to-cyan-400/10 border-cyan-400/50 text-cyan-400"} hover:brightness-110 py-1.5 rounded text-[10px] font-bold tracking-widest transition-all active:scale-[0.98]`}
            >
              <Crosshair size={12} />
              CENTER_VIEW
            </button>
          </div>
        </div>

        {/* Signal data body */}
        <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
          <section className="space-y-2">
            <h3
              className={`text-[10px] ${isOutage ? "text-amber-400" : "text-white/50"} font-bold uppercase tracking-wider`}
            >
              {isOutage ? "Outage_Report" : "Infrastructure_Specs"}
            </h3>
            <div className="space-y-1 text-mono-xs font-medium">
              {isOutage ? (
                <>
                  <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                    <span className="text-white/30">SEVERITY:</span>
                    <span className={`${accentColor} tabular-nums font-bold`}>
                      {severity}%
                    </span>
                  </div>
                  <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                    <span className="text-white/30">SOURCE:</span>
                    <span className="text-hud-green font-bold uppercase">
                      {props.datasource || "IODA_API"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                    <span className="text-white/30">SCOPE:</span>
                    <span className="text-white">
                      {isStation ? "NATIONAL" : "REGIONAL"}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  {!isStation && (
                    <>
                      <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                        <span className="text-white/30">LENGTH:</span>
                        <span className="text-cyan-400 tabular-nums font-bold">
                          {props.length_km
                            ? `${Number(props.length_km).toLocaleString()} km`
                            : "VARIES"}
                        </span>
                      </div>
                      <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                        <span className="text-white/30">CAPACITY:</span>
                        <span className="text-white tabular-nums">
                          {props.capacity || "TBD"}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                    <span className="text-white/30">OWNERS:</span>
                    <span
                      className="text-amber-400 truncate"
                      title={props.owners || "CONSORTIUM"}
                    >
                      {props.owners || "CONSORTIUM"}
                    </span>
                  </div>
                </>
              )}
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">ID:</span>
                <span className="text-white/50">{props.id || "N/A"}</span>
              </div>
            </div>

            <div className="flex gap-4 text-mono-xs mt-3 pt-2 border-t border-white/5">
              <div className="flex gap-2">
                <span className="text-white/30">LAT:</span>
                <span className="text-white tabular-nums">
                  {entity.lat.toFixed(6)}°
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-white/30">LON:</span>
                <span className="text-white tabular-nums">
                  {entity.lon.toFixed(6)}°
                </span>
              </div>
            </div>
          </section>

          <div className="h-px bg-white/5 w-full my-2" />

          {props.landing_points && (
            <section className="space-y-1">
              <h3 className="text-[10px] text-white/50 font-bold pb-1 text-cyan-400">
                Landing_Points
              </h3>
              <div className="text-[10px] text-white/70 leading-relaxed font-mono bg-white/5 p-2 rounded border border-white/10">
                {props.landing_points}
              </div>
            </section>
          )}

          {props.cables && isStation && (
            <section className="space-y-1">
              <h3 className="text-[10px] text-white/50 font-bold pb-1 text-cyan-400">
                Connected_Cables
              </h3>
              <div className="text-[10px] text-white/70 leading-relaxed font-mono bg-white/5 p-2 rounded border border-white/10">
                {props.cables}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border border-t-0 border-tactical-border bg-black/40 backdrop-blur-md rounded-b-sm flex flex-col gap-2">
          <div className="flex gap-2 w-full">
            <AnalysisWidget
              accentColor={accentColor}
              onOpenPanel={onOpenAnalystPanel}
            />
          </div>
          {/* Compact Metadata Footer */}
          <div className="flex items-center justify-between text-[8px] font-mono text-white/30 pt-1 border-t border-white/5">
            <span>
              SRC: <span className="text-cyan-400/70">INFRA_Poller</span>
            </span>
            <span>
              <TimeTracked lastSeen={entity.lastSeen} />
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── GDELT OSINT Event branch ──────────────────────────────────────────────
  if (entity.type === "gdelt") {
    const detail = entity.detail as any;
    const tone = detail.tone ?? 0;

    // Dynamic theme mapping based on Goldstein scale (Tone)
    const getGdeltTheme = (v: number) => {
      if (v <= -5)
        return {
          status: "CRITICAL",
          base: "red-500",
          text: "text-red-400",
          border: "border-red-400/30",
          bg: "from-red-400/20 to-red-400/5",
          btn: "from-red-400/30 to-red-400/10",
        };
      if (v <= -2)
        return {
          status: "CONFLICT",
          base: "orange-500",
          text: "text-orange-400",
          border: "border-orange-400/30",
          bg: "from-orange-400/20 to-orange-400/5",
          btn: "from-orange-400/30 to-orange-400/10",
        };
      if (v < 0)
        return {
          status: "NEGATIVE",
          base: "yellow-400",
          text: "text-yellow-400",
          border: "border-yellow-400/30",
          bg: "from-yellow-400/20 to-yellow-400/5",
          btn: "from-yellow-400/30 to-yellow-400/10",
        };
      if (v < 2)
        return {
          status: "NEUTRAL",
          base: "lime-400",
          text: "text-lime-400",
          border: "border-lime-400/30",
          bg: "from-lime-400/20 to-lime-400/5",
          btn: "from-lime-400/30 to-lime-400/10",
        };
      return {
        status: "COOPERATIVE",
        base: "emerald-400",
        text: "text-emerald-400",
        border: "border-emerald-400/30",
        bg: "from-emerald-400/20 to-emerald-400/5",
        btn: "from-emerald-400/30 to-emerald-400/10",
      };
    };

    const theme = getGdeltTheme(tone);

    return (
      <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
        {/* Header */}
        <div
          className={`p-3 border border-b-0 ${theme.border} bg-gradient-to-br ${theme.bg} backdrop-blur-md rounded-t-sm`}
        >
          <div className="flex justify-between items-start">
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Newspaper size={14} className={theme.text} />
                <span className="text-[10px] font-bold tracking-[.3em] text-white/40">
                  GLOBAL_EVENT_MONITOR
                </span>
              </div>
              <h2
                className={`text-mono-xl font-bold tracking-tighter ${theme.text} drop-shadow-[0_0_8px_currentColor] mb-2 truncate`}
                title={entity.callsign}
              >
                {entity.callsign}
              </h2>
              <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
                <h3 className="text-mono-sm font-bold text-white/90">
                  NEWS_INTEL_FUSION
                </h3>
                <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">Domain:</span>
                    <span className="text-white/80">
                      {detail.domain || "UNKNOWN"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">Status:</span>
                    <span className={theme.text}>{theme.status}</span>
                  </div>
                </div>
              </section>
            </div>
            <button
              onClick={onClose}
              aria-label="Close details"
              title="Close details"
              className="p-1 text-white/30 hover:text-white transition-colors shrink-0 focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
            >
              x
            </button>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onCenterMap?.();
              }}
              className={`flex-1 flex items-center justify-center gap-2 bg-gradient-to-b ${theme.btn} border border-${theme.base}/50 py-1.5 rounded text-[10px] font-bold tracking-widest ${theme.text} transition-all active:scale-[0.98]`}
            >
              <Crosshair size={12} />
              CENTER_VIEW
            </button>
            <a
              href={detail.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/20 py-1.5 rounded text-[10px] font-bold tracking-widest text-white/70 transition-all active:scale-[0.98]"
            >
              <ExternalLink size={12} />
              VIEW_SOURCE
            </a>
          </div>
        </div>

        {/* Signal data body */}
        <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
          <section className="space-y-2">
            <h3
              className={`text-[10px] ${theme.text} font-bold uppercase tracking-wider`}
            >
              Event_Telemetry
            </h3>
            <div className="space-y-1 text-mono-xs font-medium">
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">TONE (GS):</span>
                <span className={`${theme.text} tabular-nums font-bold`}>
                  {tone.toFixed(1)}
                </span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">LATITUDE:</span>
                <span className="text-white tabular-nums">
                  {entity.lat.toFixed(6)}°
                </span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">LONGITUDE:</span>
                <span className="text-white tabular-nums">
                  {entity.lon.toFixed(6)}°
                </span>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">DOMAIN:</span>
                <span className="text-white/70 truncate" title={detail.domain}>
                  {detail.domain || "N/A"}
                </span>
              </div>
            </div>
          </section>

          <section className="space-y-1">
            <h3 className="text-[10px] text-white/50 font-bold opacity-40">
              INTELLIGENCE_CONTEXT
            </h3>
            <p className="text-[10px] text-white/40 leading-relaxed font-mono italic">
              Record represents a geolocated news event fused via GDELT. The
              Goldstein scale measures the theoretical impact on stability,
              ranging from -10 (Conflict) to +10 (Cooperation).
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="p-3 border border-t-0 border-tactical-border bg-black/40 backdrop-blur-md rounded-b-sm flex flex-col gap-2">
          <div className="flex gap-2 w-full">
            <AnalysisWidget
              accentColor={theme.text}
              onOpenPanel={onOpenAnalystPanel}
            />
          </div>
          {/* Compact Metadata Footer */}
          <div className="flex items-center justify-between text-[8px] font-mono text-white/30 pt-1 border-t border-white/5">
            <span>
              SIG: <span className={theme.text}>GDELT_OSINT_STREAM</span>
            </span>
            <span>
              <TimeTracked lastSeen={entity.lastSeen} />
            </span>
          </div>
        </div>
      </div>
    );
  }

  const isShip = entity.type.includes("S");
  const isSat = entity.type === "a-s-K" || entity.type.indexOf("K") === 4;

  let accentColor = "text-air-accent";
  let accentBase = "air-accent";
  let accentBg = "bg-gradient-to-br from-air-accent/20 to-air-accent/5";
  let accentBorder =
    "border-air-accent/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]";
  let btnGradient =
    "from-air-accent/30 to-air-accent/10 hover:from-air-accent/40 hover:to-air-accent/20";
  let btnBorder = "border-air-accent/50";
  let btnText = "text-air-accent";
  let btnShadow = "shadow-[0_0_15px_rgba(0,255,65,0.1)]";

  if (isSat) {
    accentColor = "text-purple-400";
    accentBase = "purple-400";
    accentBg = "bg-gradient-to-br from-purple-400/20 to-purple-400/5";
    accentBorder =
      "border-purple-400/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]";
    btnGradient =
      "from-purple-400/30 to-purple-400/10 hover:from-purple-400/40 hover:to-purple-400/20";
    btnBorder = "border-purple-400/50";
    btnText = "text-purple-400";
    btnShadow = "shadow-[0_0_15px_rgba(168,85,247,0.1)]";
  } else if (isShip) {
    accentColor = "text-sea-accent";
    accentBase = "sea-accent";
    accentBg = "bg-gradient-to-br from-sea-accent/20 to-sea-accent/5";
    accentBorder =
      "border-sea-accent/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]";
    btnGradient =
      "from-sea-accent/30 to-sea-accent/10 hover:from-sea-accent/40 hover:to-sea-accent/20";
    btnBorder = "border-sea-accent/50";
    btnText = "text-sea-accent";
    btnShadow = "shadow-[0_0_15px_rgba(0,255,255,0.1)]";
  }

  if (showInspector) {
    return (
      <div className="pointer-events-auto h-full animate-in slide-in-from-right duration-500 w-full">
        <PayloadInspector
          entity={entity}
          onClose={() => setShowInspector(false)}
        />
      </div>
    );
  }

  return (
    <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
      {/* 1. Target Identity Header */}
      <div
        className={`p-3 border border-b-0 ${accentBorder} ${accentBg} backdrop-blur-md rounded-t-sm relative`}
      >
        {/* Glass Reflection Shine */}

        <div className="relative z-10 flex justify-between items-start gap-2">
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Shield size={14} className={accentColor} />
              <span className="text-[10px] font-bold tracking-[.3em] text-white/40">
                IDENTIFIED_TARGET
              </span>
              {entity.classification && !isShip && (
                <div className="flex gap-1.5">
                  {entity.classification.affiliation &&
                    // Suppress 'general_aviation' affiliation if platform is helicopter/drone to avoid clutter
                    !(
                      entity.classification.affiliation ===
                        "general_aviation" &&
                      ["helicopter", "drone"].includes(
                        entity.classification.platform || "",
                      )
                    ) && (
                      <span
                        className={`text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wider ${
                          ["military", "government"].includes(
                            entity.classification.affiliation,
                          )
                            ? "bg-[#FF8800]/20 text-[#FF8800] border border-[#FF8800]/30"
                            : "bg-white/10 text-white/60 border border-white/20"
                        }`}
                      >
                        {entity.classification.affiliation.toUpperCase()}
                      </span>
                    )}
                  {["helicopter", "drone"].includes(
                    entity.classification.platform || "",
                  ) && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wider bg-[#FF8800]/20 text-[#FF8800] border border-[#FF8800]/30">
                      {entity.classification.platform!.toUpperCase()}
                    </span>
                  )}
                </div>
              )}
              {isShip && entity.vesselClassification?.category && (
                <span
                  className={`text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wider ${
                    ["sar", "military", "law_enforcement"].includes(
                      entity.vesselClassification.category,
                    )
                      ? "bg-[#FF8800]/20 text-[#FF8800] border border-[#FF8800]/30"
                      : entity.vesselClassification.category === "cargo"
                        ? "bg-green-500/20 text-green-500 border border-green-500/30"
                        : entity.vesselClassification.category === "tanker"
                          ? "bg-red-500/20 text-red-500 border border-red-500/30"
                          : entity.vesselClassification.category === "passenger"
                            ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                            : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  }`}
                >
                  {entity.vesselClassification.category.toUpperCase()}
                </span>
              )}
            </div>
            <h2
              className={`text-mono-xl font-bold tracking-tighter ${accentColor} drop-shadow-[0_0_8px_currentColor] mb-2`}
            >
              {entity.callsign}
            </h2>

            {/* Aircraft Info Box */}
            {/* Vessel Info Box */}
            {/* Satellite Info Box */}
            {isSat && entity.detail ? (
              <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h3 className="text-mono-sm font-bold text-white/90 shrink-0">
                    {String(
                      entity.detail.category || "ORBITAL ASSET",
                    ).toUpperCase()}
                  </h3>
                  <span className="text-[10px] text-white/40 font-mono">
                    #
                    {entity.detail.norad_id
                      ? String(entity.detail.norad_id)
                      : entity.uid?.replace?.(/^SAT-/i, "") || "—"}
                    {entity.detail.inclinationDeg != null && (
                      <>
                        {" "}
                        ·{" "}
                        <span className="text-purple-300/80">
                          {Number(entity.detail.inclinationDeg).toFixed(1)}°
                        </span>
                      </>
                    )}
                    {entity.detail.eccentricity != null && (
                      <>
                        {" "}
                        ·{" "}
                        <span className="text-white/50">
                          e={Number(entity.detail.eccentricity).toFixed(4)}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              </section>
            ) : isShip && entity.vesselClassification ? (
              <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
                <h3 className="text-mono-sm font-bold text-white/90">
                  {SHIP_TYPE_MAP[entity.vesselClassification.shipType || 0] ||
                    "UNKNOWN VESSEL"}
                </h3>
                <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">IMO:</span>
                    <span className="text-white/80">
                      {entity.vesselClassification.imo || "UNKNOWN"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">Flag MID:</span>
                    <span className="text-white/80">
                      {entity.vesselClassification.flagMid || "UNKNOWN"}
                    </span>
                  </div>
                  {entity.vesselClassification.length !== undefined &&
                    entity.vesselClassification.length > 0 && (
                      <div className="flex gap-2">
                        <span className="text-white/30 w-16">Dimensions:</span>
                        <span className="text-white/80">
                          {entity.vesselClassification.length}m Ã—{" "}
                          {entity.vesselClassification.beam}m
                        </span>
                      </div>
                    )}
                </div>
              </section>
            ) : (
              entity.classification && (
                /* Aircraft Info Box */
                <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
                  <h3 className="text-mono-sm font-bold text-white/90">
                    {entity.classification.description ||
                      entity.classification.icaoType ||
                      "UNKNOWN_MODEL"}
                  </h3>
                  <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                    <div className="flex gap-2">
                      <span className="text-white/30 w-16">Operator:</span>
                      <span className="text-white/80">
                        {entity.classification.operator || "UNKNOWN"}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-white/30 w-16">Category:</span>
                      <span className="text-white/80">
                        {entity.classification.category ||
                          entity.classification.sizeClass ||
                          "UNKNOWN"}
                      </span>
                    </div>
                  </div>
                </section>
              )
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close details"
            title="Close details"
            className="p-1 text-white/30 hover:text-white transition-colors focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
          >
            x
          </button>
        </div>

        {/* Global IDs */}
        <div className="flex gap-2 overflow-hidden mb-2">
          <div className="bg-black/40 px-2 py-1 rounded border border-white/10 flex flex-col min-w-0 shadow-inner">
            <span className="text-[8px] text-white/30 uppercase font-bold tracking-tight">
              TYPE_TAG
            </span>
            <span className="text-mono-xs font-bold truncate text-white">
              {entity.type}
            </span>
          </div>
          <div className="bg-black/40 px-2 py-1 rounded border border-white/10 flex flex-col flex-1 shadow-inner">
            <span className="text-[8px] text-white/30 uppercase font-bold tracking-tight">
              REGISTRATION
            </span>
            <span className="text-mono-xs font-bold truncate text-white">
              {isSat
                ? `NORAD ${entity.detail?.norad_id ?? entity.uid?.replace?.(/^SAT-/i, "") ?? "—"}`
                : isShip &&
                    (entity.vesselClassification?.callsign?.trim() ||
                      entity.vesselClassification?.imo)
                  ? entity.vesselClassification?.callsign?.trim() ||
                    `IMO ${entity.vesselClassification?.imo}`
                  : entity.classification?.registration || "N/A"}
            </span>
          </div>
        </div>

        {/* Actions Bar — not applicable for satellites */}
        {!isSat && (
          <div className="flex gap-2">
            <button
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onCenterMap?.();
              }}
              className={`flex-1 flex items-center justify-center gap-2 bg-gradient-to-b ${btnGradient} border ${btnBorder} py-1.5 rounded text-[10px] font-bold tracking-widest ${btnText} transition-all active:scale-[0.98] ${btnShadow}`}
            >
              <Crosshair size={12} />
              CENTER_VIEW
            </button>
            {!isShip && (
              <button
                onClick={() => setShowHistory((h) => !h)}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded text-[10px] font-bold tracking-widest transition-all active:scale-[0.98] ${
                  showHistory
                    ? `bg-gradient-to-b ${btnGradient} border ${btnBorder} ${btnText} ${btnShadow}`
                    : "bg-gradient-to-b from-white/10 to-transparent hover:from-white/20 hover:to-white/5 border border-white/10 text-white/70"
                }`}
              >
                <MapIcon size={12} />
                TRACK_LOG
              </button>
            )}
          </div>
        )}
      </div>

      {/* 2. Main Data Body */}
      <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
        {/* Track History Panel — aircraft only, toggled by TRACK_LOG button */}
        {showHistory && !isSat && !isShip && (
          <>
            <TrackHistoryPanel
              entity={entity}
              onHistoryLoaded={onHistoryLoaded ?? (() => {})}
            />
            <div className="h-px bg-white/5 w-full" />
          </>
        )}

        {isSat && (
          <SatelliteSpectrumVerification
            noradIdStr={
              entity.detail?.norad_id
                ? String(entity.detail.norad_id)
                : (entity.uid?.replace?.(/^SAT-/i, "") ?? "")
            }
            fetchSatnogsVerification={fetchSatnogsVerification}
          />
        )}
        {/* Positional Group */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-hud-green/40 pb-1">
            <h3 className="text-[10px] text-white/50 font-bold">
              Positional_Telemetry
            </h3>
          </div>
          <div className="flex gap-4 text-mono-xs">
            <div className="flex gap-2">
              <span className="text-white/30">LAT:</span>
              <span className="text-white tabular-nums">
                {entity.lat.toFixed(6)}°
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-white/30">LON:</span>
              <span className="text-white tabular-nums">
                {entity.lon.toFixed(6)}°
              </span>
            </div>
          </div>
        </section>

        {/* Kinematics Group */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-hud-green/40 pb-1">
            <h3 className="text-[10px] text-white/50 font-bold">
              Vector_Dynamics
            </h3>
          </div>

          <div className="space-y-1 text-mono-xs font-medium">
            {/* Row 1: Speed / Hdg */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">{isSat ? "VEL:" : "SOG:"}</span>
                <span className={`${accentColor} tabular-nums`}>
                  {isSat
                    ? `${(entity.speed / 1000).toFixed(1)} km/s`
                    : `${(entity.speed * 1.94384).toFixed(1)} kts`}
                </span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">{isSat ? "TRK:" : "COG:"}</span>
                <span className={`${accentColor} tabular-nums`}>
                  {Math.round(entity.course)}°
                </span>
              </div>
            </div>

            {isSat ? (
              <>
                {/* Row 2: Alt / Period */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/30">ALT:</span>
                    <span className="text-white tabular-nums">
                      {entity.altitude > 0
                        ? `${Math.round(entity.altitude / 1000).toLocaleString()} km`
                        : "---"}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/30">PERIOD:</span>
                    <span className="text-white/40 tabular-nums">
                      {entity.detail?.periodMin
                        ? `${Number(entity.detail.periodMin).toFixed(1)}m`
                        : "---"}
                    </span>
                  </div>
                </div>
                {/* Live az/el, orbital params, next pass countdown */}
                <SatelliteInspectorSection
                  entity={entity}
                  onPassData={onPassData}
                />
              </>
            ) : isShip ? (
              <>
                {/* Row 2: Nav Status / Dest */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/30">STAT:</span>
                    <span
                      className="text-white tabular-nums truncate max-w-[120px]"
                      title={
                        NAV_STATUS_MAP[
                          entity.vesselClassification?.navStatus ?? 15
                        ] || "Unknown"
                      }
                    >
                      {NAV_STATUS_MAP[
                        entity.vesselClassification?.navStatus ?? 15
                      ] || "UNKNOWN"}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/30">DEST:</span>
                    <span className="text-white tabular-nums truncate max-w-[100px]">
                      {entity.vesselClassification?.destination || "UNKNOWN"}
                    </span>
                  </div>
                </div>

                {/* Row 3: Draught / Hazardous */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/30">DRGT:</span>
                    <span className="text-white tabular-nums">
                      {entity.vesselClassification?.draught
                        ? `${entity.vesselClassification.draught}m`
                        : "---"}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/30">HAZ:</span>
                    <span
                      className={`${entity.vesselClassification?.hazardous ? "text-red-500 animate-pulse font-bold" : "text-white/40"} tabular-nums`}
                    >
                      {entity.vesselClassification?.hazardous ? "YES" : "NONE"}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Row 2: Alt / VS */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/30">ALT:</span>
                    <span className="text-white tabular-nums">
                      {entity.altitude > 0
                        ? Math.round(entity.altitude * 3.28084).toLocaleString()
                        : "GND"}{" "}
                      ft
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/30">VS:</span>
                    <span
                      className={`${entity.vspeed && Math.abs(entity.vspeed) > 100 ? "text-white" : "text-white/40"} tabular-nums`}
                    >
                      {entity.vspeed
                        ? Math.round(entity.vspeed).toLocaleString()
                        : "0"}{" "}
                      fpm
                    </span>
                  </div>
                </div>

                {/* Row 3: Squawk / Emergency */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/30">SQUAWK:</span>
                    <span className="text-amber-500/80 tabular-nums">
                      {entity.classification?.squawk || "----"}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span className="text-white/30">EMRG:</span>
                    <span
                      className={`${entity.classification?.emergency && entity.classification.emergency !== "none" ? "text-alert-red animate-pulse font-bold" : "text-white/40"} tabular-nums`}
                    >
                      {entity.classification?.emergency
                        ? entity.classification.emergency.toUpperCase()
                        : "NONE"}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Compass (air/ship) or Pass Geometry polar plot (satellite) */}
          <div className="pt-1 flex justify-center opacity-80 scale-100">
            {!isSat && (
              <Compass
                heading={entity.course}
                size={180}
                accentColor={accentBase}
              />
            )}
          </div>
        </section>
      </div>

      {/* 3. Footer Actions */}
      <div className="p-3 border border-t-0 border-tactical-border bg-black/40 backdrop-blur-md rounded-b-sm flex flex-col gap-2">
        <div
          className={`flex items-stretch gap-2 w-full ${entity.raw ? "grid grid-cols-2" : ""}`}
        >
          <AnalysisWidget
            accentColor={accentColor}
            onOpenPanel={onOpenAnalystPanel}
          />

          {entity.raw && (
            <button
              onClick={() => setShowInspector(true)}
              className="py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded group transition-all col-span-1"
            >
              <div className="flex items-center justify-between px-3 h-full">
                <span className="text-[10px] font-bold tracking-[.2em] text-white/30 group-hover:text-white/60">
                  RAW_PAYLOAD
                </span>
                <Terminal size={12} className="text-white/20" />
              </div>
            </button>
          )}
        </div>

        {/* Compact Metadata Footer */}
        <div className="flex items-center justify-between text-[8px] font-mono text-white/30 pt-1 border-t border-white/5">
          <span>
            SIG:{" "}
            <span className="text-hud-green/70">
              {isSat ? "ORBITAL_Poller" : isShip ? "AIS_Poller" : "ADSB_Poller"}
            </span>
          </span>
          <span>
            <TimeTracked lastSeen={entity.lastSeen} />
          </span>
        </div>
      </div>
    </div>
  );
};

export default SidebarRight;

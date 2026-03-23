import { Radio, Shield, Terminal } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useMissionLocation } from "../../../hooks/useMissionLocation";
import { usePassPredictions } from "../../../hooks/usePassPredictions";
import { CoTEntity } from "../../../types";
import { satAzEl } from "../../../utils/map/geoUtils";
import { AnalysisWidget } from "../../widgets/AnalysisWidget";
import { PayloadInspector } from "../../widgets/PayloadInspector";
import { PolarPlotWidget } from "../../widgets/PolarPlotWidget";
import { TimeTracked } from "../TimeTracked";
import { SatelliteViewProps } from "./types";

// ---------------------------------------------------------------------------
// Satellite-specific sub-components (isolated to comply with Rules of Hooks)
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

  const noradIdStr = entity.detail?.norad_id
    ? String(entity.detail.norad_id)
    : (entity.uid?.replace?.(/^SAT-/i, "") ?? "");

  const { passes } = usePassPredictions(obsLat, obsLon, {
    noradIds: noradIdStr ? [noradIdStr] : [],
    hours: 6,
    skip: !noradIdStr,
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const altKm = (entity.altitude || 0) / 1000;
  const { az, el, rangeKm } =
    altKm > 0
      ? satAzEl(obsLat, obsLon, entity.lat, entity.lon, altKm)
      : { az: 0, el: -90, rangeKm: 0 };

  const nextPass = passes.find((p) => Date.parse(p.los) > now);

  const inclination =
    entity.detail?.inclinationDeg != null
      ? Number(entity.detail.inclinationDeg).toFixed(2) + "°"
      : "---";
  const eccentricity =
    entity.detail?.eccentricity != null
      ? Number(entity.detail.eccentricity).toFixed(5)
      : "---";

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

  useEffect(() => {
    onPassData?.(
      polarPass,
      nextPass?.aos,
      nextPass?.max_elevation,
      entity.callsign,
      nextPass?.duration_seconds,
    );
  }, [
    onPassData,
    polarPass,
    nextPass?.aos,
    nextPass?.max_elevation,
    nextPass?.duration_seconds,
    entity.callsign,
  ]);

  return (
    <section className="space-y-1 pt-2">
      <h3 className="text-[10px] text-white/50 font-bold pb-1">
        Orbital_Parameters
      </h3>

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

      <div className="mt-4 pt-4 border-t border-purple-500/20">
        <div className="bg-black/40 border border-purple-500/10 rounded overflow-hidden">
          <PolarPlotWidget pass={polarPass} />
        </div>

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

// ---------------------------------------------------------------------------
// Main SatelliteView
// ---------------------------------------------------------------------------

export const SatelliteView: React.FC<SatelliteViewProps> = ({
  entity,
  onClose,
  onOpenAnalystPanel,
  fetchSatnogsVerification,
  onPassData,
}) => {
  const [showInspector, setShowInspector] = useState(false);

  const noradIdStr = entity.detail?.norad_id
    ? String(entity.detail.norad_id)
    : (entity.uid?.replace?.(/^SAT-/i, "") ?? "");

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
      {/* Header */}
      <div className="p-3 border border-b-0 border-purple-400/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] bg-gradient-to-br from-purple-400/20 to-purple-400/5 backdrop-blur-md rounded-t-sm relative">
        <div className="relative z-10 flex justify-between items-start gap-2">
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Shield size={14} className="text-purple-400" />
              <span className="text-[10px] font-bold tracking-[.3em] text-white/40">
                IDENTIFIED_TARGET
              </span>
            </div>
            <h2 className="text-mono-xl font-bold tracking-tighter text-purple-400 drop-shadow-[0_0_8px_currentColor] mb-2">
              {entity.callsign}
            </h2>

            {entity.detail && (
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
              NORAD {noradIdStr || "—"}
            </span>
          </div>
        </div>
        {/* Satellites have no CENTER_VIEW / TRACK_LOG buttons */}
      </div>

      {/* Body */}
      <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
        <SatelliteSpectrumVerification
          noradIdStr={noradIdStr}
          fetchSatnogsVerification={fetchSatnogsVerification}
        />

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

        <section className="space-y-2">
          <div className="flex items-center gap-2 text-hud-green/40 pb-1">
            <h3 className="text-[10px] text-white/50 font-bold">
              Vector_Dynamics
            </h3>
          </div>
          <div className="space-y-1 text-mono-xs font-medium">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">VEL:</span>
                <span className="text-purple-400 tabular-nums">
                  {(entity.speed / 1000).toFixed(1)} km/s
                </span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-white/30">TRK:</span>
                <span className="text-purple-400 tabular-nums">
                  {Math.round(entity.course)}°
                </span>
              </div>
            </div>
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
            <SatelliteInspectorSection
              entity={entity}
              onPassData={onPassData}
            />
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="p-3 border border-t-0 border-tactical-border bg-black/40 backdrop-blur-md rounded-b-sm flex flex-col gap-2">
        <div
          className={`flex items-stretch gap-2 w-full ${entity.raw ? "grid grid-cols-2" : ""}`}
        >
          <AnalysisWidget
            accentColor="text-purple-400"
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
        <div className="flex items-center justify-between text-[8px] font-mono text-white/30 pt-1 border-t border-white/5">
          <span>
            SIG:{" "}
            <span className="text-hud-green/70">ORBITAL_Poller</span>
          </span>
          <span>
            <TimeTracked lastSeen={entity.lastSeen} />
          </span>
        </div>
      </div>
    </div>
  );
};

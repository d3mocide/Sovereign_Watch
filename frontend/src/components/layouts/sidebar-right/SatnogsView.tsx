import { Crosshair, Radio, Satellite, X, ChevronDown, ChevronRight } from "lucide-react";
import React, { useState, useEffect } from "react";
import { AnalysisWidget } from "../../widgets/AnalysisWidget";
import { TimeTracked } from "../TimeTracked";
import { BaseViewProps } from "./types";

// ── Type helpers ────────────────────────────────────────────────────────────

interface SatnogsTransmitter {
  uuid: string;
  norad_id: string;
  sat_name: string;
  description: string;
  mode: string;
  downlink_low: number | null;
  downlink_high: number | null;
  alive: boolean;
}

interface SatnogsObservation {
  observation_id: number;
  norad_id: string;
  ground_station_id: number;
  frequency: number | null;
  mode: string;
  status: string;
  start_time: string;
  has_audio: boolean;
  has_waterfall: boolean;
  vetted_status: string;
}

function fmtMHz(hz: number | null): string {
  if (hz === null || hz === undefined) return "—";
  return (hz / 1e6).toFixed(3) + " MHz";
}

function modeColor(mode: string): string {
  const m = (mode || "").toUpperCase();
  if (m.includes("FM")) return "text-teal-300";
  if (m.includes("SSB") || m.includes("USB") || m.includes("LSB")) return "text-sky-300";
  if (m.includes("CW")) return "text-lime-300";
  if (m.includes("BPSK") || m.includes("PSK")) return "text-purple-300";
  return "text-white/50";
}

function obsStatusColor(status: string): string {
  const s = (status || "").toLowerCase();
  if (s.includes("good") || s === "ok") return "text-hud-green";
  if (s.includes("fail") || s.includes("bad")) return "text-red-400";
  return "text-amber-400";
}

// ── Component ────────────────────────────────────────────────────────────────

export const SatnogsView: React.FC<BaseViewProps> = ({
  entity,
  onClose,
  onCenterMap,
  onOpenAnalystPanel,
}) => {
  const detail = (entity.detail || {}) as Record<string, unknown>;
  const status = String(detail.status || "unknown").toUpperCase();
  const satnogsId = String(detail.satnogs_id || "");
  const altitudeM = Number(detail.altitude_m ?? entity.altitude ?? 0);

  const [transmitters, setTransmitters] = useState<SatnogsTransmitter[]>([]);
  const [observations, setObservations] = useState<SatnogsObservation[]>([]);
  const [txExpanded, setTxExpanded] = useState(true);
  const [obsExpanded, setObsExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/satnogs/transmitters?limit=20")
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (!cancelled) setTransmitters(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!satnogsId || satnogsId === "N/A" || satnogsId === "") return;
    let cancelled = false;
    fetch(`/api/satnogs/observations?ground_station_id=${encodeURIComponent(satnogsId)}&hours=24&limit=10`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (!cancelled) setObservations(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [satnogsId]);

  return (
    <div className="pointer-events-auto flex flex-col h-auto max-h-full overflow-hidden animate-in slide-in-from-right duration-500 font-mono">
      <div className="p-3 border border-b-0 border-teal-300/30 bg-gradient-to-br from-teal-300/15 to-teal-300/5 backdrop-blur-md rounded-t-sm">
        <div className="flex justify-between items-start">
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Satellite size={14} className="text-teal-300" />
              <span className="text-[10px] font-bold tracking-[.3em] text-white/40">SATNOGS_GROUND</span>
            </div>
            <h2 className="text-mono-xl font-bold tracking-tighter text-teal-300 drop-shadow-[0_0_8px_rgba(45,212,191,0.8)] mb-2 truncate" title={entity.callsign}>
              {entity.callsign}
            </h2>
            <section className="border-l-2 border-l-white/20 pl-3 py-1 mb-2 space-y-0.5">
              <h3 className="text-mono-sm font-bold text-white/90">GROUND_STATION</h3>
              <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                <div className="flex gap-2">
                  <span className="text-white/30 w-16">Node ID:</span>
                  <span className="text-white/80">{satnogsId || "N/A"}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-white/30 w-16">Status:</span>
                  <span className="text-hud-green">{status}</span>
                </div>
              </div>
            </section>
          </div>
          <button
            onClick={onClose}
            aria-label="Close details"
            title="Close details"
            className="p-1.5 hover:bg-white/10 rounded-sm text-white/30 hover:text-white transition-all group shrink-0 focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
          >
            <X size={14} className="group-hover:rotate-90 transition-transform duration-300" />
          </button>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onCenterMap?.();
            }}
            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-teal-300/30 to-teal-300/10 border border-teal-300/50 text-teal-300 hover:brightness-110 py-1.5 rounded text-[10px] font-bold tracking-widest transition-all active:scale-[0.98]"
          >
            <Crosshair size={12} />
            CENTER_VIEW
          </button>
        </div>
      </div>

      <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
        {/* Station Details */}
        <section className="space-y-2">
          <h3 className="text-[10px] text-white/50 font-bold uppercase tracking-wider">
            Station_Details
          </h3>
          <div className="space-y-1 text-mono-xs font-medium">
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">LATITUDE:</span>
              <span className="text-white tabular-nums">{entity.lat.toFixed(5)}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">LONGITUDE:</span>
              <span className="text-white tabular-nums">{entity.lon.toFixed(5)}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
              <span className="text-white/30">ALTITUDE:</span>
              <span className="text-teal-300 tabular-nums">{Math.round(altitudeM).toLocaleString()} m</span>
            </div>
          </div>
        </section>

        {/* Active Transmitters (GAP-01) */}
        <section className="space-y-1">
          <button
            onClick={() => setTxExpanded(v => !v)}
            className="flex items-center gap-1.5 text-[10px] text-white/50 font-bold uppercase tracking-wider w-full text-left hover:text-white/70 transition-colors"
          >
            {txExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            Active_Transmitters
            <span className="ml-auto text-[9px] text-white/25 font-normal">({transmitters.length})</span>
          </button>
          {txExpanded && (
            transmitters.length === 0 ? (
              <div className="text-[9px] text-white/20 italic pl-3">No transmitter data available</div>
            ) : (
              <div className="space-y-0.5">
                {transmitters.slice(0, 15).map((tx) => (
                  <div key={tx.uuid} className="grid grid-cols-[1fr_auto_auto] gap-2 text-[9px] border-b border-white/5 pb-0.5">
                    <span className="text-white/60 truncate" title={tx.sat_name}>{tx.sat_name}</span>
                    <span className={modeColor(tx.mode)}>{tx.mode || "?"}</span>
                    <span className="text-teal-300/70 tabular-nums text-right">{fmtMHz(tx.downlink_low)}</span>
                  </div>
                ))}
              </div>
            )
          )}
        </section>

        {/* Recent Observations (GAP-02) */}
        <section className="space-y-1">
          <button
            onClick={() => setObsExpanded(v => !v)}
            className="flex items-center gap-1.5 text-[10px] text-white/50 font-bold uppercase tracking-wider w-full text-left hover:text-white/70 transition-colors"
          >
            {obsExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            Recent_Observations
            <span className="ml-auto text-[9px] text-white/25 font-normal">(24h)</span>
          </button>
          {obsExpanded && (
            !satnogsId || satnogsId === "N/A" ? (
              <div className="text-[9px] text-white/20 italic pl-3">No station ID available</div>
            ) : observations.length === 0 ? (
              <div className="text-[9px] text-white/20 italic pl-3">No observations in last 24h</div>
            ) : (
              <div className="space-y-0.5">
                {observations.map((obs) => (
                  <div key={obs.observation_id} className="flex flex-col gap-0.5 border-b border-white/5 pb-1">
                    <div className="flex items-center justify-between text-[9px]">
                      <span className="text-white/40 tabular-nums">
                        {new Date(obs.start_time).toUTCString().slice(5, 22)}
                      </span>
                      <span className={`font-bold ${obsStatusColor(obs.status)}`}>
                        {(obs.status || "?").toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[8px] text-white/50">
                      <span>NORAD {obs.norad_id}</span>
                      <span className={modeColor(obs.mode)}>{obs.mode || "?"}</span>
                      <span className="text-teal-300/60 tabular-nums ml-auto">{fmtMHz(obs.frequency)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </section>
      </div>

      <div className="border border-t-0 border-teal-300/30 bg-black/50 backdrop-blur-md p-3 rounded-b-sm space-y-3">
        <AnalysisWidget
          accentColor="text-teal-300"
          onOpenPanel={onOpenAnalystPanel}
        />

        <section className="space-y-2">
          <h3 className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Tracking_Status</h3>
          <div className="flex items-center gap-2 text-teal-300 text-[10px]">
            <Radio size={12} />
            <span className="font-bold uppercase">SatNOGS node available for RF correlation</span>
          </div>
        </section>

        <TimeTracked lastSeen={entity.lastSeen} />
      </div>
    </div>
  );
};

export default SatnogsView;

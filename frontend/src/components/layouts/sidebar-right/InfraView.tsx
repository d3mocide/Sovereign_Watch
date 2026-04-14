import {
  CloudRain,
  Crosshair,
  Layers,
  Network,
  Satellite,
  Activity,
  Server,
  Signal,
  Waves,
  X,
} from "lucide-react";
import React from "react";
import { AnalysisWidget } from "../../widgets/AnalysisWidget";
import { TimeTracked } from "../TimeTracked";
import { BaseViewProps, InfraDetail } from "./types";

export const InfraView: React.FC<BaseViewProps> = ({
  entity,
  onClose,
  onCenterMap,
  onOpenAnalystPanel,
}) => {
  const detail = (entity.detail || {}) as InfraDetail;
  const props = detail.properties || {};
  const isStation = detail.geometry?.type === "Point";
  const isIXP = props.layer === "ixp";
  const isFacility = props.layer === "facility";
  const isBuoy = props.buoy_id !== undefined;
  const isNwsAlert =
    entity.type === "nws_alert" ||
    props.event !== undefined ||
    props.headline !== undefined;
  const isISS = entity.type === "iss" || props.entity_type === "iss";
  const isOutage =
    !isISS && !isNwsAlert && (
      props.entity_type === "outage" ||
      props.id?.includes("outage") ||
      props.severity !== undefined
    );
  const isDNS = (props as any).letter !== undefined && props.ip !== undefined;
  const isFirms = entity.type === "firms_hotspot" || props.layer === "firms";
  const isDarkVessel = entity.type === "dark_vessel" || props.layer === "dark_vessel";

  const severity = Number(props.severity || 0);

  const accentColor = isBuoy
    ? "text-blue-400"
    : isISS
      ? "text-yellow-400"
    : isNwsAlert
      ? "text-amber-300"
    : isDNS
      ? "text-green-400"
    : isFirms
      ? "text-orange-400"
    : isDarkVessel
      ? "text-rose-500"
    : isOutage
      ? severity > 50
        ? "text-red-400"
        : "text-amber-400"
      : "text-cyan-400";

  const accentBorder = isBuoy
    ? "border-blue-400/30"
    : isISS
      ? "border-yellow-400/30"
    : isNwsAlert
      ? "border-amber-400/30"
    : isDNS
      ? "border-green-400/30"
    : isFirms
      ? "border-orange-400/30"
    : isDarkVessel
      ? "border-rose-500/30"
    : isFacility
      ? "border-purple-400/30"
    : isOutage
      ? severity > 50
        ? "border-red-400/30"
        : "border-amber-400/30"
      : "border-cyan-400/30";

  const accentBg = isBuoy
    ? "from-blue-400/20 to-blue-400/5"
    : isISS
      ? "from-yellow-400/20 to-yellow-400/5"
    : isNwsAlert
      ? "from-amber-400/20 to-amber-400/5"
    : isDNS
      ? "from-green-400/20 to-green-400/5"
    : isFirms
      ? "from-orange-400/20 to-orange-400/5"
    : isDarkVessel
      ? "from-rose-500/20 to-rose-500/5"
    : isOutage
      ? severity > 50
        ? "from-red-400/20 to-red-400/5"
        : "from-amber-400/20 to-amber-400/5"
      : "from-cyan-400/20 to-cyan-400/5";

  const accentGlow = isBuoy
    ? "text-blue-300 drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]"
    : isISS
      ? "text-yellow-300 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]"
    : isNwsAlert
      ? "text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]"
    : isDNS
      ? "text-green-300 drop-shadow-[0_0_8px_rgba(74,222,128,0.8)]"
    : isFirms
      ? "text-orange-300 drop-shadow-[0_0_8px_rgba(251,146,60,0.8)]"
    : isDarkVessel
      ? "text-rose-300 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]"
    : isFacility
      ? "text-purple-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]"
    : isOutage
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
              {isBuoy ? (
                <Waves size={14} className={accentColor} />
              ) : isISS ? (
                <Satellite size={14} className={accentColor} />
              ) : isNwsAlert ? (
                <CloudRain size={14} className={accentColor} />
              ) : isIXP ? (
                <Network size={14} className={accentColor} />
              ) : isFacility ? (
                <Layers size={14} className={accentColor} />
              ) : isDNS ? (
                <Server size={14} className={accentColor} />
              ) : isFirms ? (
                <Activity size={14} className={accentColor} />
              ) : isDarkVessel ? (
                <Crosshair size={14} className={accentColor} />
              ) : isOutage ? (
                <Signal size={14} className={accentColor} />
              ) : (
                <Network size={14} className="text-cyan-400 shrink-0" />
              )}
              <span className="text-[10px] font-bold tracking-[.3em] text-white/40">
                {isBuoy
                  ? "OCEAN_BUOY"
                  : isISS
                    ? "ORBITAL_PLATFORM"
                    : isNwsAlert
                      ? "NWS_ALERT"
                    : isDNS
                      ? "ROOT_DNS"
                    : isIXP
                      ? "INTERNET_EXCHANGE"
                      : isFacility
                        ? "DATA_CENTER"
                        : isOutage
                          ? "CRITICAL_EVENT"
                          : isFirms
                            ? "THERMAL_ANOMALY"
                            : isDarkVessel
                              ? "MARITIME_ANOMALY"
                              : "UNDERSEA_INFRASTRUCTURE"}
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
                {isBuoy
                  ? "OCEANOGRAPHIC_BUOY"
                  : isISS
                    ? "INTL_SPACE_STATION"
                    : isNwsAlert
                      ? "WEATHER_HAZARD"
                    : isDNS
                      ? "AUTHORITATIVE_SERVER"
                    : isFirms
                      ? "NASA_FIRMS_THERMAL"
                    : isDarkVessel
                      ? "MARITIME_ANOMALY"
                    : isIXP
                      ? "PEERINGDB_NODE"
                      : isFacility
                        ? "CO-LOCATION_FACILITY"
                        : props.entity_type === "outage" ||
                            props.id?.includes("outage")
                          ? "INTERNET_OUTAGE"
                          : isStation
                            ? "LANDING_STATION"
                            : "SUBMARINE_CABLE"}
              </h3>
              <div className="flex flex-col gap-0.5 text-[10px] text-white/60">
                <>
                  <div className="flex gap-2">
                    <span className="text-white/30 w-16">
                      {isBuoy
                        ? "Location:"
                        : isISS
                          ? "Orbit:"
                        : isNwsAlert
                          ? "Severity:"
                        : isDNS
                          ? "Operator:"
                        : isFirms
                          ? "Source:"
                        : isDarkVessel
                          ? "Category:"
                        : isOutage
                          ? "Impact:"
                          : isStation
                              ? "Country:"
                              : "Location:"}
                    </span>
                    <span className="text-white/80">
                      {isISS
                        ? "LEO_ORBIT"
                        : isNwsAlert
                          ? String(props.severity || "UNKNOWN")
                        : isDNS
                           ? String(props.severity || "UNKNOWN")
                         : isFirms
                           ? String(props.satellite || "NASA FIRMS")
                           : isDarkVessel
                             ? "AIS-GAP ANOMALY"
                             : String(
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
                  {isNwsAlert && (
                    <>
                      <div className="flex gap-2">
                        <span className="text-white/30 w-16">Urgency:</span>
                        <span className="text-white/80 uppercase">
                          {String(props.urgency || "UNKNOWN")}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-white/30 w-16">Area:</span>
                        <span className="text-white/80 truncate" title={String(props.areaDesc || "UNSPECIFIED")}>
                          {String(props.areaDesc || "UNSPECIFIED")}
                        </span>
                      </div>
                    </>
                  )}
                  {!isStation && props.rfs && !isOutage && (
                    <div className="flex gap-2">
                      <span className="text-white/30 w-16">RFS:</span>
                      <span className="text-white/80">{props.rfs}</span>
                    </div>
                  )}
                </>
              </div>
            </section>
          </div>
          <button
            onClick={onClose}
            aria-label="Close details"
            title="Close details"
            className="p-1.5 hover:bg-white/10 rounded-sm text-white/30 hover:text-white transition-all group shrink-0 focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
          >
            <X
              size={14}
              className="group-hover:rotate-90 transition-transform duration-300"
            />
          </button>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onCenterMap?.();
            }}
            className={`flex-1 flex items-center justify-center gap-2 bg-gradient-to-b ${
              isISS
                ? "from-yellow-400/30 to-yellow-400/10 border-yellow-400/50 text-yellow-400"
                : isDNS
                  ? "from-green-400/30 to-green-400/10 border-green-400/50 text-green-400"
                : isOutage
                  ? "from-amber-400/30 to-amber-400/10 border-amber-400/50 text-amber-400"
                  : "from-cyan-400/30 to-cyan-400/10 border-cyan-400/50 text-cyan-400"
            } hover:brightness-110 py-1.5 rounded text-[10px] font-bold tracking-widest transition-all active:scale-[0.98]`}
          >
            <Crosshair size={12} />
            CENTER_VIEW
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="overflow-y-auto min-h-0 shrink border-x border-tactical-border bg-black/30 backdrop-blur-md p-3 space-y-3 scrollbar-none font-mono">
        {!isISS && (
          <section className="space-y-2">
            <h3
              className={`text-[10px] ${isOutage ? "text-amber-400" : "text-white/50"} font-bold uppercase tracking-wider`}
            >
              {isNwsAlert
                ? "NWS_Alert_Details"
                : isOutage
                  ? "Outage_Report"
                  : isDNS
                    ? "Server_Status"
                  : "Infrastructure_Specs"}
            </h3>
            <div className="space-y-1 text-mono-xs font-medium">
              {isNwsAlert ? (
                <>
                  <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                    <span className="text-white/30">EVENT:</span>
                    <span className="text-amber-300 font-bold uppercase">
                      {String(props.event || props.headline || "NWS ALERT")}
                    </span>
                  </div>
                  <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                    <span className="text-white/30">SEVERITY:</span>
                    <span className="text-amber-300 font-bold uppercase">
                      {String(props.severity || "UNKNOWN")}
                    </span>
                  </div>
                  <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                    <span className="text-white/30">URGENCY:</span>
                    <span className="text-white/80 font-bold uppercase">
                      {String(props.urgency || "UNKNOWN")}
                    </span>
                  </div>
                  <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                    <span className="text-white/30">CERTAINTY:</span>
                    <span className="text-white/80 font-bold uppercase">
                      {String(props.certainty || "UNKNOWN")}
                    </span>
                  </div>
                  <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                    <span className="text-white/30">EXPIRES:</span>
                    <span className="text-hud-green tabular-nums">
                      {props.expires
                        ? new Date(String(props.expires)).toLocaleString()
                        : "N/A"}
                    </span>
                  </div>
                </>
              ) : isOutage ? (
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
              ) : isDNS ? (
                <>
                  <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                    <span className="text-white/30">REACHABLE:</span>
                    <span className={`${props.reachable ? "text-green-400" : "text-red-400"} font-bold`}>
                      {props.reachable ? "YES" : "NO"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                    <span className="text-white/30">LATENCY:</span>
                    <span className="text-white tabular-nums">
                      {props.latency_ms != null ? `${Number(props.latency_ms).toFixed(1)} ms` : "—"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                    <span className="text-white/30">IP ADDRESS:</span>
                    <span className="text-white font-bold">
                      {String(props.ip || "UNKNOWN")}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  {!isStation && !isIXP && !isFacility && (
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
                      title={String(props.owners || props.org_name || "CONSORTIUM")}
                    >
                      {String(props.owners || props.org_name || "CONSORTIUM")}
                    </span>
                  </div>
                  {props.website && (
                    <div className="grid grid-cols-[100px_1fr] gap-2 border-b border-white/5 pb-1">
                      <span className="text-white/30">WEBSITE:</span>
                      <a
                        href={props.website.startsWith("http") ? props.website : `https://${props.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 truncate transition-colors underline decoration-cyan-400/30"
                      >
                        {props.website.replace(/^https?:\/\//, "")}
                      </a>
                    </div>
                  )}
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
        )}

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

        {isBuoy && (
          <section className="space-y-2">
            <h3 className="text-[10px] text-blue-400 font-bold tracking-wider">
              OCEANOGRAPHIC_DATA
            </h3>
            <div className="space-y-1 text-mono-xs font-medium">
              {props.wvht_m !== undefined && props.wvht_m !== null && (
                <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-white/5 pb-1">
                  <span className="text-white/30">WAVE HEIGHT:</span>
                  <span className="text-blue-400 tabular-nums font-bold">
                    {Number(props.wvht_m).toFixed(2)} m
                  </span>
                </div>
              )}
              {props.wtmp_c !== undefined && props.wtmp_c !== null && (
                <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-white/5 pb-1">
                  <span className="text-white/30">WATER TEMP:</span>
                  <span className="text-blue-300 tabular-nums font-bold">
                    {Number(props.wtmp_c).toFixed(1)}°C
                  </span>
                </div>
              )}
              {props.wspd_ms !== undefined && props.wspd_ms !== null && (
                <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-white/5 pb-1">
                  <span className="text-white/30">WIND SPEED:</span>
                  <span className="text-blue-200 tabular-nums font-bold">
                    {Number(props.wspd_ms).toFixed(1)} m/s
                  </span>
                </div>
              )}
              {props.wdir_deg !== undefined && props.wdir_deg !== null && (
                <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-white/5 pb-1">
                  <span className="text-white/30">WIND DIR:</span>
                  <span className="text-blue-200 tabular-nums font-bold">
                    {Number(props.wdir_deg).toFixed(0)}°
                  </span>
                </div>
              )}
              {props.atmp_c !== undefined && props.atmp_c !== null && (
                <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-white/5 pb-1">
                  <span className="text-white/30">AIR TEMP:</span>
                  <span className="text-blue-300 tabular-nums font-bold">
                    {Number(props.atmp_c).toFixed(1)}°C
                  </span>
                </div>
              )}
              {props.pres_hpa !== undefined && props.pres_hpa !== null && (
                <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-white/5 pb-1">
                  <span className="text-white/30">PRESSURE:</span>
                  <span className="text-blue-200 tabular-nums font-bold">
                    {Number(props.pres_hpa).toFixed(1)} hPa
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        {isISS && (
          <section className="space-y-2">
            <h3 className="text-[10px] text-yellow-400 font-bold tracking-wider">
              ORBITAL_TELEMETRY
            </h3>
            <div className="space-y-1 text-mono-xs font-medium">
              <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">ALTITUDE:</span>
                <span className="text-yellow-400 tabular-nums font-bold">
                  {props.altitude_km ? `${Number(props.altitude_km).toFixed(1)} km` : "408.0 km"}
                </span>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">VELOCITY:</span>
                <span className="text-yellow-400 tabular-nums font-bold">
                  {props.velocity_kms ? `${Number(props.velocity_kms).toFixed(2)} km/s` : "7.66 km/s"}
                </span>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">INCLINATION:</span>
                <span className="text-white/80 tabular-nums">51.64°</span>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">EPOCH_UTC:</span>
                <span className="text-hud-green tabular-nums">
                  {props.timestamp ? new Date(props.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()}
                </span>
              </div>
            </div>
          </section>
        )}
        {(isFirms || isDarkVessel) && (
          <section className="space-y-2">
            <h3 className={`text-[10px] ${isFirms ? "text-orange-400" : "text-rose-400"} font-bold tracking-wider uppercase`}>
              {isFirms ? "Thermal_hotspot_telemetry" : "Dark_vessel_anomaly_specs"}
            </h3>
            <div className="space-y-1 text-mono-xs font-medium">
              {props.frp !== undefined && (
                <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-white/5 pb-1">
                  <span className="text-white/30">RADIATIVE POWER:</span>
                  <span className="text-orange-400 tabular-nums font-bold">
                    {Number(props.frp).toFixed(1)} MW
                  </span>
                </div>
              )}
              {props.brightness !== undefined && (
                <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-white/5 pb-1">
                  <span className="text-white/30">BRIGHTNESS:</span>
                  <span className="text-white tabular-nums">
                    {Number(props.brightness).toFixed(1)} K
                  </span>
                </div>
              )}
              {props.confidence !== undefined && (
                <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-white/5 pb-1">
                  <span className="text-white/30">CONFIDENCE:</span>
                  <span className="text-hud-green font-bold uppercase">
                    {String(props.confidence)}
                  </span>
                </div>
              )}
              {props.risk_score !== undefined && (
                <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-white/5 pb-1">
                  <span className="text-white/30">RISK SCORE:</span>
                  <span className="text-rose-400 tabular-nums font-bold">
                    {(Number(props.risk_score) * 100).toFixed(0)}%
                  </span>
                </div>
              )}
              {props.nearest_ais_nm !== undefined && (
                <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-white/5 pb-1">
                  <span className="text-white/30">NEAREST AIS:</span>
                  <span className="text-white tabular-nums">
                    {Number(props.nearest_ais_nm).toFixed(1)} NM
                  </span>
                </div>
              )}
              <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-white/5 pb-1">
                <span className="text-white/30">ACQ_TIME:</span>
                <span className="text-cyan-400 tabular-nums">
                  {props.acq_time ? String(props.acq_time) : "N/A"}
                </span>
              </div>
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
        <div className="flex items-center justify-between text-[8px] font-mono text-white/30 pt-1 border-t border-white/5">
          <span>
            SRC: <span className={isISS ? "text-yellow-400/70" : isNwsAlert ? "text-amber-400/70" : "text-cyan-400/70"}>
              {isISS ? "Space_Pulse" : "INFRA_Poller"}
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

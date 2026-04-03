import {
  CloudRain,
  Crosshair,
  Layers,
  Network,
  Plane,
  Radio,
  Satellite,
  Ship,
  Signal,
  Waves,
  WifiOff,
  Zap,
} from "lucide-react";
import React from "react";
import { CoTEntity } from "../../types";

interface MapTooltipProps {
  entity: CoTEntity;
  position: { x: number; y: number };
}

function getHoldingSeverity(turnsRaw: number | string | undefined) {
  const turns = Number(turnsRaw ?? 0);
  if (turns >= 5) {
    return {
      label: "CRITICAL",
      className: "text-red-400",
      borderClass: "border-red-400/60",
      dotClass: "text-red-400",
    };
  }
  if (turns >= 2) {
    return {
      label: "ELEVATED",
      className: "text-orange-300",
      borderClass: "border-orange-400/55",
      dotClass: "text-orange-300",
    };
  }
  return {
    label: "NORMAL",
    className: "text-amber-400",
    borderClass: "border-amber-400/50",
    dotClass: "text-amber-400",
  };
}

export const MapTooltip: React.FC<MapTooltipProps> = ({ entity, position }) => {
  const detail = (entity.detail ?? {}) as Record<string, unknown>;
  const detailProps = ((detail.properties as
    | Record<string, unknown>
    | undefined) ?? detail) as Record<string, unknown>;
  const detailGeometry = (detail.geometry ?? {}) as Record<string, unknown>;

  const isShip = entity.type.includes("S");
  const isBuoy = entity.type === "buoy";
  const isRepeater = entity.type === "repeater";
  const isTower = entity.type === "tower";
  const isJS8 = entity.type === "js8";
  const isSatnogs = entity.type === "satnogs";
  const isOrbital =
    entity.type === "a-s-K" ||
    (typeof entity.type === "string" && entity.type.indexOf("K") === 4);
  const isInfra = entity.type === "infra" && detailProps.layer !== "ixp" && detailProps.layer !== "facility";
  const isIXP = entity.type === "infra" && detailProps.layer === "ixp";
  const isFacility = entity.type === "infra" && detailProps.layer === "facility";
  const isISS = entity.type === "iss";
  const isNwsAlert = entity.type === "nws_alert";
  const isOutage = entity.type === "outage";
  const isHold = entity.type === "hold";
  const isGdelt = entity.type === "gdelt";
  const isJamming = entity.type === "jamming";
  const jammingAssessment = String(
    (entity.detail as Record<string, unknown> | undefined)?.assessment ||
      "mixed",
  );
  const jammingColor =
    jammingAssessment === "jamming"
      ? "text-red-400"
      : jammingAssessment === "space_weather"
        ? "text-purple-400"
        : jammingAssessment === "equipment"
          ? "text-slate-300"
          : "text-amber-400";

  const holdSeverity = getHoldingSeverity(
    (entity.detail as Record<string, unknown> | undefined)?.turns_completed as
      | number
      | string
      | undefined,
  );

  const accentColor = isRepeater
    ? "text-emerald-400"
    : isTower
      ? "text-orange-400"
      : isJS8
        ? "text-emerald-400"
        : isSatnogs
          ? "text-teal-300"
        : isOrbital
          ? "text-purple-400"
          : isBuoy
            ? "text-blue-400"
            : isShip
              ? "text-sea-accent"
              : isIXP
                ? "text-cyan-400"
                : isFacility
                  ? "text-purple-400"
                  : isISS
                    ? "text-yellow-400"
                    : isNwsAlert
                      ? "text-amber-300"
                    : isInfra
                      ? "text-cyan-400"
                      : isHold
                        ? holdSeverity.dotClass
                        : isOutage
                          ? "text-amber-400"
                          : isGdelt
                            ? "text-hud-green"
                            : isJamming
                              ? jammingColor
                              : "text-air-accent";

  const borderColor = isRepeater
    ? "border-emerald-400/50"
    : isTower
      ? "border-orange-400/50"
      : isJS8
        ? "border-emerald-400/50"
        : isSatnogs
          ? "border-teal-300/50"
        : isOrbital
          ? "border-purple-400/50"
          : isBuoy
            ? "border-blue-400/50"
            : isShip
              ? "border-sea-accent/50"
              : isIXP
                ? "border-cyan-400/50"
                : isFacility
                  ? "border-purple-400/50"
                  : isISS
                    ? "border-yellow-400/50"
                    : isNwsAlert
                      ? "border-amber-400/60"
                    : isInfra
                      ? "border-cyan-400/50"
                      : isHold
                        ? holdSeverity.borderClass
                        : isOutage
                          ? "border-amber-400/50"
                          : isGdelt
                            ? "border-hud-green/30"
                            : isJamming
                              ? "border-amber-400/50"
                              : "border-air-accent/50";

  const HeaderIcon = isRepeater
    ? Radio
    : isTower
      ? Radio
      : isJS8
        ? Signal
        : isSatnogs
          ? Satellite
        : isOrbital
          ? Satellite
          : isBuoy
            ? Waves
            : isShip
              ? Ship
              : isIXP
                ? Network
                : isFacility
                  ? Layers
                  : isISS
                    ? Satellite
                    : isNwsAlert
                      ? CloudRain
                    : isInfra
                      ? Network
                      : isOutage
                        ? Signal
                        : isGdelt
                          ? Zap
                          : isJamming
                            ? WifiOff
                            : isHold
                              ? Crosshair
                              : Plane;

  return (
    <div
      style={{
        position: "absolute",
        left: position.x + 20,
        top: position.y - 40,
        pointerEvents: "none",
        zIndex: 100,
      }}
      className={`animate-in fade-in zoom-in-95 duration-200 min-w-[200px] bg-black/95 backdrop-blur-md border ${borderColor} rounded-sm overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.6)]`}
    >
      {/* Tooltip Header */}
      <div
        className={`px-3 py-1.5 flex items-center justify-between border-b ${borderColor} bg-white-[2%]`}
      >
        <div className="flex items-center gap-2">
          <HeaderIcon size={14} className={accentColor} />
          <span className="text-mono-sm font-bold text-white tracking-tight">
            {entity.callsign}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div
            className={`h-1.5 w-1.5 rounded-full ${accentColor} animate-pulse shadow-[0_0_4px_currentColor]`}
          />
          <span className="text-[8px] font-mono text-white/50">
            {isRepeater
              ? "INFRA"
              : isTower
                ? "TOWER"
                : isJS8
                  ? "JS8CALL"
                  : isSatnogs
                    ? "SATNOGS"
                  : isBuoy
                    ? "BUOY"
                    : isNwsAlert
                      ? "NWS"
                    : isInfra
                      ? "UNDERSEA"
                      : isOutage
                        ? "OUTAGE"
                        : isHold
                          ? "HOLDING"
                          : isGdelt
                            ? "OSINT"
                            : isJamming
                              ? "SIGINT"
                              : "LIVE"}
          </span>
        </div>
      </div>

      {/* Tooltip Content */}
      {isHold ? (
        <div className="p-3 grid grid-cols-2 gap-y-2 gap-x-4">
          <div className="col-span-2 border-b border-white/5 pb-2 mb-1">
            <span className="text-[8px] text-white/40 block leading-tight">
              TACTICAL STATUS
            </span>
            <span
              className={`text-[10px] font-mono font-bold leading-tight uppercase ${holdSeverity.className}`}
            >
              AIRCRAFT ESTABLISHED IN HOLD
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              ALTITUDE
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {entity.altitude != null
                ? `${Math.round(entity.altitude).toLocaleString()} ft`
                : "N/A"}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              COMPLETED
            </span>
            <span
              className={`text-[10px] font-mono font-bold leading-tight ${holdSeverity.className}`}
            >
              {String(entity.detail?.turns_completed ?? "0")} TURNS
            </span>
          </div>
          <div className="col-span-2 border-t border-white/5 pt-2 mt-1">
            <span className="text-[8px] text-white/40 block leading-tight">
              SEVERITY
            </span>
            <span
              className={`text-[10px] font-mono font-bold leading-tight ${holdSeverity.className}`}
            >
              {holdSeverity.label}
            </span>
          </div>
        </div>
      ) : isSatnogs ? (
        <div className="p-3 grid grid-cols-2 gap-y-2 gap-x-4">
          <div className="col-span-2 border-b border-white/5 pb-2 mb-1">
            <span className="text-[8px] text-white/40 block leading-tight">
              GROUND STATION
            </span>
            <span className="text-[10px] text-teal-300 font-mono font-bold leading-tight uppercase">
              SATNOGS NODE
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              NODE ID
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {String(detailProps.satnogs_id ?? "N/A")}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              STATUS
            </span>
            <span className="text-[10px] text-hud-green font-mono font-bold leading-tight uppercase">
              {String(detailProps.status ?? "unknown")}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              LAT
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {entity.lat.toFixed(4)}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              LON
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {entity.lon.toFixed(4)}
            </span>
          </div>
          <div className="col-span-2">
            <span className="text-[8px] text-white/40 block leading-tight">
              ALTITUDE
            </span>
            <span className="text-[10px] text-teal-300 font-mono font-bold leading-tight">
              {`${Math.round(Number(detailProps.altitude_m ?? entity.altitude ?? 0)).toLocaleString()} m`}
            </span>
          </div>
        </div>
      ) : isRepeater ? (
        <div className="p-3 grid grid-cols-2 gap-y-2 gap-x-4">
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              FREQ OUT
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {(entity.detail?.frequency as string) || "--"} MHz
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              CTCSS/PL
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {(entity.detail?.ctcss as string) || "none"}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              ACCESS
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {(entity.detail?.use as string) || "--"}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              STATUS
            </span>
            <span
              className={`text-[10px] font-mono font-bold leading-tight ${
                String(entity.detail?.status ?? "")
                  .toLowerCase()
                  .includes("off")
                  ? "text-red-400"
                  : "text-emerald-400"
              }`}
            >
              {(entity.detail?.status as string) || "--"}
            </span>
          </div>
          <div className="col-span-2">
            <span className="text-[8px] text-white/40 block leading-tight">
              LOCATION
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {[entity.detail?.city, entity.detail?.state]
                .filter(Boolean)
                .join(", ") || "--"}
            </span>
          </div>
          {typeof detail.modes === "string" && detail.modes.length > 0 && (
            <div className="col-span-2">
              <span className="text-[8px] text-white/40 block leading-tight">
                MODES
              </span>
              <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
                {detail.modes}
              </span>
            </div>
          )}
        </div>
      ) : isTower ? (
        <div className="p-3 grid grid-cols-2 gap-y-2 gap-x-4">
          <div className="col-span-2 border-b border-white/5 pb-2 mb-1">
            <span className="text-[8px] text-white/40 block leading-tight">
              SYSTEM
            </span>
            <span className="text-[10px] text-orange-400 font-mono font-bold leading-tight uppercase">
              FCC COMMUNICATIONS TOWER
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              FCC ID
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight truncate">
              {String(detailProps.fcc_id || "UNKNOWN")}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              STATUS
            </span>
            <span className="text-[10px] text-hud-green font-mono font-bold leading-tight flex items-center gap-1 uppercase">
              <Zap size={8} /> {String(detailProps.status || "ACTIVE")}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              HEIGHT
            </span>
            <span className="text-[10px] text-amber-400 font-mono font-bold leading-tight">
              {detailProps.height_m != null
                ? `${Number(detailProps.height_m).toLocaleString()} m`
                : "N/A"}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              TYPE
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight truncate uppercase">
              {String(detailProps.tower_type || "COMMERCIAL")}
            </span>
          </div>
          <div className="col-span-2">
            <span className="text-[8px] text-white/40 block leading-tight">
              OWNER
            </span>
            <span
              className="text-[10px] text-amber-400 font-mono font-bold leading-tight truncate block"
              title={String(detailProps.owner || "N/A")}
            >
              {String(detailProps.owner || "N/A")}
            </span>
          </div>
        </div>
      ) : isBuoy ? (
        <div className="p-3 grid grid-cols-2 gap-y-2 gap-x-4">
          <div className="col-span-2 border-b border-white/5 pb-2 mb-1">
            <span className="text-[8px] text-white/40 block leading-tight">
              SYSTEM
            </span>
            <span className="text-[10px] text-blue-400 font-mono font-bold leading-tight uppercase">
              OCEANOGRAPHIC BUOY
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              WAVE HEIGHT
            </span>
            <span className="text-[10px] text-blue-300 font-mono font-bold leading-tight">
              {detailProps.wvht_m != null
                ? `${Number(detailProps.wvht_m).toFixed(2)} m`
                : "N/A"}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              WATER TEMP
            </span>
            <span className="text-[10px] text-blue-300 font-mono font-bold leading-tight">
              {detailProps.wtmp_c != null
                ? `${Number(detailProps.wtmp_c).toFixed(1)} C`
                : "N/A"}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              WIND SPEED
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {detailProps.wspd_ms != null
                ? `${Number(detailProps.wspd_ms).toFixed(1)} m/s`
                : "N/A"}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              WIND DIR
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {detailProps.wdir_deg != null
                ? `${Math.round(Number(detailProps.wdir_deg))}°`
                : "N/A"}
            </span>
          </div>
        </div>
      ) : isIXP ? (
        <div className="p-3 grid grid-cols-2 gap-y-2 gap-x-4">
          <div className="col-span-2 border-b border-white/5 pb-2 mb-1">
            <span className="text-[8px] text-white/40 block leading-tight">
              SYSTEM
            </span>
            <span className="text-[10px] text-cyan-400 font-mono font-bold leading-tight uppercase">
              INTERNET EXCHANGE
            </span>
          </div>
          <div className="col-span-2">
            <span className="text-[8px] text-white/40 block leading-tight">
              NAME
            </span>
            <span className="text-[10px] text-white/90 font-mono font-bold leading-tight truncate block">
              {String(detailProps.name_long || detailProps.name || "UNKNOWN")}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              CITY
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {String(detailProps.city || "—")}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              COUNTRY
            </span>
            <span className="text-[10px] text-cyan-400 font-mono font-bold leading-tight">
              {String(detailProps.country || "—")}
            </span>
          </div>
        </div>
      ) : isFacility ? (
        <div className="p-3 grid grid-cols-2 gap-y-2 gap-x-4">
          <div className="col-span-2 border-b border-white/5 pb-2 mb-1">
            <span className="text-[8px] text-white/40 block leading-tight">
              SYSTEM
            </span>
            <span className="text-[10px] text-purple-400 font-mono font-bold leading-tight uppercase">
              DATA CENTER
            </span>
          </div>
          <div className="col-span-2">
            <span className="text-[8px] text-white/40 block leading-tight">
              FACILITY
            </span>
            <span className="text-[10px] text-white/90 font-mono font-bold leading-tight truncate block">
              {String(detailProps.name || "UNKNOWN")}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              OPERATOR
            </span>
            <span className="text-[10px] text-purple-400 font-mono font-bold leading-tight truncate">
              {String(detailProps.org_name || "—")}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              COUNTRY
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {String(detailProps.country || "—")}
            </span>
          </div>
        </div>
      ) : isISS ? (
        <div className="p-3 grid grid-cols-2 gap-y-2 gap-x-4">
          <div className="col-span-2 border-b border-white/5 pb-2 mb-1">
            <span className="text-[8px] text-white/40 block leading-tight">
              SPACECRAFT
            </span>
            <span className="text-[10px] text-yellow-400 font-mono font-bold leading-tight uppercase">
              INTL SPACE STATION
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              LATITUDE
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {detailProps.lat != null
                ? `${Number(detailProps.lat).toFixed(4)}°`
                : "—"}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              LONGITUDE
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {detailProps.lon != null
                ? `${Number(detailProps.lon).toFixed(4)}°`
                : "—"}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              ALTITUDE
            </span>
            <span className="text-[10px] text-yellow-400 font-mono font-bold leading-tight">
              {detailProps.altitude_km != null
                ? `${Number(detailProps.altitude_km).toFixed(1)} km`
                : "~408 km"}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              UPDATED
            </span>
            <span className="text-[10px] text-hud-green font-mono font-bold leading-tight">
              {detailProps.timestamp
                ? new Date(String(detailProps.timestamp)).toLocaleTimeString()
                : "—"}
            </span>
          </div>
        </div>
      ) : isNwsAlert ? (
        <div className="p-3 grid grid-cols-2 gap-y-2 gap-x-4">
          <div className="col-span-2 border-b border-white/5 pb-2 mb-1">
            <span className="text-[8px] text-white/40 block leading-tight">
              WEATHER HAZARD
            </span>
            <span className="text-[10px] text-amber-300 font-mono font-bold leading-tight uppercase">
              {String(detailProps.event || detailProps.headline || "NWS ALERT")}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              SEVERITY
            </span>
            <span className="text-[10px] text-amber-300 font-mono font-bold leading-tight uppercase">
              {String(detailProps.severity || "UNKNOWN")}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              URGENCY
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight uppercase">
              {String(detailProps.urgency || "UNKNOWN")}
            </span>
          </div>
          <div className="col-span-2">
            <span className="text-[8px] text-white/40 block leading-tight">
              AREA
            </span>
            <span
              className="text-[10px] text-white/90 font-mono font-bold leading-tight truncate block"
              title={String(detailProps.areaDesc || "UNSPECIFIED")}
            >
              {String(detailProps.areaDesc || "UNSPECIFIED")}
            </span>
          </div>
          <div className="col-span-2">
            <span className="text-[8px] text-white/40 block leading-tight">
              EXPIRES
            </span>
            <span className="text-[10px] text-hud-green font-mono font-bold leading-tight">
              {detailProps.expires
                ? new Date(String(detailProps.expires)).toLocaleString()
                : "N/A"}
            </span>
          </div>
        </div>
      ) : isInfra ? (
        <div className="p-3 grid grid-cols-2 gap-y-2 gap-x-4">
          <div className="col-span-2 border-b border-white/5 pb-2 mb-1">
            <span className="text-[8px] text-white/40 block leading-tight">
              SYSTEM
            </span>
            <span className="text-[10px] text-cyan-400 font-mono font-bold leading-tight uppercase">
              {detailGeometry.type === "Point"
                ? "LANDING STATION"
                : "SUBMARINE CABLE"}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              {detailGeometry.type === "Point" ? "COUNTRY" : "LENGTH"}
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight truncate">
              {String(
                detailGeometry.type === "Point"
                  ? detailProps.country || "UNKNOWN"
                  : detailProps.length_km
                    ? `${Number(detailProps.length_km).toLocaleString()} km`
                    : "VARIES",
              )}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              STATUS
            </span>
            <span className="text-[10px] text-hud-green font-mono font-bold leading-tight flex items-center gap-1">
              <Zap size={8} /> {String(detailProps.status || "ACTIVE")}
            </span>
          </div>
          <div className="col-span-2">
            <span className="text-[8px] text-white/40 block leading-tight">
              OWNERS
            </span>
            <span
              className="text-[10px] text-amber-400 font-mono font-bold leading-tight truncate block"
              title={String(detailProps.owners || "CONSORTIUM")}
            >
              {String(detailProps.owners || "CONSORTIUM")}
            </span>
          </div>
        </div>
      ) : isOutage ? (
        <div className="p-3 grid grid-cols-2 gap-y-2 gap-x-4">
          <div className="col-span-2 border-b border-white/5 pb-2 mb-1">
            <span className="text-[8px] text-white/40 block leading-tight">
              SYSTEM
            </span>
            <span className="text-[10px] text-amber-400 font-mono font-bold leading-tight uppercase">
              INTERNET OUTAGE
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              SEVERITY
            </span>
            <span
              className={`text-[10px] font-mono font-bold leading-tight ${Number(detailProps.severity) > 50 ? "text-red-400" : "text-amber-400"}`}
            >
              {String(detailProps.severity ?? "0")}%
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              SOURCE
            </span>
            <span className="text-[10px] text-hud-green font-mono font-bold leading-tight uppercase">
              {String(detailProps.datasource || "IODA")}
            </span>
          </div>
          <div className="col-span-2">
            <span className="text-[8px] text-white/40 block leading-tight">
              LOCATION
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight truncate block">
              {String(detailProps.region || detailProps.country || "GLOBAL")}
            </span>
          </div>
        </div>
      ) : isGdelt ? (
        <div className="p-3 grid grid-cols-2 gap-y-2 gap-x-4">
          <div className="col-span-2 border-b border-white/5 pb-2 mb-1">
            <span className="text-[8px] text-white/40 block leading-tight">
              EVENT CLASS
            </span>
            <span className="text-[10px] text-hud-green font-mono font-bold leading-tight uppercase">
              {entity.detail?.quad_class === 1
                ? "VERBAL COOP"
                : entity.detail?.quad_class === 2
                  ? "MATERIAL COOP"
                  : entity.detail?.quad_class === 3
                    ? "VERBAL CONFLICT"
                    : entity.detail?.quad_class === 4
                      ? "MATERIAL CONFLICT"
                      : entity.detail?.event_root_code
                        ? `CAMEO:${entity.detail.event_root_code}`
                        : "OPEN SOURCE"}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              TONE (GS)
            </span>
            <span
              className={`text-[10px] font-mono font-bold leading-tight ${Number(entity.detail?.goldstein ?? 0) <= -2 ? "text-red-400" : "text-hud-green"}`}
            >
              {(entity.detail?.goldstein as number)?.toFixed(1) ?? "0.0"}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              STATUS
            </span>
            <span
              className={`text-[10px] font-mono font-bold leading-tight ${Number(entity.detail?.goldstein ?? 0) <= -2 ? "text-red-400" : "text-hud-green"}`}
            >
              {Number(entity.detail?.goldstein ?? 0) <= -5
                ? "CRITICAL"
                : Number(entity.detail?.goldstein ?? 0) <= -2
                  ? "TENSION"
                  : "STABLE"}
            </span>
          </div>
          {entity.detail?.actor1_country || entity.detail?.actor2_country ? (
            <div className="col-span-2">
              <span className="text-[8px] text-white/40 block leading-tight">
                COUNTRIES
              </span>
              <span className="text-[10px] text-white/80 font-mono font-bold leading-tight uppercase">
                {[entity.detail?.actor1_country, entity.detail?.actor2_country]
                  .filter(Boolean)
                  .join(" ↔ ")}
              </span>
            </div>
          ) : (
            <div className="col-span-2">
              <span className="text-[8px] text-white/40 block leading-tight">
                DATA SOURCE
              </span>
              <span className="text-[10px] text-white/80 font-mono font-bold leading-tight uppercase">
                GDELT GLOBAL EVENT MONITOR
              </span>
            </div>
          )}
        </div>
      ) : isJamming ? (
        <div className="p-3 grid grid-cols-2 gap-y-2 gap-x-4">
          <div className="col-span-2 border-b border-white/5 pb-2 mb-1">
            <span className="text-[8px] text-white/40 block leading-tight">
              SIGNAL ASSESSMENT
            </span>
            <span
              className={`text-[10px] font-mono font-bold leading-tight uppercase ${jammingColor}`}
            >
              {jammingAssessment.replaceAll("_", " ")}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              CONFIDENCE
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {Math.round(
                Number(
                  (entity.detail as Record<string, unknown>)?.confidence || 0,
                ) * 100,
              )}
              %
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              AFFECTED
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {String(
                (entity.detail as Record<string, unknown>)?.affected_count ?? 0,
              )}{" "}
              tracks
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              AVG NIC
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {String(
                (entity.detail as Record<string, unknown>)?.avg_nic ?? "-",
              )}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              AVG NACp
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {String(
                (entity.detail as Record<string, unknown>)?.avg_nacp ?? "-",
              )}
            </span>
          </div>
          <div className="col-span-2">
            <span className="text-[8px] text-white/40 block leading-tight">
              SPACE WEATHER (KP)
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {String(
                (entity.detail as Record<string, unknown>)?.kp_at_event ??
                  "unknown",
              )}
            </span>
          </div>
        </div>
      ) : (
        <div className="p-3 grid grid-cols-2 gap-y-2 gap-x-4">
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              TYPE
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {isJS8
                ? "JS8CALL"
                : isSatnogs
                  ? "SATNOGS"
                : isOrbital
                  ? "ORBITAL"
                  : isBuoy
                    ? "BUOY"
                    : isShip
                      ? "MARITIME"
                      : "AVIONICS"}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              SPEED
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {isOrbital
                ? `${(entity.speed / 1000).toFixed(2)} km/s`
                : `${(entity.speed * 1.94384).toFixed(1)} kts`}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              CRS
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {Math.round(entity.course)}°
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              STATUS
            </span>
            <span className="text-[10px] text-hud-green font-mono font-bold leading-tight flex items-center gap-1">
              <Zap size={8} /> TRACKING
            </span>
          </div>
        </div>
      )}

      {/* Hint Footer */}
      <div className="px-3 py-1 bg-white/5 border-t border-white/5 flex items-center gap-2">
        <Crosshair size={10} className="text-white/20" />
        <span className="text-[8px] text-white/30 font-mono uppercase tracking-widest">
          Select for details
        </span>
      </div>
    </div>
  );
};

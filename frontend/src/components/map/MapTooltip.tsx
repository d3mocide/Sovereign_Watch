import {
  Crosshair,
  Network,
  Plane,
  Radio,
  Satellite,
  Ship,
  Signal,
  Zap,
} from "lucide-react";
import React from "react";
import { CoTEntity } from "../../types";

interface MapTooltipProps {
  entity: CoTEntity;
  position: { x: number; y: number };
}

export const MapTooltip: React.FC<MapTooltipProps> = ({ entity, position }) => {
  const isShip = entity.type.includes("S");
  const isRepeater = entity.type === "repeater";
  const isTower = entity.type === "tower";
  const isJS8 = entity.type === "js8";
  const isOrbital =
    entity.type === "a-s-K" ||
    (typeof entity.type === "string" && entity.type.indexOf("K") === 4);
  const isInfra = entity.type === "infra";
  const isOutage = entity.type === "outage";
  const isGdelt = entity.type === "gdelt";

  const accentColor = isRepeater
    ? "text-emerald-400"
    : isTower
      ? "text-orange-400"
      : isJS8
        ? "text-emerald-400"
        : isOrbital
          ? "text-purple-400"
          : isShip
            ? "text-sea-accent"
            : isInfra
              ? "text-cyan-400"
              : isOutage
                ? "text-amber-400"
                : isGdelt
                  ? "text-hud-green"
                  : "text-air-accent";

  const borderColor = isRepeater
    ? "border-emerald-400/50"
    : isTower
      ? "border-orange-400/50"
      : isJS8
        ? "border-emerald-400/50"
        : isOrbital
          ? "border-purple-400/50"
          : isShip
            ? "border-sea-accent/50"
            : isInfra
              ? "border-cyan-400/50"
              : isOutage
                ? "border-amber-400/50"
                : isGdelt
                  ? "border-hud-green/30"
                  : "border-air-accent/50";

  const HeaderIcon = isRepeater
    ? Radio
    : isTower
      ? Radio
      : isJS8
        ? Signal
        : isOrbital
          ? Satellite
          : isShip
            ? Ship
            : isInfra
              ? Network
              : isOutage
                ? Signal
                : isGdelt
                  ? Zap
                  : Plane;

  const detail = (entity.detail ?? {}) as Record<string, unknown>;
  const detailProps = (detail.properties ?? {}) as Record<string, unknown>;
  const detailGeometry = (detail.geometry ?? {}) as Record<string, unknown>;

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
                  : isInfra
                    ? "UNDERSEA"
                    : isOutage
                      ? "OUTAGE"
                      : isGdelt
                        ? "OSINT"
                        : "LIVE"}
          </span>
        </div>
      </div>

      {/* Tooltip Content */}
      {isRepeater ? (
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
              className={`text-[10px] font-mono font-bold leading-tight ${Number(entity.detail?.tone || 0) <= -2 ? "text-red-400" : "text-hud-green"}`}
            >
              {(entity.detail?.tone as number)?.toFixed(1) || "0.0"}
            </span>
          </div>
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              STATUS
            </span>
            <span
              className={`text-[10px] font-mono font-bold leading-tight ${Number(entity.detail?.tone || 0) <= -2 ? "text-red-400" : "text-hud-green"}`}
            >
              {Number(entity.detail?.tone || 0) <= -5
                ? "CRITICAL"
                : Number(entity.detail?.tone || 0) <= -2
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
      ) : (
        <div className="p-3 grid grid-cols-2 gap-y-2 gap-x-4">
          <div>
            <span className="text-[8px] text-white/40 block leading-tight">
              TYPE
            </span>
            <span className="text-[10px] text-white/80 font-mono font-bold leading-tight">
              {isJS8
                ? "JS8CALL"
                : isOrbital
                  ? "ORBITAL"
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

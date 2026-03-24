import type { FeatureCollection } from "geojson";
import {
  Activity,
  AlertTriangle,
  Antenna,
  Globe,
  Newspaper,
  Plane,
  Satellite,
  Ship,
  Signal,
  TrendingUp,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePassPredictions } from "../../hooks/usePassPredictions";
import { CoTEntity, DRState, IntelEvent, MissionProps } from "../../types";
import { SituationGlobe } from "../map/SituationGlobe";
import { GdeltBreakdownWidget } from "../widgets/GdeltBreakdownWidget";
import { MiniTacticalMap } from "../widgets/MiniMap";
import type { RFSiteResult } from "../widgets/MiniMap";
import { NewsWidget } from "../widgets/NewsWidget";
import { OutageAlertPanel } from "../widgets/OutageAlertPanel";
import { RFSiteSearchPanel } from "../widgets/RFSiteSearchPanel";
import { StreamStatusMonitor } from "../widgets/StreamStatusMonitor";
import { TrackSparkline } from "../widgets/TrackSparkline";

// ─── Types ───────────────────────────────────────────────────────────────────

type PassCategory = "intel" | "weather" | "gps";

// ─── Main Dashboard ───────────────────────────────────────────────────────────

interface DashboardViewProps {
  events: IntelEvent[];
  trackCounts: { air: number; sea: number; orbital: number };
  missionProps: MissionProps | null;
  entitiesRef: React.MutableRefObject<Map<string, CoTEntity>>;
  satellitesRef: React.MutableRefObject<Map<string, CoTEntity>>;
  cablesData: FeatureCollection | null;
  stationsData: FeatureCollection | null;
  outagesData: FeatureCollection | null;
  worldCountriesData: FeatureCollection | null;
  showTerminator: boolean;
  drStateRef: React.MutableRefObject<Map<string, DRState>>;
  gdeltData: FeatureCollection | null;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  events,
  trackCounts,
  missionProps,
  entitiesRef,
  satellitesRef,
  cablesData,
  stationsData,
  outagesData,
  worldCountriesData,
  showTerminator,
  drStateRef,
  gdeltData,
}) => {
  const mission = missionProps?.currentMission ?? null;
  const obsLat = mission?.lat ?? 45.5152;
  const obsLon = mission?.lon ?? -122.6784;

  const [passCategory, setPassCategory] = useState<PassCategory>("intel");
  const [rfEmcomm, setRfEmcomm] = useState<{
    count: number;
    results: RFSiteResult[];
  }>({ count: 0, results: [] });
  const [trackHistory, setTrackHistory] = useState<
    { air: number; sea: number; orbital: number }[]
  >([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  // Keep a ref to trackCounts so the sparkline interval reads the latest value
  const trackCountsRef = useRef(trackCounts);
  useEffect(() => {
    trackCountsRef.current = trackCounts;
  }, [trackCounts]);

  // Pass predictions — single hook, category swaps on tab change
  const { passes, loading: passesLoading } = usePassPredictions(
    obsLat,
    obsLon,
    {
      category: passCategory,
      hours: passCategory === "gps" ? 4 : 6,
      minElevation: 10,
      skip: !mission,
    },
  );

  // ── Fetch RF EmComm sites when mission changes ──
  useEffect(() => {
    if (!mission) return;
    const load = async () => {
      try {
        const params = new URLSearchParams({
          lat: String(mission.lat),
          lon: String(mission.lon),
          radius_nm: String(mission.radius_nm),
          emcomm_only: "true",
        });
        const r = await fetch(`/api/rf/sites?${params}`);
        if (r.ok) setRfEmcomm(await r.json());
      } catch {
        /* non-critical */
      }
    };
    load();
  }, [mission]);

  // ── Sample track counts every 30s for sparkline ──
  useEffect(() => {
    const sample = () =>
      setTrackHistory((h) => [...h.slice(-19), { ...trackCountsRef.current }]);
    sample();
    const t = setInterval(sample, 30_000);
    return () => clearInterval(t);
  }, []);

  // ── Derived ──
  const alerts = events.filter((e) => e.type === "alert").slice(0, 20);
  const intelEvents = events.filter((e) => e.type !== "alert").slice(0, 30);
  const [selectedGdelt, setSelectedGdelt] = useState<any | null>(null);
  const [hoveredGdelt, setHoveredGdelt] = useState<any | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const conflictCount = useMemo(() => {
    if (!gdeltData?.features) return 0;
    return gdeltData.features.filter((f: any) => (f.properties?.tone ?? 0) <= -5)
      .length;
  }, [gdeltData]);

  const fmtTime = (d: Date) => d.toISOString().split("T")[1].substring(0, 8);
  const fmtPassTime = (iso: string) =>
    new Date(iso).toISOString().split("T")[1].substring(0, 5) + "Z";
  const untilPass = (iso: string) => {
    const diff = (new Date(iso).getTime() - now) / 60000;
    if (diff <= 0) return "NOW";
    if (diff < 60) return `${Math.round(diff)}m`;
    return `${Math.floor(diff / 60)}h${Math.round(diff % 60)}m`;
  };

  const entityIcon = (type?: string) => {
    if (type === "air")
      return <Plane size={9} className="text-hud-green flex-shrink-0" />;
    if (type === "sea")
      return <Ship size={9} className="text-cyan-400 flex-shrink-0" />;
    if (type === "orbital")
      return <Satellite size={9} className="text-purple-400 flex-shrink-0" />;
    return <Activity size={9} className="text-white/30 flex-shrink-0" />;
  };

  const passCategoryLabel: Record<PassCategory, string> = {
    intel: "INTEL",
    weather: "WEATHER",
    gps: "GPS",
  };
  const passCategoryAccent: Record<PassCategory, string> = {
    intel: "text-purple-300 border-purple-500/30 bg-purple-500/10",
    weather: "text-sky-300 border-sky-500/30 bg-sky-500/10",
    gps: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  };
  const passCategoryInactive =
    "text-white/20 border-transparent hover:text-white/40 hover:bg-white/5";

  return (
    <div className="w-full h-full pt-[55px] bg-tactical-bg text-hud-green font-mono flex flex-col overflow-hidden">
      {/* ── Stats Bar ── */}
      <div className="flex items-center gap-4 px-4 py-1.5 bg-black/70 border-b border-white/5 flex-shrink-0 flex-wrap">
        {/* Mission area */}
        <div className="flex items-center gap-1.5">
          <Globe size={10} className="text-hud-green/50" />
          <span className="text-[9px] text-white/35 uppercase tracking-widest">
            AO
          </span>
          <span className="text-[10px] text-hud-green tabular-nums">
            {mission
              ? `${Math.abs(mission.lat).toFixed(3)}°${mission.lat >= 0 ? "N" : "S"} / ${Math.abs(mission.lon).toFixed(3)}°${mission.lon >= 0 ? "E" : "W"} / ${mission.radius_nm}NM`
              : "—"}
          </span>
        </div>
        <div className="h-3 w-px bg-white/10" />

        {/* Track counts */}
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[10px]">
            <Plane size={10} className="text-hud-green" />
            <span className="text-white/35">AIR</span>
            <span className="text-hud-green font-bold tabular-nums">
              {trackCounts.air}
            </span>
          </span>
          <span className="flex items-center gap-1 text-[10px]">
            <Ship size={10} className="text-cyan-400" />
            <span className="text-white/35">SEA</span>
            <span className="text-cyan-400 font-bold tabular-nums">
              {trackCounts.sea}
            </span>
          </span>
          <span className="flex items-center gap-1 text-[10px]">
            <Satellite size={10} className="text-purple-400" />
            <span className="text-white/35">ORB</span>
            <span className="text-purple-400 font-bold tabular-nums">
              {trackCounts.orbital}
            </span>
          </span>
        </div>

        {/* Sparkline */}
        <div
          className="flex items-center gap-1.5"
          title="30-second track count history (green=air, cyan=sea)"
        >
          <TrendingUp size={9} className="text-white/20" />
          <TrackSparkline data={trackHistory} />
        </div>
        <div className="h-3 w-px bg-white/10" />

        {/* Stream health dots */}
        <StreamStatusMonitor />
        <div className="h-3 w-px bg-white/10" />

        {/* RF EmComm count */}
        <div
          className="flex items-center gap-1.5"
          title="EmComm sites in mission area"
        >
          <Antenna size={10} className="text-amber-400/60" />
          <span className="text-[9px] text-white/35">EMCOMM</span>
          <span className="text-[10px] text-amber-300 font-bold">
            {rfEmcomm.count}
          </span>
        </div>

        {/* Alerts badge */}
        {alerts.length > 0 && (
          <>
            <div className="h-3 w-px bg-white/10" />
            <div className="flex items-center gap-1.5">
              <AlertTriangle
                size={10}
                className="text-alert-red animate-pulse"
              />
              <span className="text-[10px] text-alert-red font-bold">
                {alerts.length} ALERT{alerts.length !== 1 ? "S" : ""}
              </span>
            </div>
          </>
        )}

        <span className="ml-auto text-[8px] text-white/15 uppercase tracking-widest hidden xl:block">
          DASHBOARD // SITUATIONAL AWARENESS
        </span>
      </div>

      {/* ── Main 3-column grid ── */}
      <div
        className="flex-1 grid min-h-0 overflow-hidden"
        style={{ gridTemplateColumns: "265px 1fr 265px" }}
      >
        {/* Left — Alerts + Intel Feed */}
        <div className="flex flex-col border-r border-white/5 min-h-0 overflow-hidden">
          <div
            className="flex flex-col border-b border-white/5 overflow-hidden"
            style={{ flex: "0 0 40%" }}
          >
            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/50 border-b border-white/5 flex-shrink-0">
              <AlertTriangle
                size={12}
                className={
                  alerts.length > 0 ? "text-alert-red" : "text-white/20"
                }
              />
              <span className="text-[10px] font-bold tracking-widest uppercase text-white/55">
                Alerts
              </span>
              {alerts.length > 0 && (
                <span className="ml-auto text-[10px] bg-alert-red/20 text-alert-red border border-alert-red/30 rounded px-1 font-bold">
                  {alerts.length}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="flex items-center justify-center h-10 text-[10px] text-white/15 uppercase tracking-widest">
                  No Active Alerts
                </div>
              ) : (
                alerts.map((ev) => (
                  <div
                    key={ev.id}
                    className="px-3 py-1.5 border-b border-white/[0.03] hover:bg-white/5"
                  >
                    <div className="flex items-start gap-1.5">
                      <span className="text-[8px] text-alert-red mt-0.5 flex-shrink-0">
                        ▶
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] text-alert-red leading-snug">
                          {ev.message}
                        </p>
                        <span className="text-[8px] text-white/25">
                          {fmtTime(ev.time)}Z
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/50 border-b border-white/5 flex-shrink-0">
              <Activity size={11} className="text-hud-green/50" />
              <span className="text-[10px] font-bold tracking-widest uppercase text-white/55">
                Intel Feed
              </span>
              <span className="ml-auto text-[8px] text-white/20 tabular-nums">
                {intelEvents.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {intelEvents.length === 0 ? (
                <div className="flex items-center justify-center h-10 text-[9px] text-white/15 uppercase tracking-widest">
                  Awaiting Data
                </div>
              ) : (
                intelEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="px-3 py-1 border-b border-white/[0.03] hover:bg-white/5"
                  >
                    <div className="flex items-center gap-1.5">
                      {entityIcon(ev.entityType)}
                      <span
                        className={`text-[9px] flex-1 min-w-0 truncate ${ev.type === "new" ? "text-hud-green/75" : "text-white/35"}`}
                      >
                        {ev.message}
                      </span>
                      <span className="text-[8px] text-white/20 flex-shrink-0 tabular-nums">
                        {fmtTime(ev.time)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Center — Split Map View (Tactical AO vs Global Situation) */}
        <div className="relative overflow-hidden bg-black min-h-0 grid grid-cols-2">
          {/* Tactical Left */}
          <div className="relative border-r border-white/5 overflow-hidden">
            {mission ? (
              <MiniTacticalMap
                mission={mission}
                entitiesRef={entitiesRef}
                satellitesRef={satellitesRef}
                rfSites={rfEmcomm.results}
              />
            ) : (
              <div className="flex flex-col items-center justify-center w-full h-full gap-3">
                <Signal size={28} className="text-white/10" />
                <span className="text-[10px] text-white/20 uppercase tracking-widest">
                  Awaiting Mission Area
                </span>
              </div>
            )}
            <div className="absolute top-2 left-2 text-[8px] text-hud-green/35 bg-black/70 px-1.5 py-0.5 rounded tracking-widest pointer-events-none select-none border border-hud-green/20">
              TACTICAL OVERVIEW
            </div>

            {/* Track Counters */}
            <div className="absolute bottom-2 left-2 flex gap-1 pointer-events-none z-10 animate-in fade-in slide-in-from-right-2 duration-700">
              <span className="text-[8px] bg-black/80 text-hud-green px-1.5 py-0.5 rounded border border-hud-green/20">
                AIR {trackCounts.air}
              </span>
              <span className="text-[8px] bg-black/80 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-400/20">
                SEA {trackCounts.sea}
              </span>
              <span className="text-[8px] bg-black/80 text-purple-400 px-1.5 py-0.5 rounded border border-purple-400/20">
                ORB {trackCounts.orbital}
              </span>
              <span className="text-[8px] bg-black/80 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20">
                RF {rfEmcomm.count}
              </span>
            </div>
          </div>

          {/* Global Right */}
          <SituationGlobe
            satellitesRef={satellitesRef}
            cablesData={cablesData}
            stationsData={stationsData}
            outagesData={outagesData}
            worldCountriesData={worldCountriesData}
            showTerminator={showTerminator}
            drStateRef={drStateRef}
            mission={missionProps?.currentMission ?? null}
            onGdeltClick={setSelectedGdelt}
            onHover={(entity, pos) => {
              setHoveredGdelt(entity);
              if (pos) setHoverPos(pos);
            }}
          />

          {/* Situation Globe Tooltip (Heads-up Display) */}
          {hoveredGdelt && hoverPos && (
            <div
              className="absolute z-50 pointer-events-none p-3 bg-black/90 border border-hud-green/30 rounded backdrop-blur-md shadow-2xl animate-in zoom-in-95 duration-200"
              style={{
                left: hoverPos.x + 15,
                top: hoverPos.y - 40,
                minWidth: "200px",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Signal size={12} className="text-hud-green animate-pulse" />
                  <span className="text-[11px] font-black tracking-tighter uppercase text-white">
                    {hoveredGdelt.callsign}
                  </span>
                </div>
                <div className="flex items-center gap-1 bg-hud-green/10 px-1 py-0.5 rounded">
                  <div className="h-1.5 w-1.5 rounded-full bg-hud-green" />
                  <span className="text-[7px] text-hud-green font-bold">OSINT</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="border-t border-white/5 pt-2">
                  <span className="text-[8px] text-white/30 uppercase tracking-widest block mb-0.5">Source Domain</span>
                  <span className="text-[10px] text-hud-green font-bold uppercase">{hoveredGdelt.detail?.domain || "Open Source"}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <span className="text-[8px] text-white/30 uppercase tracking-widest block mb-0.5">Tone (GS)</span>
                    <span className={`text-[11px] font-mono font-bold ${hoveredGdelt.detail?.tone < -2 ? 'text-red-400' : 'text-hud-green'}`}>
                      {hoveredGdelt.detail?.tone?.toFixed(1)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[8px] text-white/30 uppercase tracking-widest block mb-0.5">Status</span>
                    <span className={`text-[9px] font-black uppercase ${hoveredGdelt.detail?.tone < -2 ? 'text-red-500' : 'text-hud-green'}`}>
                      {hoveredGdelt.detail?.tone <= -5 ? 'CONFL' : hoveredGdelt.detail?.tone <= -2 ? 'UNSTABLE' : 'STABLE'}
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="text-[8px] text-white/30 uppercase tracking-widest block mb-0.5">Data Source</span>
                  <p className="text-[9px] text-white/60 font-medium leading-tight">GDELT GLOBAL EVENT MONITOR</p>
                </div>
              </div>

              <div className="mt-4 pt-2 border-t border-white/10 flex items-center gap-2 opacity-50">
                <Globe size={10} className="text-white/40" />
                <span className="text-[7px] text-white/40 uppercase font-black">SELECT FOR DETAILS</span>
              </div>
            </div>
          )}
        </div>

        {/* Right — Global Stability */}
        <div className="flex flex-col border-l border-white/5 min-h-0 overflow-hidden">
          {selectedGdelt ? (
            <div className="flex flex-col flex-1 bg-black/40">
              <div className="p-4 border-b border-white/5 bg-red-500/5">
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={() => setSelectedGdelt(null)}
                    className="text-[9px] font-bold text-white/30 hover:text-white flex items-center gap-1 transition-colors uppercase tracking-widest"
                  >
                    <Signal size={10} className="rotate-180" /> Back to Matrix
                  </button>
                  <div className="px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-[8px] text-red-400 font-bold animate-pulse">
                    LIVE EVENT
                  </div>
                </div>

                <h3 className="text-sm font-black text-white uppercase tracking-tight leading-none mb-1">
                  {selectedGdelt.name}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-red-500 font-bold uppercase">{selectedGdelt.domain}</span>
                  <div className="h-1 w-1 rounded-full bg-white/20" />
                  <span className="text-[10px] text-white/40 font-mono">
                    LAT: {selectedGdelt.lat.toFixed(4)} LON: {selectedGdelt.lon.toFixed(4)}
                  </span>
                </div>
              </div>

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/[0.03] border border-white/5 p-3 rounded">
                    <span className="text-[9px] text-white/30 block mb-1 uppercase tracking-widest">Stability (GS)</span>
                    <span className={`text-2xl font-black tabular-nums ${selectedGdelt.tone < -2 ? 'text-red-500' : 'text-hud-green'}`}>
                      {selectedGdelt.tone.toFixed(2)}
                    </span>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 p-3 rounded">
                    <span className="text-[9px] text-white/30 block mb-1 uppercase tracking-widest">Alert Level</span>
                    <span className={`text-xs font-bold ${selectedGdelt.tone <= -5 ? 'text-red-500' : 'text-amber-500'} uppercase`}>
                      {selectedGdelt.tone <= -5 ? 'Critical Conflict' : 'Rising Tension'}
                    </span>
                  </div>
                </div>

                <div className="bg-white/[0.02] p-4 rounded border border-white/5">
                  <span className="text-[10px] text-white font-bold block mb-2 uppercase tracking-tight">Intelligence Source</span>
                  <p className="text-[11px] text-white/60 leading-relaxed mb-4">
                    Direct monitoring of geolocated news reporting originating from {selectedGdelt.domain}.
                    The Goldstein scale assessment shows a persistent focus on localized instability.
                  </p>
                  <a
                    href={selectedGdelt.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 bg-hud-green text-black font-black text-[10px] py-2.5 rounded hover:bg-white transition-all uppercase tracking-widest"
                  >
                    Access Intel Stream <Globe size={12} />
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <GdeltBreakdownWidget gdeltData={gdeltData} />
          )}

          <OutageAlertPanel />
        </div>
      </div>

      {/* ── Bottom 3-panel row ── */}
      <div
        className="flex-shrink-0 border-t border-white/5 grid min-h-0"
        style={{ height: "200px", gridTemplateColumns: "1fr 1fr 1fr" }}
      >
        {/* Orbital Passes with category tabs */}
        <div className="flex flex-col border-r border-white/5 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/50 border-b border-white/5 flex-shrink-0">
            <Satellite size={11} className="text-purple-400 flex-shrink-0" />
            {(["intel", "weather", "gps"] as PassCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => setPassCategory(cat)}
                className={`text-[8px] font-bold tracking-widest uppercase px-1.5 py-0 rounded-sm border transition-all ${passCategory === cat ? passCategoryAccent[cat] : passCategoryInactive}`}
              >
                {passCategoryLabel[cat]}
              </button>
            ))}
            <span className="ml-auto text-[8px] text-white/25">
              {passes.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {passesLoading ? (
              <div className="flex items-center justify-center h-10 text-[9px] text-white/20 animate-pulse">
                CALCULATING…
              </div>
            ) : passes.length === 0 ? (
              <div className="flex items-center justify-center h-10 text-[9px] text-white/15 uppercase tracking-widest">
                No Passes in Window
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-px bg-white/[0.03]">
                {passes.slice(0, 18).map((pass, i) => {
                  const isNow = untilPass(pass.aos) === "NOW";
                  const accentColor =
                    passCategory === "intel"
                      ? "text-purple-400"
                      : passCategory === "weather"
                        ? "text-sky-400"
                        : "text-emerald-400";
                  const accentColorMuted =
                    passCategory === "intel"
                      ? "text-purple-400/70"
                      : passCategory === "weather"
                        ? "text-sky-400/70"
                        : "text-emerald-400/70";
                  const accentBg =
                    passCategory === "intel"
                      ? "bg-purple-500/5"
                      : passCategory === "weather"
                        ? "bg-sky-500/5"
                        : "bg-emerald-500/5";

                  return (
                    <div
                      key={`${pass.norad_id}-${i}`}
                      className={`p-2 border-b border-white/[0.02] hover:bg-white/5 transition-all group flex flex-col justify-between min-h-[55px] ${isNow ? accentBg : "bg-black/40"}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-[9px] font-bold truncate mr-1 ${accentColor}`}
                        >
                          {pass.name.length > 15
                            ? pass.name.substring(0, 12) + "…"
                            : pass.name}
                        </span>
                        <span className="text-[7px] text-white/15 tabular-nums">
                          {pass.norad_id.toString().slice(-5)}
                        </span>
                      </div>

                      <div className="flex items-end justify-between">
                        <div className="flex flex-col gap-px">
                          <span className="text-[7px] text-white/30 uppercase tracking-tighter">
                            EL {Math.round(pass.max_elevation)}° •{" "}
                            {Math.round(pass.duration_seconds / 60)}m
                          </span>
                          <span className="text-[7px] text-white/20 tabular-nums">
                            {fmtPassTime(pass.aos)}
                          </span>
                        </div>
                        <span
                          className={`text-[8px] font-bold tabular-nums ${isNow ? "text-white animate-pulse" : accentColorMuted}`}
                        >
                          {untilPass(pass.aos)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RF EmComm Sites */}
        <RFSiteSearchPanel count={rfEmcomm.count} results={rfEmcomm.results} />

        {/* News Feed */}
        <div className="flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/50 border-b border-white/5 flex-shrink-0">
            <Newspaper size={11} className="text-hud-green/50" />
            <span className="text-[10px] font-bold tracking-widest uppercase text-white/55">
              OSINT News
            </span>
            {conflictCount > 0 && (
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-[8px] font-bold text-red-400 bg-red-400/10 border border-red-400/20 px-1.5 py-px rounded-sm animate-pulse whitespace-nowrap">
                  {conflictCount} CONFLICTS IN AO
                </span>
              </div>
            )}
          </div>
          <NewsWidget compact />
        </div>
      </div>
    </div>
  );
};

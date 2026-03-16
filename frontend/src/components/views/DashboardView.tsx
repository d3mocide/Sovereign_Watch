import React, { useEffect, useRef, useCallback, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  AlertTriangle,
  Radio,
  Satellite,
  Activity,
  Plane,
  Ship,
  Signal,
  Wifi,
  WifiOff,
  Globe,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Antenna,
  TrendingUp,
} from 'lucide-react';
import {
  CoTEntity,
  IntelEvent,
  JS8LogEntry,
  JS8Station,
  MissionProps,
} from '../../types';
import { SystemHealth } from '../../hooks/useSystemHealth';
import { usePassPredictions } from '../../hooks/usePassPredictions';
import { calculateZoom } from '../../utils/map/geoUtils';
import { NewsWidget } from '../widgets/NewsWidget';

const DARK_MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StreamStatus {
  id: string;
  name: string;
  status: string;
}

interface OutageItem {
  country: string;
  country_code: string;
  severity: number;
}

interface RFSiteResult {
  id: string;
  callsign: string;
  name: string;
  service: string;
  emcomm_flags: string[] | null;
  city: string | null;
  state: string | null;
  modes: string[];
}

type TrackSnapshot = { air: number; sea: number; orbital: number };
type PassCategory = 'intel' | 'weather' | 'gps';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STREAM_ABBR: Record<string, string> = {
  aviation: 'ADSB',
  maritime: 'AIS',
  orbital: 'ORB',
  repeaterbook: 'RBOOK',
  radioref: 'RREF',
  rf_public: 'RF',
  ai: 'AI',
};

function streamDotClass(status: string): string {
  if (status === 'Active') return 'bg-hud-green shadow-[0_0_4px_#00ff41]';
  if (status === 'Missing Key') return 'bg-amber-400 shadow-[0_0_4px_#fbbf24]';
  return 'bg-white/20';
}

function streamTextClass(status: string): string {
  if (status === 'Active') return 'text-hud-green';
  if (status === 'Missing Key') return 'text-amber-400';
  return 'text-white/25';
}

function severityColor(s: number): string {
  if (s >= 60) return 'text-alert-red';
  if (s >= 25) return 'text-amber-400';
  return 'text-yellow-300';
}

function severityBarClass(s: number): string {
  if (s >= 60) return 'bg-alert-red';
  if (s >= 25) return 'bg-amber-400';
  return 'bg-yellow-300';
}

const EMCOMM_BADGE: Record<string, string> = {
  ARES: 'bg-blue-600/30 text-blue-300 border-blue-500/30',
  RACES: 'bg-green-700/30 text-green-300 border-green-500/30',
  SKYWARN: 'bg-yellow-600/30 text-yellow-200 border-yellow-500/30',
  CERT: 'bg-orange-600/30 text-orange-300 border-orange-500/30',
  WICEN: 'bg-purple-600/30 text-purple-300 border-purple-500/30',
};

// ─── Mini Sparkline ───────────────────────────────────────────────────────────

const Sparkline: React.FC<{
  data: TrackSnapshot[];
  width?: number;
  height?: number;
}> = ({ data, width = 96, height = 22 }) => {
  if (data.length < 2) {
    return (
      <svg width={width} height={height} className="opacity-20 flex-shrink-0">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="#00ff41" strokeWidth={1} />
      </svg>
    );
  }
  const maxAirSea = Math.max(1, ...data.map(d => Math.max(d.air, d.sea)));
  const pad = 2;
  const norm = (v: number, max: number) =>
    height - pad - ((v / max) * (height - pad * 2));
  const buildPath = (vals: number[], max: number) => {
    const step = width / (vals.length - 1);
    return vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${norm(v, max).toFixed(1)}`).join(' ');
  };
  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <path d={buildPath(data.map(d => d.air), maxAirSea)} stroke="#00ff41" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={buildPath(data.map(d => d.sea), maxAirSea)} stroke="#22d3ee" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ─── Mini Tactical Map ────────────────────────────────────────────────────────

function makeMissionCircle(
  lat: number,
  lon: number,
  radiusNm: number,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const NM_TO_DEG = 1 / 60;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const safeCos = Math.max(Math.abs(cosLat), 0.0001);
  const N = 128;
  const coords: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * 2 * Math.PI;
    coords.push([lon + ((radiusNm * NM_TO_DEG) / safeCos) * Math.sin(a), lat + radiusNm * NM_TO_DEG * Math.cos(a)]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} };
}

interface MiniMapProps {
  mission: { lat: number; lon: number; radius_nm: number };
  entitiesRef: React.MutableRefObject<Map<string, CoTEntity>>;
  satellitesRef: React.MutableRefObject<Map<string, CoTEntity>>;
}

const MiniTacticalMap: React.FC<MiniMapProps> = ({ mission, entitiesRef, satellitesRef }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const zoom = Math.max(2, calculateZoom(mission.radius_nm) - 1.0);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_MAP_STYLE,
      center: [mission.lon, mission.lat],
      zoom,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;
    map.on('load', () => {
      const circle = makeMissionCircle(mission.lat, mission.lon, mission.radius_nm);
      map.addSource('mission-circle', { type: 'geojson', data: circle });
      map.addLayer({ id: 'mission-fill', type: 'fill', source: 'mission-circle', paint: { 'fill-color': '#00ff41', 'fill-opacity': 0.05 } });
      map.addLayer({ id: 'mission-border', type: 'line', source: 'mission-circle', paint: { 'line-color': '#00ff41', 'line-width': 1.5, 'line-opacity': 0.7 } });
      map.addSource('entities', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'ent-air', type: 'circle', source: 'entities', filter: ['==', ['get', 'etype'], 'air'], paint: { 'circle-radius': 2.5, 'circle-color': '#00ff41', 'circle-opacity': 0.85 } });
      map.addLayer({ id: 'ent-sea', type: 'circle', source: 'entities', filter: ['==', ['get', 'etype'], 'sea'], paint: { 'circle-radius': 2.5, 'circle-color': '#22d3ee', 'circle-opacity': 0.85 } });
      map.addSource('orbital', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'ent-orbital', type: 'circle', source: 'orbital', paint: { 'circle-radius': 2, 'circle-color': '#a855f7', 'circle-opacity': 0.6 } });
      mapReadyRef.current = true;
    });
    return () => { mapReadyRef.current = false; map.remove(); mapRef.current = null; };
  }, [mission.lat, mission.lon, mission.radius_nm]);

  const updateLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    const airSea: GeoJSON.Feature[] = [];
    entitiesRef.current.forEach(e => {
      airSea.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lon, e.lat] }, properties: { etype: e.vesselClassification !== undefined ? 'sea' : 'air' } });
    });
    const orb: GeoJSON.Feature[] = [];
    satellitesRef.current.forEach(e => {
      orb.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lon, e.lat] }, properties: {} });
    });
    (map.getSource('entities') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: airSea });
    (map.getSource('orbital') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: orb });
  }, [entitiesRef, satellitesRef]);

  useEffect(() => {
    const t0 = setTimeout(updateLayers, 1500);
    const ti = setInterval(updateLayers, 5000);
    return () => { clearTimeout(t0); clearInterval(ti); };
  }, [updateLayers]);

  return <div ref={containerRef} className="w-full h-full" />;
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────

interface DashboardViewProps {
  events: IntelEvent[];
  trackCounts: { air: number; sea: number; orbital: number };
  missionProps: MissionProps | null;
  health: SystemHealth;
  js8LogEntries: JS8LogEntry[];
  js8Stations: JS8Station[];
  js8Connected: boolean;
  entitiesRef: React.MutableRefObject<Map<string, CoTEntity>>;
  satellitesRef: React.MutableRefObject<Map<string, CoTEntity>>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  events,
  trackCounts,
  missionProps,
  health,
  js8LogEntries,
  js8Stations,
  js8Connected,
  entitiesRef,
  satellitesRef,
}) => {
  const mission = missionProps?.currentMission ?? null;
  const obsLat = mission?.lat ?? 45.5152;
  const obsLon = mission?.lon ?? -122.6784;

  // ── New state ──
  const [passCategory, setPassCategory] = useState<PassCategory>('intel');
  const [streamStatuses, setStreamStatuses] = useState<StreamStatus[]>([]);
  const [outages, setOutages] = useState<OutageItem[]>([]);
  const [rfEmcomm, setRfEmcomm] = useState<{ count: number; results: RFSiteResult[] }>({ count: 0, results: [] });
  const [trackHistory, setTrackHistory] = useState<TrackSnapshot[]>([]);

  // Keep a ref to trackCounts so the sparkline interval reads the latest value
  const trackCountsRef = useRef(trackCounts);
  useEffect(() => { trackCountsRef.current = trackCounts; }, [trackCounts]);

  // Pass predictions — single hook, category swaps on tab change
  const { passes, loading: passesLoading } = usePassPredictions(obsLat, obsLon, {
    category: passCategory,
    hours: passCategory === 'gps' ? 4 : 6,
    minElevation: 10,
    skip: !mission,
  });

  // ── Fetch stream health (60s refresh) ──
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/config/streams');
        if (r.ok) setStreamStatuses(await r.json());
      } catch { /* non-critical */ }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  // ── Fetch internet outages (30min refresh) ──
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/infra/outages');
        if (r.ok) {
          const geojson = await r.json();
          const items: OutageItem[] = (geojson.features ?? [])
            .map((f: { properties: { country: string; country_code: string; severity: number } }) => ({
              country: f.properties.country,
              country_code: f.properties.country_code,
              severity: f.properties.severity,
            }))
            .sort((a: OutageItem, b: OutageItem) => b.severity - a.severity)
            .slice(0, 20);
          setOutages(items);
        }
      } catch { /* non-critical */ }
    };
    load();
    const t = setInterval(load, 30 * 60_000);
    return () => clearInterval(t);
  }, []);

  // ── Fetch RF EmComm sites when mission changes ──
  useEffect(() => {
    if (!mission) return;
    const load = async () => {
      try {
        const params = new URLSearchParams({
          lat: String(mission.lat),
          lon: String(mission.lon),
          radius_nm: String(mission.radius_nm),
          emcomm_only: 'true',
        });
        const r = await fetch(`/api/rf/sites?${params}`);
        if (r.ok) setRfEmcomm(await r.json());
      } catch { /* non-critical */ }
    };
    load();
  }, [mission?.lat, mission?.lon, mission?.radius_nm]);

  // ── Sample track counts every 30s for sparkline ──
  useEffect(() => {
    const sample = () => setTrackHistory(h => [...h.slice(-19), { ...trackCountsRef.current }]);
    sample();
    const t = setInterval(sample, 30_000);
    return () => clearInterval(t);
  }, []);

  // ── Derived ──
  const alerts = events.filter(e => e.type === 'alert').slice(0, 20);
  const intelEvents = events.filter(e => e.type !== 'alert').slice(0, 30);
  const healthOnline = health?.status === 'online';

  const fmtTime = (d: Date) => d.toISOString().split('T')[1].substring(0, 8);
  const fmtPassTime = (iso: string) => new Date(iso).toISOString().split('T')[1].substring(0, 5) + 'Z';
  const untilPass = (iso: string) => {
    const diff = (new Date(iso).getTime() - Date.now()) / 60000;
    if (diff <= 0) return 'NOW';
    if (diff < 60) return `${Math.round(diff)}m`;
    return `${Math.floor(diff / 60)}h${Math.round(diff % 60)}m`;
  };

  const entityIcon = (type?: string) => {
    if (type === 'air') return <Plane size={9} className="text-hud-green flex-shrink-0" />;
    if (type === 'sea') return <Ship size={9} className="text-cyan-400 flex-shrink-0" />;
    if (type === 'orbital') return <Satellite size={9} className="text-purple-400 flex-shrink-0" />;
    return <Activity size={9} className="text-white/30 flex-shrink-0" />;
  };

  const streamIcon = (status: string) => {
    if (status === 'Active') return <CheckCircle2 size={9} className="text-hud-green" />;
    if (status === 'Missing Key') return <AlertCircle size={9} className="text-amber-400" />;
    return <XCircle size={9} className="text-white/25" />;
  };

  const passCategoryLabel: Record<PassCategory, string> = { intel: 'INTEL', weather: 'WEATHER', gps: 'GPS' };
  const passCategoryAccent: Record<PassCategory, string> = {
    intel: 'text-purple-300 border-purple-500/50 bg-purple-500/20',
    weather: 'text-sky-300 border-sky-500/50 bg-sky-500/20',
    gps: 'text-emerald-300 border-emerald-500/50 bg-emerald-500/20',
  };
  const passCategoryInactive = 'text-white/30 border-transparent hover:text-white/60 hover:bg-white/5';

  return (
    <div className="w-full h-full pt-[55px] bg-tactical-bg text-hud-green font-mono flex flex-col overflow-hidden">

      {/* ── Stats Bar ── */}
      <div className="flex items-center gap-4 px-4 py-1.5 bg-black/70 border-b border-white/5 flex-shrink-0 flex-wrap">

        {/* Mission area */}
        <div className="flex items-center gap-1.5">
          <Globe size={10} className="text-hud-green/50" />
          <span className="text-[9px] text-white/35 uppercase tracking-widest">AO</span>
          <span className="text-[10px] text-hud-green tabular-nums">
            {mission
              ? `${Math.abs(mission.lat).toFixed(3)}°${mission.lat >= 0 ? 'N' : 'S'} / ${Math.abs(mission.lon).toFixed(3)}°${mission.lon >= 0 ? 'E' : 'W'} / ${mission.radius_nm}NM`
              : '—'}
          </span>
        </div>
        <div className="h-3 w-px bg-white/10" />

        {/* Track counts */}
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[10px]">
            <Plane size={10} className="text-hud-green" />
            <span className="text-white/35">AIR</span>
            <span className="text-hud-green font-bold tabular-nums">{trackCounts.air}</span>
          </span>
          <span className="flex items-center gap-1 text-[10px]">
            <Ship size={10} className="text-cyan-400" />
            <span className="text-white/35">SEA</span>
            <span className="text-cyan-400 font-bold tabular-nums">{trackCounts.sea}</span>
          </span>
          <span className="flex items-center gap-1 text-[10px]">
            <Satellite size={10} className="text-purple-400" />
            <span className="text-white/35">ORB</span>
            <span className="text-purple-400 font-bold tabular-nums">{trackCounts.orbital}</span>
          </span>
        </div>

        {/* Sparkline */}
        <div className="flex items-center gap-1.5" title="30-second track count history (green=air, cyan=sea)">
          <TrendingUp size={9} className="text-white/20" />
          <Sparkline data={trackHistory} />
        </div>
        <div className="h-3 w-px bg-white/10" />

        {/* Stream health dots */}
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] text-white/25 uppercase tracking-widest">Streams</span>
          <div className="flex items-center gap-1">
            {streamStatuses.length === 0 ? (
              <span className="text-[8px] text-white/15">—</span>
            ) : (
              streamStatuses.map(s => (
                <div
                  key={s.id}
                  className="flex items-center gap-0.5"
                  title={`${s.name}: ${s.status}`}
                >
                  <div className={`h-1.5 w-1.5 rounded-full ${streamDotClass(s.status)}`} />
                  <span className={`text-[7px] ${streamTextClass(s.status)}`}>
                    {STREAM_ABBR[s.id] ?? s.id.toUpperCase()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="h-3 w-px bg-white/10" />

        {/* System health */}
        <div className="flex items-center gap-1.5">
          {healthOnline ? <Wifi size={10} className="text-hud-green" /> : <WifiOff size={10} className="text-alert-red" />}
          <span className={`text-[10px] font-bold ${healthOnline ? 'text-hud-green' : 'text-alert-red'}`}>
            {health?.status?.toUpperCase() ?? '---'}
          </span>
          {healthOnline && <span className="text-[9px] text-white/30 tabular-nums">{health.latency}ms</span>}
        </div>
        <div className="h-3 w-px bg-white/10" />

        {/* RF EmComm count */}
        <div className="flex items-center gap-1.5" title="EmComm sites in mission area">
          <Antenna size={10} className="text-amber-400/60" />
          <span className="text-[9px] text-white/35">EMCOMM</span>
          <span className="text-[10px] text-amber-300 font-bold">{rfEmcomm.count}</span>
        </div>

        {/* Alerts badge */}
        {alerts.length > 0 && (
          <>
            <div className="h-3 w-px bg-white/10" />
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={10} className="text-alert-red animate-pulse" />
              <span className="text-[10px] text-alert-red font-bold">
                {alerts.length} ALERT{alerts.length !== 1 ? 'S' : ''}
              </span>
            </div>
          </>
        )}

        <span className="ml-auto text-[8px] text-white/15 uppercase tracking-widest hidden xl:block">
          DASHBOARD // SITUATIONAL AWARENESS
        </span>
      </div>

      {/* ── Main 3-column grid ── */}
      <div className="flex-1 grid min-h-0 overflow-hidden" style={{ gridTemplateColumns: '265px 1fr 265px' }}>

        {/* Left — Alerts + Intel Feed */}
        <div className="flex flex-col border-r border-white/5 min-h-0 overflow-hidden">

          <div className="flex flex-col border-b border-white/5 overflow-hidden" style={{ flex: '0 0 40%' }}>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/50 border-b border-white/5 flex-shrink-0">
              <AlertTriangle size={11} className={alerts.length > 0 ? 'text-alert-red' : 'text-white/20'} />
              <span className="text-[8px] font-bold tracking-widest uppercase text-white/55">Alerts</span>
              {alerts.length > 0 && (
                <span className="ml-auto text-[8px] bg-alert-red/20 text-alert-red border border-alert-red/30 rounded px-1 font-bold">
                  {alerts.length}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="flex items-center justify-center h-10 text-[9px] text-white/15 uppercase tracking-widest">
                  No Active Alerts
                </div>
              ) : (
                alerts.map(ev => (
                  <div key={ev.id} className="px-3 py-1.5 border-b border-white/[0.03] hover:bg-white/5">
                    <div className="flex items-start gap-1.5">
                      <span className="text-[8px] text-alert-red mt-0.5 flex-shrink-0">▶</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] text-alert-red leading-snug">{ev.message}</p>
                        <span className="text-[8px] text-white/25">{fmtTime(ev.time)}Z</span>
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
              <span className="text-[8px] font-bold tracking-widest uppercase text-white/55">Intel Feed</span>
              <span className="ml-auto text-[8px] text-white/20 tabular-nums">{intelEvents.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {intelEvents.length === 0 ? (
                <div className="flex items-center justify-center h-10 text-[9px] text-white/15 uppercase tracking-widest">
                  Awaiting Data
                </div>
              ) : (
                intelEvents.map(ev => (
                  <div key={ev.id} className="px-3 py-1 border-b border-white/[0.03] hover:bg-white/5">
                    <div className="flex items-center gap-1.5">
                      {entityIcon(ev.entityType)}
                      <span className={`text-[9px] flex-1 min-w-0 truncate ${ev.type === 'new' ? 'text-hud-green/75' : 'text-white/35'}`}>
                        {ev.message}
                      </span>
                      <span className="text-[8px] text-white/20 flex-shrink-0 tabular-nums">{fmtTime(ev.time)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Center — Mini Tactical Map */}
        <div className="relative overflow-hidden bg-black min-h-0">
          {mission ? (
            <MiniTacticalMap mission={mission} entitiesRef={entitiesRef} satellitesRef={satellitesRef} />
          ) : (
            <div className="flex flex-col items-center justify-center w-full h-full gap-3">
              <Signal size={28} className="text-white/10" />
              <span className="text-[10px] text-white/20 uppercase tracking-widest">Awaiting Mission Area</span>
            </div>
          )}
          <div className="absolute top-2 left-2 text-[8px] text-hud-green/35 bg-black/70 px-1.5 py-0.5 rounded tracking-widest pointer-events-none select-none">
            TACTICAL OVERVIEW
          </div>
          <div className="absolute bottom-2 right-2 flex gap-1 pointer-events-none">
            <span className="text-[8px] bg-black/80 text-hud-green px-1.5 py-0.5 rounded border border-hud-green/20">AIR {trackCounts.air}</span>
            <span className="text-[8px] bg-black/80 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-400/20">SEA {trackCounts.sea}</span>
            <span className="text-[8px] bg-black/80 text-purple-400 px-1.5 py-0.5 rounded border border-purple-400/20">ORB {trackCounts.orbital}</span>
          </div>
          <div className="absolute bottom-2 left-2 flex flex-col gap-0.5 pointer-events-none">
            {[['#00ff41', 'AVIATION'], ['#22d3ee', 'MARITIME'], ['#a855f7', 'ORBITAL']].map(([c, l]) => (
              <div key={l} className="flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
                <span className="text-[7px] text-white/25">{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — JS8 Feed + Orbital Passes */}
        <div className="flex flex-col border-l border-white/5 min-h-0 overflow-hidden">

          {/* JS8 Feed */}
          <div className="flex flex-col border-b border-white/5 overflow-hidden" style={{ flex: '0 0 50%' }}>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/50 border-b border-white/5 flex-shrink-0">
              <Radio size={11} className={js8Connected ? 'text-hud-green' : 'text-white/20'} />
              <span className="text-[8px] font-bold tracking-widest uppercase text-white/55">JS8 / HF Radio</span>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[8px] text-white/25">{js8Stations.length} stations</span>
                <div className={`h-1.5 w-1.5 rounded-full ${js8Connected ? 'bg-hud-green shadow-[0_0_5px_#00ff41] animate-pulse' : 'bg-white/15'}`} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {js8LogEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-12 gap-1">
                  <span className="text-[9px] text-white/15 uppercase tracking-widest">No HF Activity</span>
                  {!js8Connected && <span className="text-[8px] text-white/10">JS8 bridge offline</span>}
                </div>
              ) : (
                [...js8LogEntries].reverse().slice(0, 30).map(entry => (
                  <div key={entry.id} className="px-3 py-1.5 border-b border-white/[0.03] hover:bg-white/5">
                    <div className="flex items-start gap-1.5">
                      <Radio size={8} className="text-hud-green/30 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          {entry.from && <span className="text-[9px] text-hud-green font-bold">{entry.from}</span>}
                          {entry.to && entry.to !== 'ALLCALL' && <span className="text-[9px] text-white/35">→ {entry.to}</span>}
                          {entry.snr !== undefined && (
                            <span className={`text-[8px] ml-auto ${entry.snr >= -18 ? 'text-emerald-400' : entry.snr >= -24 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {entry.snr}dB
                            </span>
                          )}
                        </div>
                        {entry.text && <p className="text-[9px] text-white/55 truncate leading-snug">{entry.text}</p>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Orbital Passes with category tabs */}
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-black/50 border-b border-white/5 flex-shrink-0">
              <Satellite size={11} className="text-purple-400 flex-shrink-0" />
              {(['intel', 'weather', 'gps'] as PassCategory[]).map(cat => (
                <button
                  key={cat}
                  onClick={() => setPassCategory(cat)}
                  className={`text-[8px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded border transition-all ${passCategory === cat ? passCategoryAccent[cat] : passCategoryInactive}`}
                >
                  {passCategoryLabel[cat]}
                </button>
              ))}
              <span className="ml-auto text-[8px] text-white/25">{passes.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {passesLoading ? (
                <div className="flex items-center justify-center h-10 text-[9px] text-white/20 animate-pulse">CALCULATING…</div>
              ) : passes.length === 0 ? (
                <div className="flex items-center justify-center h-10 text-[9px] text-white/15 uppercase tracking-widest">No Passes in Window</div>
              ) : (
                passes.slice(0, 15).map((pass, i) => (
                  <div key={`${pass.norad_id}-${i}`} className="px-3 py-1.5 border-b border-white/[0.03] hover:bg-white/5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-purple-300 font-bold truncate">{pass.name}</span>
                          <span className="text-[8px] text-white/20 flex-shrink-0">{pass.norad_id}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[8px] text-white/35">AOS {fmtPassTime(pass.aos)}</span>
                          <span className="text-[8px] text-purple-400/60">EL {Math.round(pass.max_elevation)}°</span>
                          <span className="text-[8px] text-white/35">{Math.round(pass.duration_seconds / 60)}min</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-purple-300 font-bold flex-shrink-0 tabular-nums">{untilPass(pass.aos)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom 3-panel row ── */}
      <div
        className="flex-shrink-0 border-t border-white/5 grid min-h-0"
        style={{ height: '200px', gridTemplateColumns: '1fr 1fr 1fr' }}
      >

        {/* Internet Outages */}
        <div className="flex flex-col border-r border-white/5 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/50 border-b border-white/5 flex-shrink-0">
            <Globe size={11} className="text-red-400/70" />
            <span className="text-[8px] font-bold tracking-widest uppercase text-white/55">Internet Outages</span>
            {outages.length > 0 && (
              <span className="ml-auto text-[8px] text-alert-red/60">{outages.length} regions</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {outages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[9px] text-white/15 uppercase tracking-widest">
                No Outages Detected
              </div>
            ) : (
              outages.map(o => (
                <div key={o.country_code} className="px-3 py-1.5 border-b border-white/[0.03] hover:bg-white/5">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-white/50 w-7 flex-shrink-0 tabular-nums font-bold">{o.country_code}</span>
                    <span className={`text-[9px] flex-1 truncate ${severityColor(o.severity)}`}>{o.country}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${severityBarClass(o.severity)}`}
                          style={{ width: `${Math.min(100, o.severity)}%` }}
                        />
                      </div>
                      <span className={`text-[8px] tabular-nums w-6 text-right ${severityColor(o.severity)}`}>
                        {Math.round(o.severity)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RF EmComm Sites */}
        <div className="flex flex-col border-r border-white/5 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/50 border-b border-white/5 flex-shrink-0">
            <Antenna size={11} className="text-amber-400/70" />
            <span className="text-[8px] font-bold tracking-widest uppercase text-white/55">EmComm Sites</span>
            <span className="ml-auto text-[8px] text-amber-400/60">{rfEmcomm.count} in AO</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {rfEmcomm.results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-1 text-center">
                <span className="text-[9px] text-white/15 uppercase tracking-widest">
                  {mission ? 'No EmComm Sites Found' : 'Awaiting Mission Area'}
                </span>
              </div>
            ) : (
              rfEmcomm.results.slice(0, 20).map(site => (
                <div key={site.id} className="px-3 py-1.5 border-b border-white/[0.03] hover:bg-white/5">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-amber-300 font-bold">{site.callsign}</span>
                        {site.city && (
                          <span className="text-[8px] text-white/30 truncate">{site.city}{site.state ? `, ${site.state}` : ''}</span>
                        )}
                      </div>
                      {site.emcomm_flags && site.emcomm_flags.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5 flex-wrap">
                          {site.emcomm_flags.map(flag => (
                            <span
                              key={flag}
                              className={`text-[7px] px-1 py-px rounded border font-bold ${EMCOMM_BADGE[flag] ?? 'bg-white/10 text-white/40 border-white/10'}`}
                            >
                              {flag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-[8px] text-white/20 flex-shrink-0">{(site.modes ?? []).join('/')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* News Feed */}
        <div className="flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/50 border-b border-white/5 flex-shrink-0">
            <span className="text-[8px] font-bold tracking-widest uppercase text-white/55">OSINT News</span>
          </div>
          <div className="flex-1 min-h-0">
            <NewsWidget compact />
          </div>
        </div>
      </div>
    </div>
  );
};

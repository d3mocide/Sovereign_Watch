import React, { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  AlertTriangle,
  Radio,
  Satellite,
  Activity,
  Plane,
  Ship,
  Newspaper,
  Signal,
  Wifi,
  WifiOff,
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

// Generate a GeoJSON polygon approximating a circle around lat/lon at radius_nm
function makeMissionCircle(
  lat: number,
  lon: number,
  radiusNm: number,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const NM_TO_DEG = 1 / 60;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const safeCos = Math.max(Math.abs(cosLat), 0.0001);
  const SEGMENTS = 128;
  const coords: [number, number][] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const angle = (i / SEGMENTS) * 2 * Math.PI;
    const dLat = radiusNm * NM_TO_DEG * Math.cos(angle);
    const dLon = ((radiusNm * NM_TO_DEG) / safeCos) * Math.sin(angle);
    coords.push([lon + dLon, lat + dLat]);
  }
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
    properties: {},
  };
}

// --- Mini Tactical Map ---
interface MiniMapProps {
  mission: { lat: number; lon: number; radius_nm: number };
  entitiesRef: React.MutableRefObject<Map<string, CoTEntity>>;
  satellitesRef: React.MutableRefObject<Map<string, CoTEntity>>;
}

const MiniTacticalMap: React.FC<MiniMapProps> = ({
  mission,
  entitiesRef,
  satellitesRef,
}) => {
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
      map.addLayer({
        id: 'mission-fill',
        type: 'fill',
        source: 'mission-circle',
        paint: { 'fill-color': '#00ff41', 'fill-opacity': 0.05 },
      });
      map.addLayer({
        id: 'mission-border',
        type: 'line',
        source: 'mission-circle',
        paint: {
          'line-color': '#00ff41',
          'line-width': 1.5,
          'line-opacity': 0.7,
        },
      });

      // Entity dots source (air + sea)
      map.addSource('entities', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      // Air — green
      map.addLayer({
        id: 'ent-air',
        type: 'circle',
        source: 'entities',
        filter: ['==', ['get', 'etype'], 'air'],
        paint: {
          'circle-radius': 2.5,
          'circle-color': '#00ff41',
          'circle-opacity': 0.85,
        },
      });
      // Sea — cyan
      map.addLayer({
        id: 'ent-sea',
        type: 'circle',
        source: 'entities',
        filter: ['==', ['get', 'etype'], 'sea'],
        paint: {
          'circle-radius': 2.5,
          'circle-color': '#00ffff',
          'circle-opacity': 0.85,
        },
      });

      // Orbital dots source
      map.addSource('orbital', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'ent-orbital',
        type: 'circle',
        source: 'orbital',
        paint: {
          'circle-radius': 2,
          'circle-color': '#a855f7',
          'circle-opacity': 0.6,
        },
      });

      mapReadyRef.current = true;
    });

    return () => {
      mapReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [mission.lat, mission.lon, mission.radius_nm]);

  // Refresh entity positions on a 5-second interval
  const updateEntityLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    const airSeaFeatures: GeoJSON.Feature[] = [];
    entitiesRef.current.forEach((entity) => {
      const etype = entity.vesselClassification !== undefined ? 'sea' : 'air';
      airSeaFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [entity.lon, entity.lat] },
        properties: { etype },
      });
    });

    const orbitalFeatures: GeoJSON.Feature[] = [];
    satellitesRef.current.forEach((entity) => {
      orbitalFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [entity.lon, entity.lat] },
        properties: {},
      });
    });

    const entSrc = map.getSource('entities') as maplibregl.GeoJSONSource | undefined;
    if (entSrc) {
      entSrc.setData({ type: 'FeatureCollection', features: airSeaFeatures });
    }
    const orbSrc = map.getSource('orbital') as maplibregl.GeoJSONSource | undefined;
    if (orbSrc) {
      orbSrc.setData({ type: 'FeatureCollection', features: orbitalFeatures });
    }
  }, [entitiesRef, satellitesRef]);

  useEffect(() => {
    // Initial update with delay to allow map style to load
    const initial = setTimeout(updateEntityLayers, 1500);
    const interval = setInterval(updateEntityLayers, 5000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [updateEntityLayers]);

  return <div ref={containerRef} className="w-full h-full" />;
};

// --- Main Dashboard ---

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

  const { passes, loading: passesLoading } = usePassPredictions(obsLat, obsLon, {
    category: 'intel',
    hours: 6,
    minElevation: 10,
    skip: !mission,
  });

  const alerts = events.filter((e) => e.type === 'alert').slice(0, 20);
  const intelEvents = events.filter((e) => e.type !== 'alert').slice(0, 30);

  const fmtTime = (d: Date) => d.toISOString().split('T')[1].substring(0, 8);

  const fmtPassTime = (iso: string) =>
    new Date(iso).toISOString().split('T')[1].substring(0, 5) + 'Z';

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

  const healthOnline = health?.status === 'online';

  return (
    <div className="w-full h-full pt-[55px] bg-tactical-bg text-hud-green font-mono flex flex-col overflow-hidden">

      {/* ── Stats Bar ── */}
      <div className="flex items-center gap-5 px-4 py-1.5 bg-black/70 border-b border-white/5 flex-shrink-0 flex-wrap">
        {/* Mission coords */}
        <div className="flex items-center gap-2">
          <span className="text-[8px] text-white/30 uppercase tracking-widest">AO</span>
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
            <span className="text-white/40">AIR</span>
            <span className="text-hud-green font-bold tabular-nums w-[2ch] text-right">{trackCounts.air}</span>
          </span>
          <span className="flex items-center gap-1 text-[10px]">
            <Ship size={10} className="text-cyan-400" />
            <span className="text-white/40">SEA</span>
            <span className="text-cyan-400 font-bold tabular-nums w-[2ch] text-right">{trackCounts.sea}</span>
          </span>
          <span className="flex items-center gap-1 text-[10px]">
            <Satellite size={10} className="text-purple-400" />
            <span className="text-white/40">ORB</span>
            <span className="text-purple-400 font-bold tabular-nums w-[4ch] text-right">{trackCounts.orbital}</span>
          </span>
        </div>
        <div className="h-3 w-px bg-white/10" />
        {/* System health */}
        <div className="flex items-center gap-1.5">
          {healthOnline
            ? <Wifi size={10} className="text-hud-green" />
            : <WifiOff size={10} className="text-alert-red" />}
          <span className={`text-[10px] font-bold ${healthOnline ? 'text-hud-green' : 'text-alert-red'}`}>
            {health?.status?.toUpperCase() ?? '---'}
          </span>
          {healthOnline && (
            <span className="text-[9px] text-white/30 tabular-nums">{health.latency}ms</span>
          )}
        </div>
        <div className="h-3 w-px bg-white/10" />
        {/* Intel pass count */}
        <div className="flex items-center gap-1.5">
          <Satellite size={10} className="text-purple-400" />
          <span className="text-[9px] text-white/40">INTEL PASSES / 6H</span>
          <span className="text-[10px] text-purple-300 font-bold">
            {passesLoading ? '…' : passes.length}
          </span>
        </div>
        {/* Alerts count */}
        {alerts.length > 0 && (
          <>
            <div className="h-3 w-px bg-white/10" />
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={10} className="text-alert-red animate-pulse" />
              <span className="text-[10px] text-alert-red font-bold">{alerts.length} ALERT{alerts.length !== 1 ? 'S' : ''}</span>
            </div>
          </>
        )}
        <span className="ml-auto text-[8px] text-white/15 uppercase tracking-widest hidden xl:block">
          DASHBOARD // SITUATIONAL AWARENESS
        </span>
      </div>

      {/* ── Main 3-column grid ── */}
      <div className="flex-1 grid min-h-0 overflow-hidden" style={{ gridTemplateColumns: '270px 1fr 270px' }}>

        {/* Left column */}
        <div className="flex flex-col border-r border-white/5 min-h-0 overflow-hidden">

          {/* Alerts */}
          <div className="flex flex-col border-b border-white/5 overflow-hidden" style={{ flex: '0 0 40%' }}>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/50 border-b border-white/5 flex-shrink-0">
              <AlertTriangle size={11} className={alerts.length > 0 ? 'text-alert-red' : 'text-white/20'} />
              <span className="text-[8px] font-bold tracking-widest uppercase text-white/60">Alerts</span>
              {alerts.length > 0 && (
                <span className="ml-auto text-[8px] bg-alert-red/20 text-alert-red border border-alert-red/30 rounded px-1 font-bold">
                  {alerts.length}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="flex items-center justify-center h-12 text-[9px] text-white/15 uppercase tracking-widest">
                  No Active Alerts
                </div>
              ) : (
                alerts.map((ev) => (
                  <div key={ev.id} className="px-3 py-1.5 border-b border-white/[0.03] hover:bg-white/5">
                    <div className="flex items-start gap-1.5">
                      <span className="text-[8px] text-alert-red mt-0.5">▶</span>
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

          {/* Intel Feed */}
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/50 border-b border-white/5 flex-shrink-0">
              <Activity size={11} className="text-hud-green/60" />
              <span className="text-[8px] font-bold tracking-widest uppercase text-white/60">Intel Feed</span>
              <span className="ml-auto text-[8px] text-white/20 tabular-nums">{intelEvents.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {intelEvents.length === 0 ? (
                <div className="flex items-center justify-center h-12 text-[9px] text-white/15 uppercase tracking-widest">
                  Awaiting Data
                </div>
              ) : (
                intelEvents.map((ev) => (
                  <div key={ev.id} className="px-3 py-1 border-b border-white/[0.03] hover:bg-white/5">
                    <div className="flex items-center gap-1.5">
                      {entityIcon(ev.entityType)}
                      <span
                        className={`text-[9px] flex-1 min-w-0 truncate ${
                          ev.type === 'new' ? 'text-hud-green/75' : 'text-white/35'
                        }`}
                      >
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
            <MiniTacticalMap
              mission={mission}
              entitiesRef={entitiesRef}
              satellitesRef={satellitesRef}
            />
          ) : (
            <div className="flex flex-col items-center justify-center w-full h-full gap-3">
              <Signal size={28} className="text-white/10" />
              <span className="text-[10px] text-white/20 uppercase tracking-widest">Awaiting Mission Area</span>
            </div>
          )}

          {/* Corner label */}
          <div className="absolute top-2 left-2 text-[8px] text-hud-green/40 bg-black/70 px-1.5 py-0.5 rounded tracking-widest pointer-events-none select-none">
            TACTICAL OVERVIEW
          </div>

          {/* Track count overlay */}
          <div className="absolute bottom-2 right-2 flex gap-1.5 pointer-events-none">
            <span className="text-[8px] bg-black/80 text-hud-green px-1.5 py-0.5 rounded border border-hud-green/20">
              AIR {trackCounts.air}
            </span>
            <span className="text-[8px] bg-black/80 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-400/20">
              SEA {trackCounts.sea}
            </span>
            <span className="text-[8px] bg-black/80 text-purple-400 px-1.5 py-0.5 rounded border border-purple-400/20">
              ORB {trackCounts.orbital}
            </span>
          </div>

          {/* Map legend */}
          <div className="absolute bottom-2 left-2 flex flex-col gap-0.5 pointer-events-none">
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-hud-green" />
              <span className="text-[7px] text-white/30">AVIATION</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              <span className="text-[7px] text-white/30">MARITIME</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-purple-400" />
              <span className="text-[7px] text-white/30">ORBITAL</span>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col border-l border-white/5 min-h-0 overflow-hidden">

          {/* JS8 / HF Radio Feed */}
          <div className="flex flex-col border-b border-white/5 overflow-hidden" style={{ flex: '0 0 50%' }}>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/50 border-b border-white/5 flex-shrink-0">
              <Radio size={11} className={js8Connected ? 'text-hud-green' : 'text-white/20'} />
              <span className="text-[8px] font-bold tracking-widest uppercase text-white/60">JS8 / HF Radio</span>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[8px] text-white/25">{js8Stations.length} stations</span>
                <div
                  className={`h-1.5 w-1.5 rounded-full ${
                    js8Connected ? 'bg-hud-green shadow-[0_0_5px_#00ff41] animate-pulse' : 'bg-white/15'
                  }`}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {js8LogEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-16 gap-1">
                  <span className="text-[9px] text-white/15 uppercase tracking-widest">No HF Activity</span>
                  {!js8Connected && (
                    <span className="text-[8px] text-white/10">JS8 bridge offline</span>
                  )}
                </div>
              ) : (
                [...js8LogEntries].reverse().slice(0, 30).map((entry) => (
                  <div key={entry.id} className="px-3 py-1.5 border-b border-white/[0.03] hover:bg-white/5">
                    <div className="flex items-start gap-1.5">
                      <Radio size={8} className="text-hud-green/30 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          {entry.from && (
                            <span className="text-[9px] text-hud-green font-bold">{entry.from}</span>
                          )}
                          {entry.to && entry.to !== 'ALLCALL' && (
                            <span className="text-[9px] text-white/35">→ {entry.to}</span>
                          )}
                          {entry.snr !== undefined && (
                            <span
                              className={`text-[8px] ml-auto ${
                                entry.snr >= -18
                                  ? 'text-emerald-400'
                                  : entry.snr >= -24
                                  ? 'text-yellow-400'
                                  : 'text-red-400'
                              }`}
                            >
                              {entry.snr}dB
                            </span>
                          )}
                        </div>
                        {entry.text && (
                          <p className="text-[9px] text-white/55 truncate leading-snug">{entry.text}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Orbital Passes */}
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/50 border-b border-white/5 flex-shrink-0">
              <Satellite size={11} className="text-purple-400" />
              <span className="text-[8px] font-bold tracking-widest uppercase text-white/60">Intel Passes / 6h</span>
              <span className="ml-auto text-[8px] text-purple-400/50">{passes.length} upcoming</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {passesLoading ? (
                <div className="flex items-center justify-center h-12 text-[9px] text-white/20 animate-pulse">
                  CALCULATING…
                </div>
              ) : passes.length === 0 ? (
                <div className="flex items-center justify-center h-12 text-[9px] text-white/15 uppercase tracking-widest">
                  No Passes in Window
                </div>
              ) : (
                passes.slice(0, 15).map((pass, i) => (
                  <div
                    key={`${pass.norad_id}-${i}`}
                    className="px-3 py-2 border-b border-white/[0.03] hover:bg-white/5"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-purple-300 font-bold truncate">{pass.name}</span>
                          <span className="text-[8px] text-white/25 flex-shrink-0">{pass.norad_id}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[8px] text-white/35">AOS {fmtPassTime(pass.aos)}</span>
                          <span className="text-[8px] text-purple-400/60">
                            EL {Math.round(pass.max_elevation)}°
                          </span>
                          <span className="text-[8px] text-white/35">
                            {Math.round(pass.duration_seconds / 60)}min
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] text-purple-300 font-bold flex-shrink-0 tabular-nums">
                        {untilPass(pass.aos)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── News Feed Row ── */}
      <div
        className="flex-shrink-0 flex flex-col border-t border-white/5 bg-black/50"
        style={{ height: '170px' }}
      >
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border-b border-white/5 flex-shrink-0">
          <Newspaper size={11} className="text-amber-400" />
          <span className="text-[8px] font-bold tracking-widest uppercase text-white/60">
            Open Source News Feed
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <NewsWidget compact />
        </div>
      </div>
    </div>
  );
};

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
import RadioTerminal from "./components/js8call/RadioTerminal";
import { MainHud } from "./components/layouts/MainHud";
import { OrbitalSidebarLeft } from "./components/layouts/OrbitalSidebarLeft";
import { SidebarLeft } from "./components/layouts/SidebarLeft";
import { SidebarRight } from "./components/layouts/SidebarRight";
import { TopBar } from "./components/layouts/TopBar";
import { OrbitalMap } from "./components/map/OrbitalMap";
import TacticalMap from "./components/map/TacticalMap";
import { DashboardView } from "./components/views/DashboardView";
import { AIAnalystPanel } from "./components/widgets/AIAnalystPanel";
import { GlobalTerminalWidget } from "./components/widgets/GlobalTerminalWidget";
import { TimeControls } from "./components/widgets/TimeControls";
import { useEntityWorker } from "./hooks/useEntityWorker";
import { useSatNOGS } from "./hooks/useSatNOGS";
import { useInfraData } from "./hooks/useInfraData";
import { useJS8Stations } from "./hooks/useJS8Stations";
import { useMissionArea } from "./hooks/useMissionArea";
import { parseMissionHash, updateMissionHash } from "./hooks/useMissionHash";
import { usePassPredictions } from "./hooks/usePassPredictions";
import { useRFSites } from "./hooks/useRFSites";
import { useSystemHealth } from "./hooks/useSystemHealth";
import { useTowers } from "./hooks/useTowers";
import { CoTEntity, HistorySegment, IntelEvent, MissionProps } from "./types";
import type { RFMode } from "./types";
import { processReplayData } from "./utils/replayUtils";

function App() {

  const [trackCounts, setTrackCounts] = useState({ air: 0, sea: 0, orbital: 0 });
  const [selectedEntity, setSelectedEntity] = useState<CoTEntity | null>(null);
  const [mapBounds, setMapBounds] = useState<{ minLat: number; maxLat: number; minLon: number; maxLon: number } | null>(null);
  const [historySegments, setHistorySegments] = useState<HistorySegment[]>([]);
  const [followMode, setFollowMode] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isSystemSettingsOpen, setIsSystemSettingsOpen] = useState(false);
  const [isSystemHealthOpen, setIsSystemHealthOpen] = useState(false);
  const [isAIAnalystOpen, setIsAIAnalystOpen] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [aiAnalystAutoRun] = useState(0);

  // Global COT State Refs
  const currentMissionRef = useRef<{
    lat: number;
    lon: number;
    radius_nm: number;
  } | null>(null);

  // Orbital Dashboard State
  const [orbitalViewMode, setOrbitalViewMode] = useState<'2D' | '3D'>('3D');
  const selectedSatNorad = selectedEntity?.uid ? parseInt(selectedEntity.uid.replace(/\D/g, ''), 10) || null : null;


  // Live satellite entity map exposed from OrbitalMap's entity worker.
  // Keyed as "SAT-<NORAD_ID>" — same as the CoT UID used by the backend.
  const orbitalSatellitesRef = useRef<import('react').MutableRefObject<Map<string, import('./types').CoTEntity>> | null>(null);

  const handleSetSelectedSatNorad = useCallback((noradId: number | null) => {
    if (noradId) {
      // Try to resolve the live entity so the sidebar shows real position/velocity/detail.
      const liveKey = `SAT-${noradId}`;
      const liveEntity = orbitalSatellitesRef.current?.current.get(liveKey);

      if (liveEntity) {
        setSelectedEntity(liveEntity);
      } else {
        // Entity not yet in the live map (first selection before first CoT tick).
        // Use a minimal stub — the sidebar will still show NORAD ID + pass geometry.
        setSelectedEntity({
          uid: liveKey,
          type: 'a-s-K',
          callsign: `NORAD ${noradId}`,
          lat: 0,
          lon: 0,
          altitude: 0,
          course: 0,
          speed: 0,
          lastSeen: Date.now(),
          trail: [],
          uidHash: 0,
        } as import('./types').CoTEntity);
      }
    } else {
      setSelectedEntity(null);
    }
  }, []);

  const [events, setEvents] = useState<IntelEvent[]>([]);

  const addEvent = useCallback((event: Omit<IntelEvent, 'id' | 'time'>) => {
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    setEvents((prev: IntelEvent[]) => [{
      ...event,
      id: typeof crypto.randomUUID === 'function' 
        ? crypto.randomUUID() 
        : `fallback-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      time: new Date(),
    }, ...prev].filter(e => e.time.getTime() > oneHourAgo).slice(0, 500));
  }, []);

  // Initialize Global Entity Worker
  const {
    entitiesRef,
    satellitesRef,
    knownUidsRef,
    drStateRef,
    visualStateRef,
    prevCourseRef,
    alertedEmergencyRef
  } = useEntityWorker({ onEvent: addEvent, currentMissionRef });
  const countsRef = useRef({ air: 0, sea: 0, orbital: 0 });

  // View Mode Persistence
  const [viewMode, setViewModeState] = useState<'TACTICAL' | 'ORBITAL' | 'RADIO' | 'DASHBOARD'>(() => {
    const saved = localStorage.getItem('viewMode');
    if (saved === 'ORBITAL' || saved === 'TACTICAL' || saved === 'RADIO' || saved === 'DASHBOARD') {
      return saved as 'TACTICAL' | 'ORBITAL' | 'RADIO' | 'DASHBOARD';
    }
    return 'TACTICAL';
  });

  const setViewMode = useCallback((mode: 'TACTICAL' | 'ORBITAL' | 'RADIO' | 'DASHBOARD') => {
    setViewModeState(mode);
    localStorage.setItem('viewMode', mode);
  }, []);

  // Background Data Maintenance (Cleanup & Counting)
  // This runs regardless of viewMode, ensuring Dashboard counts are live.
  useEffect(() => {
    const maintenance = () => {
      const now = Date.now();
      const STALE_THRESHOLD_AIR_MS = 120 * 1000;
      const STALE_THRESHOLD_SEA_MS = 300 * 1000;
      
      let air = 0;
      let sea = 0;
      let orbital = 0;
      const stale: string[] = [];

      // Clean/Count Air & Sea
      entitiesRef.current.forEach((entity, uid) => {
        const isShip = entity.type?.includes("S");
        const threshold = isShip ? STALE_THRESHOLD_SEA_MS : STALE_THRESHOLD_AIR_MS;
        
        if (now - entity.lastSeen > threshold) {
          stale.push(uid);
        } else {
          // Note: In a real app we'd filter by active layers here too, 
          // but for the basic dashboard counters, matching TacticalMap's behavior is key.
          if (isShip) sea++; else air++;
        }
      });

      stale.forEach(uid => {
        entitiesRef.current.delete(uid);
        knownUidsRef.current.delete(uid);
      });

      // 3. Count Orbital (Excluding Starlink which is suppressed for Dashboard)
      satellitesRef.current.forEach((sat) => {
        if (sat.detail?.constellation !== 'Starlink') {
          orbital++;
        }
      });

      // 4. Update trackCounts state ONLY if we are in a non-map view.
      // In TACTICAL and ORBITAL modes, useAnimationLoop handles high-frequency,
      // filter-aware counts that provide a much better UX.
      if (viewMode === 'DASHBOARD' || viewMode === 'RADIO') {
        if (air !== countsRef.current.air || sea !== countsRef.current.sea || orbital !== countsRef.current.orbital) {
          countsRef.current = { air, sea, orbital };
          setTrackCounts({ air, sea, orbital });
        }
      }
    };

    const timer = setInterval(maintenance, 1000);
    return () => clearInterval(timer);
  }, [entitiesRef, satellitesRef, knownUidsRef, viewMode]);

  // Infrastructure Data (Shared across TACTICAL/ORBITAL views)
  const { cablesData, stationsData, outagesData, gdeltData } = useInfraData();
  const [worldCountriesData, setWorldCountriesData] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    fetch("/world-countries.json")
      .then(res => res.json())
      .then(data => setWorldCountriesData(data))
      .catch(err => console.error("Failed to load world countries GeoJSON:", err));
  }, []);

  const health = useSystemHealth();
  const {
    stationsRef: js8StationsRef,
    ownGridRef: js8OwnGridRef,
    kiwiNodeRef: js8KiwiNodeRef,
    stations: js8Stations,
    logEntries: js8LogEntries,
    statusLine: js8StatusLine,
    connected: js8Connected,
    js8Connected: js8CallConnected,
    kiwiConnecting: js8KiwiConnecting,
    activeKiwiConfig: js8ActiveKiwiConfig,
    js8Mode,
    sMeterDbm: js8SMeterDbm,
    adcOverload: js8AdcOverload,
    sendMessage: js8SendMessage,
    sendAction: js8SendAction,
  } = useJS8Stations();

  // Map Actions (Search, FlyTo)
  const [mapActions, setMapActions] = useState<import('./types').MapActions | null>(null);

  // Filter state with persistence (tactical map only)
  const [filters, setFilters] = useState<import('./types').MapFilters>(() => {
    const defaultFilters = {
      showAir: true,
      showSea: true,
      showHelicopter: true,
      showCommercial: true,
      showPrivate: true,
      showMilitary: true,
      showGovernment: true,
      showCargo: true,
      showTanker: true,
      showPassenger: true,
      showFishing: true,
      showSeaMilitary: true,
      showLawEnforcement: true,
      showSar: true,
      showTug: true,
      showPleasure: true,
      showHsc: true,
      showPilot: true,
      showSpecial: true,
      showDrone: true,
      showSatellites: false,
      showSatGPS: true,
      showSatWeather: false,
      showSatComms: false,
      showSatSurveillance: true,
      showSatOther: true,
      showSatNOGS: false,
      showRepeaters: false,
      showHam: true,
      showNoaa: true,
      showPublicSafety: true,
      rfRadius: 300,
      rfEmcommOnly: false,
      showCables: false,
      showLandingStations: false,
      showOutages: true,
      showTowers: false,
      cableOpacity: 0.6,
      showConstellation_Starlink: false,
      showH3Coverage: false,
      showAurora: false,
      showGdelt: false,
      showTerminator: true,
    };

    // First check hash
    const hashState = parseMissionHash();
    if (hashState.activeLayers.length > 0) {
      // Create a new config setting everything to false initially, then enable hash layers
      const hashFilters = { ...defaultFilters };
      // Reset core layers to false, so only what's in hash is true
      hashFilters.showAir = false;
      hashFilters.showSea = false;
      hashFilters.showSatellites = false;
      hashFilters.showRepeaters = false;
      hashFilters.showCables = false;

      hashState.activeLayers.forEach(layer => {
        if (layer in hashFilters) {
           
          (hashFilters as any)[layer] = true;
        }
      });
      return hashFilters;
    }

    // Fallback to localStorage
    const saved = localStorage.getItem('mapFilters');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...defaultFilters, ...parsed };
      } catch (e) {
        console.error("Failed to parse mapFilters:", e);
      }
    }
    return defaultFilters;
  });

  // Sync filters to hash on change
  useEffect(() => {
    updateMissionHash(undefined, filters);
  }, [filters]);

  const { towers } = useTowers(mapBounds, filters.showTowers);

  // Isolated orbital satellite category filter state — never persisted to
  // mapFilters, so it never bleeds into the tactical map filter state.
  const [orbitalSatFilters, setOrbitalSatFilters] = useState(() => {
    const defaultOrbital = {
      showSatGPS: true,
      showSatWeather: false,
      showSatComms: true,
      showSatSurveillance: true,
      showSatOther: true,
      showSatNOGS: true,
      showAurora: true,
      showConstellation_Starlink: false,
    };
    const saved = localStorage.getItem('orbitalSatFilters');
    if (saved) {
      try {
        return { ...defaultOrbital, ...JSON.parse(saved) };
      } catch (e) {
        console.error("Failed to parse orbitalSatFilters:", e);
      }
    }
    return defaultOrbital;
  });

  const handleOrbitalFilterChange = useCallback((key: string, value: unknown) => {
    setOrbitalSatFilters((prev: Record<string, any>) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem('orbitalSatFilters', JSON.stringify(next));
      return next;
    });
  }, []);

  // Velocity Vector Toggle
  const [showVelocityVectors, setShowVelocityVectors] = useState(() => {
    const saved = localStorage.getItem('showVelocityVectors');
    return saved !== null ? JSON.parse(saved) : false;
  });

  const handleVelocityVectorToggle = useCallback(() => {
    setShowVelocityVectors((prev: boolean) => {
      const newValue = !prev;
      localStorage.setItem('showVelocityVectors', JSON.stringify(newValue));
      return newValue;
    });
  }, []);

  // History Tails Toggle
  const [showHistoryTails, setShowHistoryTails] = useState(() => {
    const saved = localStorage.getItem('showHistoryTails');
    return saved !== null ? JSON.parse(saved) : true; // Default to true for better initial UX
  });

  // History Tails Toggle

  const handleHistoryTailsToggle = useCallback(() => {
    setShowHistoryTails((prev: boolean) => {
      const newValue = !prev;
      localStorage.setItem('showHistoryTails', JSON.stringify(newValue));
      return newValue;
    });
  }, []);

  // Globe Mode Toggle
  const [globeMode, setGlobeMode] = useState(() => {
    const saved = localStorage.getItem('globeMode');
    return saved !== null ? JSON.parse(saved) : false;
  });

  const [showTerminator, setShowTerminator] = useState(() => {
    const saved = localStorage.getItem('showTerminator');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const handleGlobeModeToggle = useCallback(() => {
    setGlobeMode((prev: boolean) => {
      const newValue = !prev;
      localStorage.setItem('globeMode', JSON.stringify(newValue));
      return newValue;
    });
  }, []);

  const handleTerminatorToggle = useCallback(() => {
    setShowTerminator((prev: boolean) => {
      const newValue = !prev;
      localStorage.setItem('showTerminator', JSON.stringify(newValue));
      return newValue;
    });
  }, []);

  // Mission management state
  const [missionProps, setMissionProps] = useState<MissionProps | null>(null);

  // Lift Mission Area Logic to App Root so it persists across views
  const missionArea = useMissionArea({
    flyTo: mapActions?.flyTo,
    currentMissionRef,
    entitiesRef,
    knownUidsRef,
    prevCourseRef,
    drStateRef,
    visualStateRef,
    countsRef,
    onCountsUpdate: setTrackCounts,
    onEntitySelect: handleSetSelectedSatNorad as unknown as (entity: CoTEntity | null) => void, // Simple stub for entity clearing
    onMissionPropsReady: setMissionProps,
    initialLat: parseMissionHash().lat ?? parseFloat(import.meta.env.VITE_CENTER_LAT || "45.5152"),
    initialLon: parseMissionHash().lon ?? parseFloat(import.meta.env.VITE_CENTER_LON || "-122.6784"),
  });

  // Compute active services list
  const activeServices = useMemo(() => {
    const list: string[] = [];
    if (filters.showHam !== false) list.push('ham');
    if (filters.showNoaa !== false) list.push('noaa_nwr');
    if (filters.showPublicSafety !== false) list.push('public_safety');
    return list;
  }, [filters.showHam, filters.showNoaa, filters.showPublicSafety]);

  // RF infrastructure layer
  const { rfSitesRef, loading: repeatersLoading } = useRFSites(
    filters.showRepeaters === true,
    missionProps?.currentMission?.lat ?? 45.5152,
    missionProps?.currentMission?.lon ?? -122.6784,
    ((filters.rfRadius as unknown) as number) || 300,
    activeServices,
    (filters.modes as unknown as RFMode[] | undefined),
    filters.rfEmcommOnly === true,
  );

  // Intel satellite pass predictions for orbital alerts
  const obsLat = missionProps?.currentMission?.lat ?? 45.5152;
  const obsLon = missionProps?.currentMission?.lon ?? -122.6784;
  const { passes: intelPasses } = usePassPredictions(obsLat, obsLon, {
    category: 'intel',
    hours: 1,
    minElevation: 10,
    skip: !missionProps?.currentMission,
  });
  const alertedPassesRef = useRef<Set<string>>(new Set());

  // Add new event to feed (max 50 events)
  // Replay System State
  const [replayMode, setReplayMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Orbital Filters — satellite-only view, uses isolated cat filter state
  const orbitalFilters: import('./types').MapFilters = useMemo(() => {
    return {
      ...filters,
      // Overwrite sat category toggles with the isolated orbital state
      ...orbitalSatFilters,
      showAir: false,
      showSea: false,
      showHelicopter: false,
      showMilitary: false,
      showGovernment: false,
      showCommercial: false,
      showPrivate: false,
      showCargo: false,
      showTanker: false,
      showPassenger: false,
      showFishing: false,
      showSeaMilitary: false,
      showLawEnforcement: false,
      showSar: false,
      showTug: false,
      showPleasure: false,
      showHsc: false,
      showPilot: false,
      showSpecial: false,
      showDrone: false,
      showSatellites: true,
      showRepeaters: false,
      showTerminator: showTerminator,
      showCables: false,
      showLandingStations: false,
      showOutages: false,
    };
  }, [filters, orbitalSatFilters, showTerminator]);
  
  const { stationsRef, fetchVerification } = useSatNOGS(orbitalFilters.showSatNOGS);

  const tacticalFilters = useMemo(() => ({
    ...filters,
    showTerminator
  }), [filters, showTerminator]);

  const [replayTime, setReplayTime] = useState<number>(Date.now());
  const [replayRange, setReplayRange] = useState({ start: Date.now() - 3600000, end: Date.now() });
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [historyDuration, setHistoryDuration] = useState(1);
  const [replayEntities, setReplayEntities] = useState<Map<string, CoTEntity>>(new Map());

  // Replay Data Store (Full History)
  // Map<uid, List of time-sorted snapshots>
  const replayCacheRef = useRef<Map<string, CoTEntity[]>>(new Map());
  const lastReplayFrameRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);

  const updateReplayFrame = useCallback((time: number) => {
    const frameMap = new Map<string, CoTEntity>();

    // For each entity, find the state at 'time'
    for (const [uid, history] of replayCacheRef.current) {
      // Binary search or simple scan?
      // History is sorted. Find last point <= time.
      // Simple scan from right for now (assuming linear playback usually)
      // But random seek needs binary search.
      // Let's do simple findLast equivalent.
      let found: CoTEntity | null = null;
      let low = 0, high = history.length - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if ((history[mid].time || 0) <= time) {
          found = history[mid]; // Candidate
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      if (found) {
        // Stale check for replay? e.g. if point is > 5 mins old, don't show?
        if (time - (found.time || 0) < 600000) { // 10 mins — matches max 5-min bucket size used by adaptive replay query
          frameMap.set(uid, found);
        }
      }
    }
    setReplayEntities(frameMap);
  }, []);

  const loadReplayData = useCallback(async (hoursOverride?: number) => {
    try {
      const hours = hoursOverride || historyDuration;
      const end = new Date();
      const start = new Date(end.getTime() - 1000 * 60 * 60 * hours); // Use selected hours

      console.log(`Loading replay data (${hours}h): ${start.toISOString()} - ${end.toISOString()}`);

      const res = await fetch(`/api/tracks/replay?start=${start.toISOString()}&end=${end.toISOString()}&limit=10000`);
      if (!res.ok) throw new Error('Failed to fetch history');

      const data = await res.json();
      console.log(`Loaded ${data.length} historical points`);

      // Process and Index Data
      replayCacheRef.current = processReplayData(data);
      setReplayRange({ start: start.getTime(), end: end.getTime() });

      // Sync the ref (animation loop source-of-truth) to the new start time.
      // Without this, changing duration while playing leaves replayTimeRef.current
      // at the old window position so the loop never restarts from the correct point.
      replayTimeRef.current = start.getTime();
      // Reset the rAF delta timer so the first frame of the restarted loop does
      // not compute a massive dt from the previous animation session and
      // instantly skip past replayRange.end, stopping playback immediately.
      lastReplayFrameRef.current = 0;

      setReplayTime(start.getTime());
      updateReplayFrame(start.getTime());

      setReplayMode(true);
      setIsPlaying(true);

    } catch (err) {
      console.error("Replay load failed:", err);
    }
  }, [historyDuration, updateReplayFrame]);

  const replayTimeRef = useRef<number>(Date.now());

  // Animation Loop
  useEffect(() => {
    // Sync ref with state when not playing (e.g. after seek)
    if (!isPlaying) {
      replayTimeRef.current = replayTime;
      lastReplayFrameRef.current = 0;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      return;
    }

    const loop = (timestamp: number) => {
      if (!lastReplayFrameRef.current) lastReplayFrameRef.current = timestamp;
      const dt = timestamp - lastReplayFrameRef.current;
      lastReplayFrameRef.current = timestamp;

      // Calculate next time using Ref (Source of Truth for Loop)
      const next = replayTimeRef.current + (dt * playbackSpeed);

      if (next > replayRange.end) {
        setIsPlaying(false);
        setReplayTime(replayRange.end);
        replayTimeRef.current = replayRange.end;
        updateReplayFrame(replayRange.end);
        return;
      }

      // Update State
      replayTimeRef.current = next;
      setReplayTime(next);
      updateReplayFrame(next);

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  }, [isPlaying, playbackSpeed, replayRange.end, updateReplayFrame]);

  // Orbital alert: fire when an intel-category satellite has AOS within 30 minutes
  useEffect(() => {
    if (intelPasses.length === 0) return;
    const now = Date.now();
    const ALERT_WINDOW_MS = 30 * 60 * 1000;
    for (const pass of intelPasses) {
      const aosMs = Date.parse(pass.aos);
      const passKey = `${pass.norad_id}-${pass.aos}`;
      if (aosMs > now && aosMs - now <= ALERT_WINDOW_MS && !alertedPassesRef.current.has(passKey)) {
        alertedPassesRef.current.add(passKey);
        const minutesAway = Math.round((aosMs - now) / 60000);
        addEvent({
          type: 'alert',
          message: `INTEL SAT — ${pass.name} AOS in ${minutesAway}min (El ${Math.round(pass.max_elevation)}°)`,
          entityType: 'orbital',
        });
      }
    }
  }, [intelPasses, addEvent]);

  // Periodic cleanup for events older than 1 hour
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;
      setEvents((prev: IntelEvent[]) => {
        const filtered = prev.filter(e => e.time.getTime() > oneHourAgo);
        // Only update state if something was actually removed to avoid unnecessary re-renders
        return filtered.length === prev.length ? prev : filtered;
      });
    }, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const handleFilterChange = useCallback((key: string, value: boolean) => {
    setFilters((prev: import('./types').MapFilters) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem('mapFilters', JSON.stringify(next));

      // Add Intel Feed notifications for core layer toggles
      if (prev[key] !== value) {
        if (key === 'showAir') {
          addEvent({
            message: value ? "Aviation Tracking Uplink Established" : "Aviation Tracking Offline",
            type: value ? 'new' : 'lost',
            entityType: 'air'
          });
        } else if (key === 'showSea') {
          addEvent({
            message: value ? "Maritime AIS Ingestion Subsystem Active" : "Maritime AIS Ingestion Offline",
            type: value ? 'new' : 'lost',
            entityType: 'sea'
          });
        } else if (key === 'showSatellites') {
          addEvent({
            message: value ? "Orbital Surveillance Network Synchronized" : "Orbital Surveillance Network Offline",
            type: value ? 'new' : 'lost',
            entityType: 'orbital'
          });
        }
      }

      return next;
    });
  }, [addEvent]);

  const alertsCount = useMemo(() =>
    events.filter(e => e.type === 'alert').length,
    [events]);

  const handleOpenAnalystPanel = useCallback(() => {
    setIsAIAnalystOpen(true);
  }, []);

  const handleEntitySelect = useCallback((e: CoTEntity | null) => {
    setSelectedEntity(e);
    setHistorySegments([]); // clear track path when selection changes
    setFollowMode(false); // Always stop following when selection changes (user must re-engage)

    if (e && (e.type === 'a-s-K' || e.detail?.category)) {
      addEvent({
        type: 'new',
        message: `${(e.callsign || e.uid).replace(/\s*\(.*?\)/g, '')}`,
        entityType: 'orbital',
        classification: {
          ...e.classification,
          category: String(e.detail?.category || 'Orbital Asset')
        }
      });
    }
  }, [addEvent]);

  const handleEntityLiveUpdate = useCallback((e: CoTEntity) => {
    setSelectedEntity(e);
  }, []);

  return (
    <>
      {isTerminalOpen && (
        <GlobalTerminalWidget
          onClose={() => setIsTerminalOpen(false)}
          entitiesRef={entitiesRef}
          satellitesRef={satellitesRef}
        />
      )}
    <MainHud
      topBar={
        <TopBar
          alertsCount={alertsCount}
          location={missionProps?.currentMission}
          health={health}
          showVelocityVectors={showVelocityVectors}
          onToggleVelocityVectors={handleVelocityVectorToggle}
          showHistoryTails={showHistoryTails}
          onToggleHistoryTails={handleHistoryTailsToggle}
          showTerminator={showTerminator}
          onToggleTerminator={handleTerminatorToggle}
          onToggleReplay={() => {
            if (replayMode) setReplayMode(false);
            else loadReplayData();
          }}
          isReplayMode={replayMode}
          viewMode={viewMode}
          onViewChange={setViewMode}
          onAlertsClick={() => setIsAlertsOpen(!isAlertsOpen)}
          isAlertsOpen={isAlertsOpen}
          alerts={events.filter(e => e.type === 'alert')}
          onAlertsClose={() => setIsAlertsOpen(false)}
          filters={filters as any}
          onFilterChange={handleFilterChange as any}
          isSystemSettingsOpen={isSystemSettingsOpen}
          onSystemSettingsClick={() => setIsSystemSettingsOpen(!isSystemSettingsOpen)}
          onSystemSettingsClose={() => setIsSystemSettingsOpen(false)}
          isSystemHealthOpen={isSystemHealthOpen}
          onSystemHealthClick={() => setIsSystemHealthOpen(!isSystemHealthOpen)}
          onSystemHealthClose={() => setIsSystemHealthOpen(false)}
          onTerminalClick={() => setIsTerminalOpen(!isTerminalOpen)}
        />
      }
      leftSidebar={
        viewMode === 'TACTICAL' ? (
          <SidebarLeft
            trackCounts={trackCounts}
            filters={filters as any}
            onFilterChange={handleFilterChange as any}
            events={events}
            missionProps={missionProps}
            health={health}
            mapActions={mapActions}
            onEntitySelect={handleEntitySelect}
            js8Stations={js8Stations}
            js8LogEntries={js8LogEntries}
            js8StatusLine={js8StatusLine}
            js8BridgeConnected={js8Connected}
            js8Connected={js8CallConnected}
            js8KiwiConnecting={js8KiwiConnecting}
            js8ActiveKiwiConfig={js8ActiveKiwiConfig}
            sendMessage={js8SendMessage}
            sendAction={js8SendAction}
          />
        ) : viewMode === 'ORBITAL' ? (
          <OrbitalSidebarLeft
            filters={orbitalFilters}
            onFilterChange={handleOrbitalFilterChange}
            selectedSatNorad={selectedSatNorad}
            setSelectedSatNorad={handleSetSelectedSatNorad}
            trackCount={trackCounts.orbital}
          />
        ) : null
      }
      rightSidebar={
        (viewMode === 'TACTICAL' || viewMode === 'ORBITAL') ? (
          <div className="flex flex-col h-full gap-4">

            {/* Entity Details Sidebar */}
            {selectedEntity && (
              <div className="flex-1 min-h-0 pointer-events-auto overflow-hidden">
                <SidebarRight
                  entity={selectedEntity}
                  onClose={() => {
                    setSelectedEntity(null);
                    setHistorySegments([]);
                    setFollowMode(false);
                  }}
                  onCenterMap={() => {
                    setFollowMode(true);
                    if (selectedEntity && mapActions) {
                      mapActions.flyTo(selectedEntity.lat, selectedEntity.lon);
                    }
                  }}
                  onOpenAnalystPanel={handleOpenAnalystPanel}
                  onHistoryLoaded={setHistorySegments}
                  fetchSatnogsVerification={fetchVerification}
                />
              </div>
            )}
          </div>
        ) : null
      }
    >
      <AIAnalystPanel
        entity={selectedEntity}
        isOpen={isAIAnalystOpen}
        onClose={() => setIsAIAnalystOpen(false)}
        autoRunTrigger={aiAnalystAutoRun}
      />
      {viewMode === 'TACTICAL' ? (
        <>
          <TacticalMap
            onCountsUpdate={setTrackCounts}
            filters={tacticalFilters}
            onEvent={addEvent}
            selectedEntity={selectedEntity}
            onEntitySelect={handleEntitySelect}
            missionArea={missionArea as any}
            onMapActionsReady={setMapActions}
            showVelocityVectors={showVelocityVectors}
            showHistoryTails={showHistoryTails}
            historySegments={historySegments}
            globeMode={globeMode}
            onToggleGlobe={handleGlobeModeToggle}
            replayMode={replayMode}
            replayEntities={replayEntities}
            followMode={followMode} // Pass follow mode
            onFollowModeChange={setFollowMode}
            onEntityLiveUpdate={handleEntityLiveUpdate}
            js8StationsRef={js8StationsRef}
            ownGridRef={js8OwnGridRef}
            rfSitesRef={rfSitesRef}
            kiwiNodeRef={js8KiwiNodeRef}
            showRepeaters={filters.showRepeaters as boolean}
            repeatersLoading={repeatersLoading}
            entitiesRef={entitiesRef}
            satellitesRef={satellitesRef}
            knownUidsRef={knownUidsRef}
            drStateRef={drStateRef}
            visualStateRef={visualStateRef}
            prevCourseRef={prevCourseRef}
            alertedEmergencyRef={alertedEmergencyRef}
            currentMissionRef={currentMissionRef}
            cablesData={cablesData}
            stationsData={stationsData}
            outagesData={outagesData}
            worldCountriesData={worldCountriesData}
            showTerminator={showTerminator}
            towersData={towers}
            onBoundsChange={setMapBounds}
            gdeltData={gdeltData}
          />

          {/* Replay Controls Overlay */}
          {replayMode && (
            <TimeControls
              isOpen={true}
              isPlaying={isPlaying}
              currentTime={replayTime}
              startTime={replayRange.start}
              endTime={replayRange.end}
              playbackSpeed={playbackSpeed}
              historyDuration={historyDuration}
              onTogglePlay={() => setIsPlaying(p => !p)}
              onSeek={(t) => {
                setReplayTime(t);
                replayTimeRef.current = t; // Sync ref
                updateReplayFrame(t);
              }}
              onSpeedChange={setPlaybackSpeed}
              onDurationChange={(hours) => {
                setHistoryDuration(hours);
                loadReplayData(hours);
              }}
              onClose={() => { setReplayMode(false); setIsPlaying(false); }}
            />
          )}
        </>
      ) : viewMode === 'ORBITAL' ? (
        <OrbitalMap
          filters={orbitalFilters}
          globeMode={orbitalViewMode === '3D'}
          onEntitySelect={handleEntitySelect}
          selectedEntity={selectedEntity}
          // The rest are dummy/no-ops for the layout shell
          onCountsUpdate={setTrackCounts as unknown as (counts: { air: number; sea: number; orbital: number }) => void}
          onEvent={addEvent}
          missionArea={missionArea as any}
          onMissionPropsReady={setMissionProps}
          onMapActionsReady={setMapActions}
          showVelocityVectors={false}
          showHistoryTails={showHistoryTails}
          onToggleGlobe={() => setOrbitalViewMode(orbitalViewMode === '3D' ? '2D' : '3D')}
          replayMode={false}
          replayEntities={new Map()}
          followMode={followMode}
          onFollowModeChange={setFollowMode}
          showTerminator={showTerminator}
          entitiesRef={entitiesRef}
          satellitesRef={satellitesRef}
          knownUidsRef={knownUidsRef}
          drStateRef={drStateRef}
          visualStateRef={visualStateRef}
          prevCourseRef={prevCourseRef}
          alertedEmergencyRef={alertedEmergencyRef}
          currentMissionRef={currentMissionRef}
          cablesData={cablesData}
          stationsData={stationsData}
          outagesData={outagesData}
          worldCountriesData={worldCountriesData}
          satnogsStationsRef={stationsRef}
          onSatellitesRefReady={(ref) => {
            orbitalSatellitesRef.current = ref;
          }}
        />
      ) : viewMode === 'DASHBOARD' ? (
        <DashboardView
          events={events}
          trackCounts={trackCounts}
          missionProps={missionProps}
          entitiesRef={entitiesRef}
          satellitesRef={satellitesRef}
          cablesData={cablesData}
          stationsData={stationsData}
          outagesData={outagesData}
          worldCountriesData={worldCountriesData}
          showTerminator={showTerminator}
          drStateRef={drStateRef}
          gdeltData={gdeltData}
        />
      ) : (
        <div className="w-full h-full pt-14 overflow-hidden bg-slate-950">
          <RadioTerminal
            stations={js8Stations}
            logEntries={js8LogEntries}
            statusLine={js8StatusLine}
            connected={js8Connected}
            js8Connected={js8CallConnected}
            kiwiConnecting={js8KiwiConnecting}
            activeKiwiConfig={js8ActiveKiwiConfig}
            js8Mode={js8Mode}
            sMeterDbm={js8SMeterDbm}
            adcOverload={js8AdcOverload}
            sendMessage={js8SendMessage}
            sendAction={js8SendAction}
          />
        </div>
      )}
    </MainHud>
    </>
  )
}

export default App

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import TacticalMap from './components/map/TacticalMap'
import { SidebarLeft } from './components/layouts/SidebarLeft'
import { SidebarRight } from './components/layouts/SidebarRight'
import { MainHud } from './components/layouts/MainHud'
import { TopBar } from './components/layouts/TopBar'
import { OrbitalMap } from './components/map/OrbitalMap'
import { OrbitalSidebarLeft } from './components/layouts/OrbitalSidebarLeft'
import RadioTerminal from './components/js8call/RadioTerminal'
import { CoTEntity, IntelEvent, MissionProps } from './types'
import { TimeControls } from './components/widgets/TimeControls'
import { useSystemHealth } from './hooks/useSystemHealth'
import { useJS8Stations } from './hooks/useJS8Stations'
import { useRFSites } from './hooks/useRFSites'
import { usePassPredictions } from './hooks/usePassPredictions'
import { processReplayData } from './utils/replayUtils'
import { AlertsWidget } from './components/widgets/AlertsWidget'
import { useEntityWorker } from './hooks/useEntityWorker'

const NOOP = () => { };

function App() {

  const [trackCounts, setTrackCounts] = useState({ air: 0, sea: 0, orbital: 0 });
  const [selectedEntity, setSelectedEntity] = useState<CoTEntity | null>(null);
  const [followMode, setFollowMode] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isSystemSettingsOpen, setIsSystemSettingsOpen] = useState(false);

  // Global COT State Refs
  const currentMissionRef = useRef<{
    lat: number;
    lon: number;
    radius_nm: number;
  } | null>(null);

  // Orbital Dashboard State
  const [orbitalViewMode, setOrbitalViewMode] = useState<'2D' | '3D'>('2D');
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
      id: crypto.randomUUID(),
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
    sendMessage: js8SendMessage,
    sendAction: js8SendAction,
  } = useJS8Stations();

  // Map Actions (Search, FlyTo)
  const [mapActions, setMapActions] = useState<import('./types').MapActions | null>(null);

  // Filter state with persistence (tactical map only)
  const [filters, setFilters] = useState<Record<string, boolean | string | number | string[]>>(() => {
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
      showSatWeather: true,
      showSatComms: false,
      showSatSurveillance: true,
      showSatOther: true,
      showRepeaters: false,
      showHam: true,
      showNoaa: true,
      showPublicSafety: true,
      rfRadius: 300,
      rfEmcommOnly: false,
      showCables: false,
      showLandingStations: false,
      cableOpacity: 0.6,
      showConstellation_Starlink: false,
      showH3Coverage: false,
    };
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

  // Isolated orbital satellite category filter state — never persisted to
  // mapFilters, so it never bleeds into the tactical map filter state.
  const [orbitalSatFilters, setOrbitalSatFilters] = useState({
    showSatGPS: true,
    showSatWeather: true,
    showSatComms: true,
    showSatSurveillance: true,
    showSatOther: true,
    showConstellation_Starlink: false,
  });

  const handleOrbitalFilterChange = useCallback((key: string, value: unknown) => {
    setOrbitalSatFilters(prev => ({ ...prev, [key]: value }));
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

  // View Mode Persistence
  const [viewMode, setViewModeState] = useState<'TACTICAL' | 'ORBITAL'>(() => {
    const saved = localStorage.getItem('viewMode');
    // Default to TACTICAL if nothing saved or on first load
    if (saved === 'ORBITAL' || saved === 'TACTICAL') {
      return saved as 'TACTICAL' | 'ORBITAL';
    }
    return 'TACTICAL';
  });

  const setViewMode = useCallback((mode: 'TACTICAL' | 'ORBITAL') => {
    setViewModeState(mode);
    localStorage.setItem('viewMode', mode);
  }, []);

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
    return saved !== null ? JSON.parse(saved) : false;
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

  // Compute active services list
  const activeServices: string[] = [];
  if (filters.showHam !== false) activeServices.push('ham'); // Assuming 'ham' fetches both Ham & GMRS from backend implicitly
  if (filters.showNoaa !== false) activeServices.push('noaa_nwr');
  if (filters.showPublicSafety !== false) activeServices.push('public_safety');

  // RF infrastructure layer
  const { rfSitesRef, loading: repeatersLoading } = useRFSites(
    filters.showRepeaters as boolean,
    missionProps?.currentMission?.lat ?? 45.5152,
    missionProps?.currentMission?.lon ?? -122.6784,
    (filters.rfRadius as number) || 300,
    activeServices as any, // Will update hook signature next
    (filters.modes as any) || undefined,
    (filters.rfEmcommOnly as any) || undefined,
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
    };
  }, [filters, orbitalSatFilters, showTerminator]);

  const [replayTime, setReplayTime] = useState<number>(Date.now());
  const [replayRange, setReplayRange] = useState({ start: Date.now() - 3600000, end: Date.now() });
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [historyDuration, setHistoryDuration] = useState(1);
  const [replayEntities, setReplayEntities] = useState<Map<string, CoTEntity>>(new Map());

  // Replay Data Store (Full History)
  // Map<uid, List of time-sorted snapshots>
  const replayCacheRef = useRef<Map<string, CoTEntity[]>>(new Map());
  const lastReplayFrameRef = useRef<number>(0);
  const animationFrameRef = useRef<number>();

  const loadReplayData = useCallback(async (hoursOverride?: number) => {
    try {
      const hours = hoursOverride || historyDuration;
      const end = new Date();
      const start = new Date(end.getTime() - 1000 * 60 * 60 * hours); // Use selected hours

      console.log(`Loading replay data (${hours}h): ${start.toISOString()} - ${end.toISOString()}`);

      const res = await fetch(`/api/tracks/replay?start=${start.toISOString()}&end=${end.toISOString()}`);
      if (!res.ok) throw new Error('Failed to fetch history');

      const data = await res.json();
      console.log(`Loaded ${data.length} historical points`);

      // Process and Index Data
      replayCacheRef.current = processReplayData(data);
      setReplayRange({ start: start.getTime(), end: end.getTime() });
      setReplayTime(start.getTime());
      updateReplayFrame(start.getTime());

      setReplayMode(true);
      setIsPlaying(true);

    } catch (err) {
      console.error("Replay load failed:", err);
    }
  }, [historyDuration]);

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
      // Optimization: If history is large (>100), use binary search.
      // For <100, linear scan is fast.
      // Assuming history resolution ~10s -> 360 points/hour. Linear is fine?
      // Actually binary search is safer.

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
        if (time - (found.time || 0) < 300000) { // 5 mins
          frameMap.set(uid, found);
        }
      }
    }
    setReplayEntities(frameMap);
  }, []);

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
      const aosMs = new Date(pass.aos).getTime();
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

  const handleFilterChange = useCallback((key: string, value: any) => {
    setFilters((prev: Record<string, any>) => {
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
    events.filter(e => (e as any).type === 'alert').length,
    [events]);

  const handleEntitySelect = useCallback((e: CoTEntity | null) => {
    setSelectedEntity(e);
    // Always stop following when selection changes (user must re-engage)
    setFollowMode(false);

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
          filters={filters}
          onFilterChange={handleFilterChange}
          isSystemSettingsOpen={isSystemSettingsOpen}
          onSystemSettingsClick={() => setIsSystemSettingsOpen(!isSystemSettingsOpen)}
          onSystemSettingsClose={() => setIsSystemSettingsOpen(false)}
        />
      }
      leftSidebar={
        viewMode === 'TACTICAL' ? (
          <SidebarLeft
            trackCounts={trackCounts}
            filters={filters}
            onFilterChange={handleFilterChange}
            events={events}
            missionProps={missionProps}
            health={health}
            mapActions={mapActions}
            onEntitySelect={handleEntitySelect}
            js8Stations={js8Stations}
            js8LogEntries={js8LogEntries}
            js8StatusLine={js8StatusLine}
            js8Connected={js8Connected}
            js8KiwiConnecting={js8KiwiConnecting}
            js8ActiveKiwiConfig={js8ActiveKiwiConfig}
            sendMessage={js8SendMessage}
            sendAction={js8SendAction}
          />
        ) : viewMode === 'ORBITAL' ? (
          <OrbitalSidebarLeft
            filters={orbitalSatFilters}
            onFilterChange={handleOrbitalFilterChange}
            selectedSatNorad={selectedSatNorad}
            setSelectedSatNorad={handleSetSelectedSatNorad}
            trackCount={trackCounts.orbital}
          />
        ) : null
      }
      rightSidebar={
        selectedEntity ? (
          viewMode === 'TACTICAL' ? (
            <SidebarRight
              entity={selectedEntity}
              onClose={() => {
                setSelectedEntity(null);
                setFollowMode(false); // Stop following on close
              }}
              onCenterMap={() => {
                setFollowMode(true);
                if (selectedEntity && mapActions) {
                  mapActions.flyTo(selectedEntity.lat, selectedEntity.lon);
                }
              }}
            />
          ) : viewMode === 'ORBITAL' ? (
            <SidebarRight
              entity={selectedEntity}
              onClose={() => {
                setSelectedEntity(null);
                setFollowMode(false);
              }}
              onCenterMap={() => {
                setFollowMode(true);
                if (selectedEntity && mapActions) {
                  mapActions.flyTo(selectedEntity.lat, selectedEntity.lon);
                }
              }}
            />
          ) : null
        ) : null
      }
    >
      {viewMode === 'TACTICAL' ? (
        <>
          <TacticalMap
            onCountsUpdate={setTrackCounts}
            filters={{ ...filters, showTerminator: showTerminator }}
            onEvent={addEvent}
            selectedEntity={selectedEntity}
            onEntitySelect={handleEntitySelect}
            onMissionPropsReady={setMissionProps}
            onMapActionsReady={setMapActions}
            showVelocityVectors={showVelocityVectors}
            showHistoryTails={showHistoryTails}
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
          onCountsUpdate={setTrackCounts as any}
          onEvent={NOOP}
          onMissionPropsReady={NOOP}
          onMapActionsReady={NOOP}
          showVelocityVectors={false}
          showHistoryTails={showHistoryTails}
          onToggleGlobe={() => setOrbitalViewMode(orbitalViewMode === '3D' ? '2D' : '3D')}
          replayMode={false}
          replayEntities={new Map()}
          followMode={false}
          onFollowModeChange={NOOP}
          onEntityLiveUpdate={handleEntityLiveUpdate}
          js8StationsRef={{ current: new Map() } as any}
          ownGridRef={{ current: '' }}
          rfSitesRef={{ current: [] }}
          showRepeaters={false}
          repeatersLoading={false}
          onSatellitesRefReady={(ref) => {
            orbitalSatellitesRef.current = ref;
          }}
          entitiesRef={entitiesRef}
          satellitesRef={satellitesRef}
          knownUidsRef={knownUidsRef}
          drStateRef={drStateRef}
          visualStateRef={visualStateRef}
          prevCourseRef={prevCourseRef}
          alertedEmergencyRef={alertedEmergencyRef}
          currentMissionRef={currentMissionRef}
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
            sendMessage={js8SendMessage}
            sendAction={js8SendAction}
          />
        </div>
      )}
    </MainHud>
  )
}

export default App

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import TacticalMap from './components/map/TacticalMap'
import { SidebarLeft } from './components/layouts/SidebarLeft'
import { SidebarRight } from './components/layouts/SidebarRight'
import { MainHud } from './components/layouts/MainHud'
import { TopBar } from './components/layouts/TopBar'
import { CoTEntity, IntelEvent, MissionProps } from './types'
import { TimeControls } from './components/widgets/TimeControls'
import { useSystemHealth } from './hooks/useSystemHealth'

function App() {
  const [trackCounts, setTrackCounts] = useState({ air: 0, sea: 0 });
  const [selectedEntity, setSelectedEntity] = useState<CoTEntity | null>(null);
  const [followMode, setFollowMode] = useState(false);
  const health = useSystemHealth();
  
  // Map Actions (Search, FlyTo)
  const [mapActions, setMapActions] = useState<import('./types').MapActions | null>(null);

  // Filter state
  const [filters, setFilters] = useState({
    showAir: true,
    showSea: true,
    showHelicopter: true,
    showMilitary: true,
    showGovernment: true,
    showCommercial: true,
    showPrivate: true,
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
    showSatComms: true,
    showSatSurveillance: true,
    showSatOther: true,
  });
  
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

  const handleGlobeModeToggle = useCallback(() => {
    setGlobeMode((prev: boolean) => {
      const newValue = !prev;
      localStorage.setItem('globeMode', JSON.stringify(newValue));
      return newValue;
    });
  }, []);
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [events, setEvents] = useState<IntelEvent[]>([]);
  
  // Mission management state
  const [missionProps, setMissionProps] = useState<MissionProps | null>(null);
  
  // Add new event to feed (max 50 events)
  // Replay System State
  const [replayMode, setReplayMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
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
           const cache = new Map<string, CoTEntity[]>();
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           data.forEach((pt: any) => {
               // Convert DB row to CoTEntity partial
               // Note: DB returns snake_case, CoTEntity is strict.
               // We need manual mapping.
               
               // Parse meta safely
               let meta: any = {};
               try {
                  meta = typeof pt.meta === 'string' ? JSON.parse(pt.meta) : pt.meta || {};
               } catch { /* ignore */ }

               const entity: CoTEntity = {
                   uid: pt.entity_id,
                   type: pt.type,
                   lat: pt.lat,
                   lon: pt.lon,
                   altitude: pt.alt,
                   speed: pt.speed,
                   course: pt.heading,
                   callsign: meta.callsign || pt.entity_id,
                   time: new Date(pt.time).getTime(),
                   lastSeen: new Date(pt.time).getTime(),
                   trail: [], // Replay doesn't need trails yet or we can generate them
                   uidHash: 0 // Will be computed by map
               };
               
               if (!cache.has(entity.uid)) cache.set(entity.uid, []);
               cache.get(entity.uid)?.push(entity);
           });
           
           // Sort by time
           for (const list of cache.values()) {
               list.sort((a, b) => (a.time || 0) - (b.time || 0));
           }
           
           replayCacheRef.current = cache;
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


  // Add new event to feed (keep events from the last hour)
  const addEvent = useCallback((event: Omit<IntelEvent, 'id' | 'time'>) => {
    const now = Date.now();
    const oneHourAgo = now - 3600000; // 3600 seconds * 1000 ms

    setEvents(prev => [{
      ...event,
      id: crypto.randomUUID(),
      time: new Date(),
    }, ...prev].filter(e => e.time.getTime() > oneHourAgo).slice(0, 500));
  }, []);

  // Periodic cleanup for events older than 1 hour
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;
      setEvents(prev => {
        const filtered = prev.filter(e => e.time.getTime() > oneHourAgo);
        // Only update state if something was actually removed to avoid unnecessary re-renders
        return filtered.length === prev.length ? prev : filtered;
      });
    }, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const handleFilterChange = (key: string, value: boolean) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const alertsCount = useMemo(() => 
    events.filter(e => e.type === 'alert').length, 
  [events]);

  const handleEntitySelect = useCallback((e: CoTEntity | null) => {
      setSelectedEntity(e);
      // Always stop following when selection changes (user must re-engage)
      setFollowMode(false);
  }, []);

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
          showSatellites={filters.showSatellites}
          onToggleSatellites={() => handleFilterChange('showSatellites', !filters.showSatellites)}
          globeMode={globeMode}
          onToggleGlobe={handleGlobeModeToggle}
          onToggleReplay={() => {
              if (replayMode) setReplayMode(false);
              else loadReplayData();
          }}
          isReplayMode={replayMode}
        />
      }
      leftSidebar={
        <SidebarLeft 
          trackCounts={trackCounts}
          filters={filters}
          onFilterChange={handleFilterChange}
          events={events}
          missionProps={missionProps}
          health={health}
          mapActions={mapActions}
          onEntitySelect={handleEntitySelect}
        />
      }
      rightSidebar={
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
      }
    >
      <TacticalMap 
          onCountsUpdate={setTrackCounts} 
          filters={filters}
          onEvent={addEvent}
          selectedEntity={selectedEntity}
          onEntitySelect={handleEntitySelect}
          onMissionPropsReady={setMissionProps}
          onMapActionsReady={setMapActions}
          showVelocityVectors={showVelocityVectors}
          showHistoryTails={showHistoryTails}
          globeMode={globeMode}
          replayMode={replayMode}
          replayEntities={replayEntities}
          followMode={followMode} // Pass follow mode
          onFollowModeChange={setFollowMode}
          onEntityLiveUpdate={handleEntityLiveUpdate}
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
      
      {/* Temporary Trigger for Dev - Shift+R or add to Sidebar */}
      {/* Let's add a global hotkey or just a temporary button until we integrate properly */}
    </MainHud>
  )
}

export default App

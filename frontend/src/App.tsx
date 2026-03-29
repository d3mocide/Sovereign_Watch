import type { FeatureCollection } from "geojson";
import { useCallback, useEffect, useRef, useState } from "react";
import RadioTerminal from "./components/js8call/RadioTerminal";
import { IntelSidebar } from "./components/layouts/IntelSidebar";
import { MainHud } from "./components/layouts/MainHud";
import { OrbitalSidebarLeft } from "./components/layouts/OrbitalSidebarLeft";
import { SidebarLeft } from "./components/layouts/SidebarLeft";
import { SidebarRight } from "./components/layouts/SidebarRight";
import { TopBar } from "./components/layouts/TopBar";
import { IntelGlobe } from "./components/map/IntelGlobe";
import { OrbitalMap } from "./components/map/OrbitalMap";
import TacticalMap from "./components/map/TacticalMap";
import { DashboardView } from "./components/views/DashboardView";
import { AIAnalystPanel } from "./components/widgets/AIAnalystPanel";
import { GlobalTerminalWidget } from "./components/widgets/GlobalTerminalWidget";
import { MaritimeRiskPanel } from "./components/widgets/MaritimeRiskPanel";
import { OsintTicker } from "./components/widgets/OsintTicker";
import { TimeControls } from "./components/widgets/TimeControls";
import { useAppFilters } from "./hooks/useAppFilters";
import { useEntitySelection } from "./hooks/useEntitySelection";
import { useEntityWorker } from "./hooks/useEntityWorker";
import { useInfraData } from "./hooks/useInfraData";
import { useIntelEvents } from "./hooks/useIntelEvents";
import { useJS8Stations } from "./hooks/useJS8Stations";
import { useMaritimeRisk } from "./hooks/useMaritimeRisk";
import { useMissionArea } from "./hooks/useMissionArea";
import { parseMissionHash } from "./hooks/useMissionHash";
import { useISSTracker } from "./hooks/useISSTracker";
import { useNDBCBuoys } from "./hooks/useNDBCBuoys";
import { usePassPredictions } from "./hooks/usePassPredictions";
import { useReplayController } from "./hooks/useReplayController";
import { useRFSites } from "./hooks/useRFSites";
import { useSatNOGS } from "./hooks/useSatNOGS";
import { useSidebarState } from "./hooks/useSidebarState";
import { useSystemHealth } from "./hooks/useSystemHealth";
import { useTowers } from "./hooks/useTowers";
import { useViewMode } from "./hooks/useViewMode";
import type { CoTEntity, MapActions, MissionProps } from "./types";

function App() {
  // ── View & sidebar state ──────────────────────────────────────────────────
  const { viewMode, setViewMode } = useViewMode();
  const {
    isAlertsOpen,
    setIsAlertsOpen,
    isSystemSettingsOpen,
    setIsSystemSettingsOpen,
    isSystemHealthOpen,
    setIsSystemHealthOpen,
    isAIAnalystOpen,
    setIsAIAnalystOpen,
    isTerminalOpen,
    setIsTerminalOpen,
  } = useSidebarState();

  // ── Intel event feed ──────────────────────────────────────────────────────
  const { events, addEvent, alertsCount } = useIntelEvents();

  // ── Filter state ──────────────────────────────────────────────────────────
  const {
    filters,
    handleFilterChange,
    handleOrbitalFilterChange,
    showVelocityVectors,
    handleVelocityVectorToggle,
    showHistoryTails,
    handleHistoryTailsToggle,
    globeMode,
    handleGlobeModeToggle,
    showTerminator,
    handleTerminatorToggle,
    orbitalFilters,
    tacticalFilters,
    activeServices,
    rfParams,
  } = useAppFilters(addEvent);

  // ── Entity selection ──────────────────────────────────────────────────────
  const {
    selectedEntity,
    setSelectedEntity,
    historySegments,
    setHistorySegments,
    followMode,
    setFollowMode,
    orbitalSatellitesRef,
    selectedSatNorad,
    handleEntitySelect,
    handleEntityLiveUpdate,
    handleSetSelectedSatNorad,
  } = useEntitySelection(addEvent);

  // ── Replay controller ─────────────────────────────────────────────────────
  const {
    replayMode,
    setReplayMode,
    isPlaying,
    setIsPlaying,
    replayTime,
    setReplayTime,
    replayRange,
    playbackSpeed,
    setPlaybackSpeed,
    historyDuration,
    setHistoryDuration,
    replayEntities,
    replayTimeRef,
    loadReplayData,
    updateReplayFrame,
  } = useReplayController();

  // ── Core entity worker ────────────────────────────────────────────────────
  const currentMissionRef = useRef<{
    lat: number;
    lon: number;
    radius_nm: number;
  } | null>(null);

  const {
    entitiesRef,
    satellitesRef,
    knownUidsRef,
    drStateRef,
    visualStateRef,
    prevCourseRef,
    alertedEmergencyRef,
  } = useEntityWorker({ onEvent: addEvent, currentMissionRef });

  const countsRef = useRef({ air: 0, sea: 0, orbital: 0 });

  // ── Track counts ──────────────────────────────────────────────────────────
  const [trackCounts, setTrackCounts] = useState({
    air: 0,
    sea: 0,
    orbital: 0,
  });

  // Background entity cleanup + counting (runs regardless of viewMode)
  useEffect(() => {
    const maintenance = () => {
      const now = Date.now();
      const STALE_THRESHOLD_AIR_MS = 120 * 1000;
      const STALE_THRESHOLD_SEA_MS = 300 * 1000;

      let air = 0,
        sea = 0,
        orbital = 0;
      const stale: string[] = [];

      entitiesRef.current.forEach((entity, uid) => {
        const isShip = entity.type?.includes("S");
        const threshold = isShip
          ? STALE_THRESHOLD_SEA_MS
          : STALE_THRESHOLD_AIR_MS;
        if (now - entity.lastSeen > threshold) {
          stale.push(uid);
        } else {
          if (isShip) sea++;
          else air++;
        }
      });

      stale.forEach((uid) => {
        entitiesRef.current.delete(uid);
        knownUidsRef.current.delete(uid);
      });

      satellitesRef.current.forEach((sat) => {
        if (sat.detail?.constellation !== "Starlink") orbital++;
      });

      if (
        viewMode === "DASHBOARD" ||
        viewMode === "RADIO" ||
        viewMode === "INTEL"
      ) {
        if (
          air !== countsRef.current.air ||
          sea !== countsRef.current.sea ||
          orbital !== countsRef.current.orbital
        ) {
          countsRef.current = { air, sea, orbital };
          setTrackCounts({ air, sea, orbital });
        }
      }
    };

    const timer = setInterval(maintenance, 1000);
    return () => clearInterval(timer);
  }, [entitiesRef, satellitesRef, knownUidsRef, viewMode]);

  // ── Infrastructure data ───────────────────────────────────────────────────
  const { cablesData, stationsData, outagesData, gdeltData, ixpData, facilityData } = useInfraData();
  const [worldCountriesData, setWorldCountriesData] =
    useState<FeatureCollection | null>(null);

  useEffect(() => {
    fetch("/world-countries.json")
      .then((res) => res.json())
      .then((data) => setWorldCountriesData(data))
      .catch((err) =>
        console.error("Failed to load world countries GeoJSON:", err),
      );
  }, []);

  // ── Supporting data hooks ─────────────────────────────────────────────────
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

  const [mapActions, setMapActions] = useState<MapActions | null>(null);
  const [missionProps, setMissionProps] = useState<MissionProps | null>(null);
  const [orbitalViewMode, setOrbitalViewMode] = useState<"2D" | "3D">("3D");

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
    onEntitySelect: handleSetSelectedSatNorad as unknown as (
      entity: CoTEntity | null,
    ) => void,
    onMissionPropsReady: setMissionProps,
    initialLat:
      parseMissionHash().lat ??
      parseFloat(import.meta.env.VITE_CENTER_LAT || "45.5152"),
    initialLon:
      parseMissionHash().lon ??
      parseFloat(import.meta.env.VITE_CENTER_LON || "-122.6784"),
  });

  const obsLat = missionProps?.currentMission?.lat ?? 45.5152;
  const obsLon = missionProps?.currentMission?.lon ?? -122.6784;
  const { passes: intelPasses } = usePassPredictions(obsLat, obsLon, {
    category: "intel",
    hours: 1,
    minElevation: 10,
    skip: !missionProps?.currentMission,
  });
  const alertedPassesRef = useRef<Set<string>>(new Set());

  // Orbital AOS alert — fires addEvent when an intel sat is ≤30 min from AOS
  useEffect(() => {
    if (intelPasses.length === 0) return;
    const now = Date.now();
    const ALERT_WINDOW_MS = 30 * 60 * 1000;
    for (const pass of intelPasses) {
      const aosMs = Date.parse(pass.aos);
      const passKey = `${pass.norad_id}-${pass.aos}`;
      if (
        aosMs > now &&
        aosMs - now <= ALERT_WINDOW_MS &&
        !alertedPassesRef.current.has(passKey)
      ) {
        alertedPassesRef.current.add(passKey);
        const minutesAway = Math.round((aosMs - now) / 60000);
        addEvent({
          type: "alert",
          message: `INTEL SAT — ${pass.name} AOS in ${minutesAway}min (El ${Math.round(pass.max_elevation)}°)`,
          entityType: "orbital",
        });
      }
    }
  }, [intelPasses, addEvent]);

  const { stationsRef, fetchVerification } = useSatNOGS(
    orbitalFilters.showSatNOGS,
  );

  const { rfSitesRef, loading: repeatersLoading } = useRFSites(
    rfParams.enabled,
    missionProps?.currentMission?.lat ?? 45.5152,
    missionProps?.currentMission?.lon ?? -122.6784,
    rfParams.rfRadius,
    activeServices,
    rfParams.modes,
    rfParams.rfEmcommOnly,
  );

  const [mapBounds, setMapBounds] = useState<{
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  } | null>(null);

  const { towers } = useTowers(mapBounds, filters.showTowers);
  const { buoyData } = useNDBCBuoys(mapBounds, filters.showBuoys === true);
  const { position: issPosition, track: issTrack } = useISSTracker({
    enabled: filters.showISS !== false,
  });

  // Maritime conditions panel — active only when a sea vessel is selected
  const isSea = !!selectedEntity?.type?.includes("S");
  const { report: riskReport, isLoading: riskLoading } = useMaritimeRisk(
    isSea ? selectedEntity!.uid : null,
    isSea ? selectedEntity!.lat : null,
    isSea ? selectedEntity!.lon : null,
  );

  const handleOpenAnalystPanel = useCallback(() => {
    setIsAIAnalystOpen(true);
  }, [setIsAIAnalystOpen]);

  // ── Render ────────────────────────────────────────────────────────────────
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
            alerts={events.filter((e) => e.type === "alert")}
            onAlertsClose={() => setIsAlertsOpen(false)}
            filters={filters as any}
            onFilterChange={handleFilterChange as any}
            isSystemSettingsOpen={isSystemSettingsOpen}
            onSystemSettingsClick={() =>
              setIsSystemSettingsOpen(!isSystemSettingsOpen)
            }
            onSystemSettingsClose={() => setIsSystemSettingsOpen(false)}
            isSystemHealthOpen={isSystemHealthOpen}
            onSystemHealthClick={() =>
              setIsSystemHealthOpen(!isSystemHealthOpen)
            }
            onSystemHealthClose={() => setIsSystemHealthOpen(false)}
            onTerminalClick={() => setIsTerminalOpen(!isTerminalOpen)}
          />
        }
        leftSidebar={
          viewMode === "TACTICAL" ? (
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
          ) : viewMode === "ORBITAL" ? (
            <OrbitalSidebarLeft
              filters={orbitalFilters}
              onFilterChange={handleOrbitalFilterChange}
              selectedSatNorad={selectedSatNorad}
              setSelectedSatNorad={handleSetSelectedSatNorad}
              trackCount={trackCounts.orbital}
            />
          ) : viewMode === "INTEL" ? (
            <IntelSidebar
              onFlyTo={(lat, lon) => mapActions?.flyTo(lat, lon)}
              onGenerateSitrep={(context) => {
                setSelectedEntity({
                  uid: "sitrep-intel",
                  type: "sitrep",
                  callsign: "INTEL SITREP",
                  lat: 0,
                  lon: 0,
                  altitude: 0,
                  course: 0,
                  speed: 0,
                  lastSeen: Date.now(),
                  trail: [],
                  uidHash: 0,
                  detail: { sitrep_context: context },
                } as CoTEntity);
                setIsAIAnalystOpen(true);
              }}
            />
          ) : null
        }
        rightSidebar={
          viewMode === "TACTICAL" ||
          viewMode === "ORBITAL" ||
          viewMode === "INTEL" ? (
            <div className="flex flex-col h-full gap-4">
              {selectedEntity && (selectedEntity as any).type !== "sitrep" && (
                <div className="flex-1 min-h-0 pointer-events-auto overflow-hidden flex flex-col">
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
                        mapActions.flyTo(
                          selectedEntity.lat,
                          selectedEntity.lon,
                        );
                      }
                    }}
                    onOpenAnalystPanel={handleOpenAnalystPanel}
                    onHistoryLoaded={setHistorySegments}
                    fetchSatnogsVerification={fetchVerification}
                  />
                  {isSea && (
                    <MaritimeRiskPanel
                      report={riskReport}
                      isLoading={riskLoading}
                      callsign={selectedEntity.callsign || selectedEntity.uid}
                    />
                  )}
                </div>
              )}
            </div>
          ) : null
        }
      >
        {viewMode === "TACTICAL" ? (
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
              followMode={followMode}
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
              buoyData={buoyData}
              ixpData={ixpData}
              facilityData={facilityData}
              issPosition={issPosition}
              issTrack={issTrack}
            />

            {replayMode && (
              <TimeControls
                isOpen={true}
                isPlaying={isPlaying}
                currentTime={replayTime}
                startTime={replayRange.start}
                endTime={replayRange.end}
                playbackSpeed={playbackSpeed}
                historyDuration={historyDuration}
                onTogglePlay={() => setIsPlaying((p) => !p)}
                onSeek={(t) => {
                  setReplayTime(t);
                  replayTimeRef.current = t;
                  updateReplayFrame(t);
                }}
                onSpeedChange={setPlaybackSpeed}
                onDurationChange={(hours) => {
                  setHistoryDuration(hours);
                  loadReplayData(hours);
                }}
                onClose={() => {
                  setReplayMode(false);
                  setIsPlaying(false);
                }}
              />
            )}
          </>
        ) : viewMode === "ORBITAL" ? (
          <OrbitalMap
            filters={orbitalFilters}
            globeMode={orbitalViewMode === "3D"}
            onEntitySelect={handleEntitySelect}
            selectedEntity={selectedEntity}
            onCountsUpdate={
              setTrackCounts as unknown as (counts: {
                air: number;
                sea: number;
                orbital: number;
              }) => void
            }
            onEvent={addEvent}
            missionArea={missionArea as any}
            onMissionPropsReady={setMissionProps}
            onMapActionsReady={setMapActions}
            showVelocityVectors={false}
            showHistoryTails={showHistoryTails}
            onToggleGlobe={() =>
              setOrbitalViewMode(orbitalViewMode === "3D" ? "2D" : "3D")
            }
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
        ) : viewMode === "INTEL" ? (
          <div className="absolute inset-0 flex flex-col">
            <IntelGlobe
              gdeltData={gdeltData as FeatureCollection | null}
              worldCountriesData={worldCountriesData}
              onEntitySelect={handleEntitySelect}
            />
            <div className="absolute bottom-0 left-0 right-0 z-10">
              <OsintTicker speed={110} />
            </div>
          </div>
        ) : viewMode === "DASHBOARD" ? (
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
            ixpData={ixpData}
            facilityData={facilityData}
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
      <AIAnalystPanel
        entity={selectedEntity}
        isOpen={isAIAnalystOpen}
        onClose={() => {
          setIsAIAnalystOpen(false);
          if (selectedEntity?.type === "sitrep") {
            setSelectedEntity(null);
          }
        }}
        autoRunTrigger={0}
        isSidebarClosed={!selectedEntity || selectedEntity.type === "sitrep"}
      />
    </>
  );
}

export default App;

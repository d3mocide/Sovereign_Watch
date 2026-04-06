import type { FeatureCollection } from "geojson";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Plane, Anchor, Satellite, Radar, X, XCircle } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { getSetupStatus } from "./api/auth";
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
import { LoginView } from "./components/views/LoginView";
import { AIAnalystPanel } from "./components/widgets/AIAnalystPanel";
import { GlobalTerminalWidget } from "./components/widgets/GlobalTerminalWidget";
import { MaritimeRiskPanel } from "./components/widgets/MaritimeRiskPanel";
import { NewsItem, NewsWidget } from "./components/widgets/NewsWidget";
import { OsintTicker } from "./components/widgets/OsintTicker";
import { TimeControls } from "./components/widgets/TimeControls";
import { useAppFilters } from "./hooks/useAppFilters";
import { useAuth } from "./hooks/useAuth";
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

interface IntelArticleContent {
  url: string;
  title: string;
  content: string;
}

const StatsDashboardView = lazy(() => import('./components/views/StatsDashboardView'));

function AuthenticatedApp() {

  type RegionalRiskResponse = {
    h3_region_id: string;
    risk_score: number;
    narrative_summary: string;
    anomalous_uids: string[];
    escalation_indicators: string[];
    confidence: number;
    pattern_detected: boolean;
    anomaly_count: number;
  };

  type RegionalRiskUiState = {
    status: "loading" | "success" | "error";
    h3Region: string;
    lat: number;
    lon: number;
    result?: RegionalRiskResponse;
    error?: string;
    updatedAt: number;
  };

  type DomainAnalysisResponse = {
    domain: string;
    h3_region: string;
    narrative: string;
    risk_score: number;
    indicators: string[];
    context_snapshot: Record<string, unknown>;
  };

  type DomainAnalysisUiState = {
    status: "loading" | "success" | "error";
    domain: string;
    h3Region: string;
    lat: number;
    lon: number;
    result?: DomainAnalysisResponse;
    error?: string;
    updatedAt: number;
  };

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
    isUserMenuOpen,
    setIsUserMenuOpen,
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
  } = useAppFilters(addEvent, viewMode);

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
    loadedPointCount,
    loadedTrackCount,
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
    streamConnectedRef,
  } = useEntityWorker({ onEvent: addEvent, currentMissionRef });

  const countsRef = useRef({ air: 0, sea: 0, orbital: 0 });

  // ── Track counts ──────────────────────────────────────────────────────────
  const [trackCounts, setTrackCounts] = useState({
    air: 0,
    sea: 0,
    orbital: 0,
  });
  const [activeIntelArticle, setActiveIntelArticle] = useState<NewsItem | null>(
    null,
  );
  const [intelArticleContent, setIntelArticleContent] =
    useState<IntelArticleContent | null>(null);
  const [intelArticleLoading, setIntelArticleLoading] = useState(false);
  const [intelArticleError, setIntelArticleError] = useState<string | null>(
    null,
  );
  const [regionalRiskUi, setRegionalRiskUi] =
    useState<RegionalRiskUiState | null>(null);
  const [domainAnalysisUi, setDomainAnalysisUi] =
    useState<DomainAnalysisUiState | null>(null);

  // Background entity cleanup + counting (runs regardless of viewMode)
  useEffect(() => {
    const maintenance = () => {
      const now = Date.now();
      const STALE_THRESHOLD_AIR_MS = 120 * 1000;
      const STALE_THRESHOLD_SEA_MS = 300 * 1000;
      const DISCONNECTED_GRACE_MS = 15 * 60 * 1000;
      const streamConnected = streamConnectedRef.current;

      let air = 0,
        sea = 0,
        orbital = 0;
      const stale: string[] = [];

      entitiesRef.current.forEach((entity, uid) => {
        const isShip = entity.type?.includes("S");
        const baseThreshold = isShip
          ? STALE_THRESHOLD_SEA_MS
          : STALE_THRESHOLD_AIR_MS;
        const threshold = streamConnected
          ? baseThreshold
          : Math.max(baseThreshold, DISCONNECTED_GRACE_MS);
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
  }, [entitiesRef, satellitesRef, knownUidsRef, streamConnectedRef, viewMode]);

  // ── Infrastructure data ───────────────────────────────────────────────────
  const {
    cablesData,
    stationsData,
    outagesData,
    gdeltData,
    nwsAlertsData,
    ixpData,
    facilityData,
  } = useInfraData();
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

  const handleAnalyzeRegionalRisk = useCallback(
    async (h3Region: string, lat: number, lon: number) => {
      const requestTimeoutMs = 15000;
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), requestTimeoutMs);

      setRegionalRiskUi({
        status: "loading",
        h3Region,
        lat,
        lon,
        updatedAt: Date.now(),
      });

      addEvent({
        message: `AI_ROUTER: Evaluating regional risk for ${h3Region} @ ${lat.toFixed(3)}, ${lon.toFixed(3)}`,
        type: "new",
        entityType: "infra",
      });

      try {
        const response = await fetch("/api/ai_router/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            h3_region: h3Region,
            lookback_hours: 24,
            include_gdelt: true,
            include_tak: true,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText);
          throw new Error(`AI router request failed (${response.status}): ${errorText}`);
        }

        const result = (await response.json()) as RegionalRiskResponse;
        const riskPct = Math.round((result.risk_score ?? 0) * 100);

        setRegionalRiskUi({
          status: "success",
          h3Region,
          lat,
          lon,
          result,
          updatedAt: Date.now(),
        });

        addEvent({
          message: `RISK ${riskPct}% | ${result.h3_region_id} | anomalies=${result.anomaly_count} | ${result.narrative_summary}`,
          type: riskPct >= 70 ? "alert" : "new",
          entityType: "infra",
        });
      } catch (error: unknown) {
        const message =
          error instanceof DOMException && error.name === "AbortError"
            ? `Regional risk request timed out after ${requestTimeoutMs / 1000}s`
            : error instanceof Error
              ? error.message
              : "Unknown regional risk error";

        setRegionalRiskUi({
          status: "error",
          h3Region,
          lat,
          lon,
          error: message,
          updatedAt: Date.now(),
        });

        addEvent({
          message: `AI_ROUTER ERROR: ${message}`,
          type: "lost",
          entityType: "infra",
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    [addEvent],
  );

  const handleAnalyzeDomain = useCallback(
    async (domain: 'air' | 'sea' | 'orbital', h3Region: string, lat: number, lon: number) => {
      const requestTimeoutMs = 20000;
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), requestTimeoutMs);

      setDomainAnalysisUi({ status: "loading", domain, h3Region, lat, lon, updatedAt: Date.now() });

      addEvent({
        message: `DOMAIN_INTEL: Analyzing ${domain.toUpperCase()} domain for ${h3Region} @ ${lat.toFixed(3)}, ${lon.toFixed(3)}`,
        type: "new",
        entityType: domain === "air" ? "air" : domain === "sea" ? "sea" : "orbital",
      });

      try {
        const response = await fetch(`/api/ai_router/analyze/${domain}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ h3_region: h3Region, lookback_hours: 24 }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText);
          throw new Error(`Domain analysis request failed (${response.status}): ${errorText}`);
        }

        const result = (await response.json()) as DomainAnalysisResponse;
        const riskPct = Math.round((result.risk_score ?? 0) * 100);

        setDomainAnalysisUi({ status: "success", domain, h3Region, lat, lon, result, updatedAt: Date.now() });

        addEvent({
          message: `${domain.toUpperCase()} INTEL RISK ${riskPct}% | ${result.indicators?.slice(0, 2).join(" | ") || result.narrative?.slice(0, 80)}`,
          type: riskPct >= 70 ? "alert" : "new",
          entityType: domain === "air" ? "air" : domain === "sea" ? "sea" : "orbital",
        });
      } catch (error: unknown) {
        const message =
          error instanceof DOMException && error.name === "AbortError"
            ? `Domain analysis timed out after ${requestTimeoutMs / 1000}s`
            : error instanceof Error
              ? error.message
              : "Unknown domain analysis error";

        setDomainAnalysisUi({ status: "error", domain, h3Region, lat, lon, error: message, updatedAt: Date.now() });

        addEvent({ message: `DOMAIN_INTEL ERROR: ${message}`, type: "lost", entityType: "infra" });
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    [addEvent],
  );

  const hasRightSidebarContent =
    !!(selectedEntity && (selectedEntity as any).type !== "sitrep") ||
    (viewMode === "INTEL" &&
      !(isAIAnalystOpen && selectedEntity?.type === "sitrep"));

  const regionalRiskOverlay =
    viewMode === "TACTICAL" || viewMode === "ORBITAL" ? (
      <div
        className="pointer-events-none absolute top-[74px] z-20 max-w-md"
        style={{
          right: hasRightSidebarContent ? 380 : 20,
          transition: "right 0.3s ease-in-out",
        }}
      >
        {regionalRiskUi && (
          <div className="pointer-events-auto border border-cyan-400/30 bg-black/80 backdrop-blur-xl rounded-sm shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-cyan-300/90 font-semibold">
                <Radar size={12} />
                Regional Risk Analysis
              </div>
              <button
                onClick={() => setRegionalRiskUi(null)}
                className="text-white/40 hover:text-white/80 transition-colors"
                aria-label="Dismiss regional risk panel"
                title="Dismiss"
              >
                <X size={12} />
              </button>
            </div>

            <div className="px-3 py-2 text-[11px] text-white/70 font-mono">
              <div>{regionalRiskUi.h3Region}</div>
              <div className="text-white/45">
                {regionalRiskUi.lat.toFixed(3)}, {regionalRiskUi.lon.toFixed(3)}
              </div>
            </div>

            {regionalRiskUi.status === "loading" ? (
              <div className="flex items-center gap-2 px-3 pb-3 text-[11px] text-cyan-200">
                <Loader2 size={13} className="animate-spin" />
                Evaluating multi-INT signals...
              </div>
            ) : regionalRiskUi.status === "error" ? (
              <div className="px-3 pb-3">
                <div className="flex items-start gap-2 text-[11px] text-red-300">
                  <XCircle size={13} className="mt-0.5 shrink-0" />
                  <span>{regionalRiskUi.error}</span>
                </div>
              </div>
            ) : (
              <div className="px-3 pb-3 space-y-2">
                <div className="flex items-center gap-2 text-[11px] text-emerald-300">
                  <CheckCircle2 size={13} className="shrink-0" />
                  Completed
                </div>
                <div className="text-[11px] text-white/80">
                  Risk: <span className="font-semibold text-amber-300">{Math.round((regionalRiskUi.result?.risk_score ?? 0) * 100)}%</span>
                  <span className="text-white/50"> | anomalies: {regionalRiskUi.result?.anomaly_count ?? 0}</span>
                </div>
                <div className="text-[11px] text-white/70 leading-relaxed">
                  {regionalRiskUi.result?.narrative_summary || "No narrative available."}
                </div>
                {(regionalRiskUi.result?.escalation_indicators?.length ?? 0) > 0 && (
                  <div className="flex items-start gap-2 text-[10px] text-amber-200/90">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    <span>{regionalRiskUi.result?.escalation_indicators.slice(0, 3).join(" | ")}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Domain Intelligence Panel ── */}
        {domainAnalysisUi && (
          <div className="pointer-events-auto mt-2 border border-[#a855f7]/30 bg-black/80 backdrop-blur-xl rounded-sm shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-semibold"
                   style={{ color: domainAnalysisUi.domain === 'air' ? '#38bdf8' : domainAnalysisUi.domain === 'sea' ? '#22d3ee' : '#c084fc' }}>
                {domainAnalysisUi.domain === 'air' ? <Plane size={12} /> : domainAnalysisUi.domain === 'sea' ? <Anchor size={12} /> : <Satellite size={12} />}
                {domainAnalysisUi.domain.toUpperCase()} Intelligence
              </div>
              <button
                onClick={() => setDomainAnalysisUi(null)}
                className="text-white/40 hover:text-white/80 transition-colors"
                aria-label="Dismiss domain analysis panel"
                title="Dismiss"
              >
                <X size={12} />
              </button>
            </div>

            <div className="px-3 py-2 text-[11px] text-white/70 font-mono">
              <div>{domainAnalysisUi.h3Region}</div>
              <div className="text-white/45">
                {domainAnalysisUi.lat.toFixed(3)}, {domainAnalysisUi.lon.toFixed(3)}
              </div>
            </div>

            {domainAnalysisUi.status === "loading" ? (
              <div className="flex items-center gap-2 px-3 pb-3 text-[11px] text-purple-200">
                <Loader2 size={13} className="animate-spin" />
                Fusing {domainAnalysisUi.domain} domain intelligence...
              </div>
            ) : domainAnalysisUi.status === "error" ? (
              <div className="px-3 pb-3">
                <div className="flex items-start gap-2 text-[11px] text-red-300">
                  <XCircle size={13} className="mt-0.5 shrink-0" />
                  <span>{domainAnalysisUi.error}</span>
                </div>
              </div>
            ) : (
              <div className="px-3 pb-3 space-y-2">
                <div className="flex items-center gap-2 text-[11px] text-emerald-300">
                  <CheckCircle2 size={13} className="shrink-0" />
                  Completed
                </div>
                <div className="text-[11px] text-white/80">
                  Risk: <span className="font-semibold text-amber-300">{Math.round((domainAnalysisUi.result?.risk_score ?? 0) * 100)}%</span>
                </div>
                <div className="text-[11px] text-white/70 leading-relaxed">
                  {domainAnalysisUi.result?.narrative || "No narrative available."}
                </div>
                {(domainAnalysisUi.result?.indicators?.length ?? 0) > 0 && (
                  <div className="space-y-1">
                    {domainAnalysisUi.result!.indicators.slice(0, 5).map((ind, i) => (
                      <div key={i} className="flex items-start gap-2 text-[10px] text-amber-200/90">
                        <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                        <span>{ind}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    ) : null;

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

  useEffect(() => {
    if (viewMode !== "INTEL" && viewMode !== "TACTICAL") {
      setActiveIntelArticle(null);
      setIntelArticleContent(null);
      setIntelArticleError(null);
      setIntelArticleLoading(false);
    }
  }, [viewMode]);

  const articleViewerOverlay = activeIntelArticle ? (
    <div className="absolute z-20 top-[71px] left-6 right-6 bottom-14 pointer-events-none flex justify-center">
      <div className="pointer-events-auto w-full max-w-5xl h-full max-h-[78vh] bg-black/90 border border-white/15 backdrop-blur-xl rounded-sm shadow-2xl overflow-hidden flex flex-col">
        <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/5">
          <div className="min-w-0 flex items-center gap-2">
            <span className="text-[8px] font-bold tracking-[.3em] text-amber-400/80 uppercase">
              Article Viewer
            </span>
            <span className="text-[8px] text-white/35 truncate max-w-[52ch]">
              {activeIntelArticle.source} - {activeIntelArticle.title}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                window.open(
                  activeIntelArticle.link,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
              className="p-1 text-white/40 hover:text-white/80 hover:bg-white/10 rounded transition-colors focus-visible:ring-1 focus-visible:ring-amber-400 outline-none"
              aria-label="Open article in new tab"
              title="Open in new tab"
            >
              <ExternalLink size={12} />
            </button>
            <button
              onClick={() => setActiveIntelArticle(null)}
              className="p-1 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors focus-visible:ring-1 focus-visible:ring-red-400 outline-none"
              aria-label="Close article viewer"
              title="Close"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        <div className="relative flex-1 min-h-0 bg-black/70 overflow-y-auto custom-scrollbar p-3">
          {intelArticleLoading && (
            <div className="h-full w-full flex items-center justify-center gap-2 text-white/45 text-[11px] tracking-wider uppercase">
              <Loader2 size={14} className="animate-spin" />
              Loading Reader
            </div>
          )}

          {!intelArticleLoading && intelArticleError && (
            <div className="h-full w-full flex flex-col items-center justify-center gap-3 text-center px-6">
              <span className="text-[11px] uppercase tracking-[.2em] text-red-400/80">
                Reader Unavailable
              </span>
              <p className="text-[11px] text-white/50 max-w-md">
                {intelArticleError}. Use the external-link button to open the
                source directly.
              </p>
            </div>
          )}

          {!intelArticleLoading &&
            !intelArticleError &&
            intelArticleContent && (
              <div className="max-w-3xl mx-auto space-y-3">
                {intelArticleContent.title && (
                  <h3 className="text-[14px] font-bold tracking-wide text-white/85">
                    {intelArticleContent.title}
                  </h3>
                )}
                <div className="text-[11px] leading-relaxed text-white/70 whitespace-pre-wrap">
                  {intelArticleContent.content}
                </div>
              </div>
            )}

          <div className="sticky bottom-0 mt-3 text-[8px] text-white/35 bg-black/60 border border-white/10 rounded px-2 py-1">
            Reader mode is fetched by backend extraction to avoid publisher
            iframe restrictions.
          </div>
        </div>
      </div>
    </div>
  ) : null;

  useEffect(() => {
    if (!activeIntelArticle) {
      setIntelArticleContent(null);
      setIntelArticleError(null);
      setIntelArticleLoading(false);
      return;
    }

    const controller = new AbortController();
    const loadArticle = async () => {
      setIntelArticleLoading(true);
      setIntelArticleError(null);
      try {
        const resp = await fetch(
          `/api/news/article?url=${encodeURIComponent(activeIntelArticle.link)}`,
          { signal: controller.signal },
        );

        if (!resp.ok) {
          throw new Error(`Reader unavailable (${resp.status})`);
        }

        const data: IntelArticleContent = await resp.json();
        setIntelArticleContent(data);
      } catch (err) {
        if (controller.signal.aborted) return;
        setIntelArticleContent(null);
        setIntelArticleError(
          err instanceof Error
            ? err.message
            : "Unable to load article in reader mode",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIntelArticleLoading(false);
        }
      }
    };

    void loadArticle();
    return () => controller.abort();
  }, [activeIntelArticle]);

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
            showH3Risk={filters.showH3Risk as boolean}
            onToggleH3Risk={() =>
              handleFilterChange("showH3Risk", !(filters.showH3Risk as boolean))
            }
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
            isUserMenuOpen={isUserMenuOpen}
            onUserMenuClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            onUserMenuClose={() => setIsUserMenuOpen(false)}
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
          viewMode === "INTEL" ? hasRightSidebarContent ? (
            <div className="flex flex-col h-full gap-4">
              {selectedEntity && (selectedEntity as any).type !== "sitrep" ? (
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
                    onOpenSource={
                      viewMode === "INTEL" || viewMode === "TACTICAL"
                        ? (payload) =>
                            setActiveIntelArticle({
                              title: payload.title,
                              link: payload.url,
                              source: payload.source ?? "GDELT",
                              pub_date:
                                payload.pubDate ?? new Date().toISOString(),
                            })
                        : undefined
                    }
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
              ) : viewMode === "INTEL" &&
                !(isAIAnalystOpen && selectedEntity?.type === "sitrep") ? (
                <div className="h-[75vh] max-h-[75vh] min-h-0 pointer-events-auto overflow-hidden flex flex-col bg-black/60 border border-white/10 backdrop-blur-xl rounded-sm shadow-2xl">
                  <NewsWidget
                    onOpenArticle={(article) => setActiveIntelArticle(article)}
                  />
                </div>
              ) : null}
            </div>
          ) : null : null
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
              onAnalyzeRegionalRisk={handleAnalyzeRegionalRisk}
              onAnalyzeDomain={handleAnalyzeDomain}
              missionArea={missionArea as any}
              currentMission={(missionArea as any).currentMission ?? null}
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
              nwsAlertsData={nwsAlertsData}
              buoyData={buoyData}
              ixpData={ixpData}
              facilityData={facilityData}
              issPosition={issPosition}
              issTrack={issTrack}
            />

            {articleViewerOverlay}
            {regionalRiskOverlay}

            {replayMode && (
              <TimeControls
                isOpen={true}
                isPlaying={isPlaying}
                currentTime={replayTime}
                startTime={replayRange.start}
                endTime={replayRange.end}
                playbackSpeed={playbackSpeed}
                historyDuration={historyDuration}
                loadedPointCount={loadedPointCount}
                loadedTrackCount={loadedTrackCount}
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
          <>
            <OrbitalMap
            filters={orbitalFilters}
            globeMode={orbitalViewMode === "3D"}
            onEntitySelect={handleEntitySelect}
            onAnalyzeRegionalRisk={handleAnalyzeRegionalRisk}
            onAnalyzeDomain={handleAnalyzeDomain}
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
            issPosition={issPosition}
            issTrack={issTrack}
            />
            {regionalRiskOverlay}
          </>
        ) : viewMode === "INTEL" ? (
          <div className="absolute inset-0 flex flex-col">
            <IntelGlobe
              gdeltData={gdeltData as FeatureCollection | null}
              worldCountriesData={worldCountriesData}
              filters={filters as any}
              onEntitySelect={handleEntitySelect}
            />
            {articleViewerOverlay}
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

function App() {
  const { status: authStatus, hasRole } = useAuth();
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      getSetupStatus()
        .then(({ setup_required }) => setSetupRequired(setup_required))
        .catch(() => setSetupRequired(false));
    }
  }, [authStatus]);

  if (authStatus === 'initialising') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-950">
        <div className="text-emerald-400 font-mono text-sm animate-pulse uppercase tracking-widest">
          Authenticating…
        </div>
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    if (setupRequired === null) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-gray-950">
          <div className="text-emerald-400 font-mono text-sm animate-pulse uppercase tracking-widest">
            Initialising…
          </div>
        </div>
      );
    }
    return <LoginView isFirstSetup={setupRequired} />;
  }

  if (authStatus === 'authenticated') {
    const isStatsRoute = window.location.pathname === '/stats';

    if (isStatsRoute && hasRole('admin')) {
      return (
        <Suspense fallback={
          <div className="flex h-screen w-screen items-center justify-center bg-black text-[#0f0] font-mono animate-pulse">
            INITIALIZING STATS...
          </div>
        }>
          <StatsDashboardView />
        </Suspense>
      );
    }
    return <AuthenticatedApp />;
  }

  return null;
}

export default App;

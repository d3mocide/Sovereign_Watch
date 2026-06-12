import type { Layer } from "@deck.gl/core";
import { PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { FeatureCollection } from "geojson";
import { getTerminatorLayer } from "../components/map/TerminatorLayer";
import {

  CoTEntity,
  DnsRootServer,
  HistorySegment,
  JS8Station,
  MapFilters,
  RFSite,
  Tower,
} from "../types";
import { maidenheadToLatLon } from "../utils/map/geoUtils";
import { buildAOTLayers } from "./buildAOTLayers";
import { buildAuroraLayer } from "./buildAuroraLayer";
import { buildEntityLayers } from "./buildEntityLayers";
import { buildGdeltLayer } from "./buildGdeltLayer";
import { buildH3CoverageLayer } from "./buildH3CoverageLayer";
import { buildH3RiskLayer } from "./buildH3RiskLayer";
import { buildHoldingPatternLayer } from "./buildHoldingPatternLayer";
import { buildInfraLayers } from "./buildInfraLayers";
import { buildISSLayer } from "./buildISSLayer";
import { buildJammingLayer } from "./buildJammingLayer";
import { buildJS8Layers } from "./buildJS8Layers";
import { buildNDBCLayer } from "./buildNDBCLayer";
import { buildNWSAlertsLayer } from "./buildWeatherAlertsLayer";
import { buildRFLayers } from "./buildRFLayers";
import { buildTowerLayer } from "./buildTowerLayer";
import { buildTrailLayers } from "./buildTrailLayers";
import { getOrbitalLayers } from "./OrbitalLayer";
import { LayerCache } from "./layerCache";

import type { GroundTrackPoint, ISSPosition, SatNOGSStation } from "../types";
import type { H3CellData } from "./buildH3CoverageLayer";
import type { H3RiskCellData } from "../api/h3Risk";
import type { ClusterInfo } from "../api/clusters";
import { buildClusterLayer } from "./buildClusterLayer";
import { buildAirspaceLayer } from "./buildAirspaceLayer";
import { buildClausalChainLayer, ClausalChain } from "./buildClausalChainLayer";
import { buildFIRMSLayer } from "./buildFIRMSLayer";
import { buildDarkVesselLayer } from "./buildDarkVesselLayer";

interface LayerCompositionOptions {
  interpolatedEntities: CoTEntity[];
  filteredSatellites: CoTEntity[];
  js8Stations: JS8Station[];
  rfSites: RFSite[];
  h3Cells: H3CellData[];
  h3RiskCells?: H3RiskCellData[];
  cablesData: FeatureCollection | null;
  stationsData: FeatureCollection | null;
  outagesData: FeatureCollection | null;
  towersData?: Tower[];
  worldCountriesData: FeatureCollection | null;
  countryOutageMap: Record<string, Record<string, unknown>>;
  currentSelected: CoTEntity | null;
  hoveredEntity: CoTEntity | null;
  filters: MapFilters | undefined;
  globeMode: boolean;
  enable3d: boolean;
  zoom: number;
  now: number;
  ownGrid: string | null;
  kiwiNode: { lat: number; lon: number; host: string } | null;
  historyTails: boolean;
  velocityVectors: boolean;
  predictedGroundTrack?: GroundTrackPoint[];
  observer?: { lat: number; lon: number; radiusKm: number } | null;
  currentMission?: { lat: number; lon: number } | null;
  aotShapes: { maritime: number[][]; aviation: number[][] } | null;
  /** NOAA aurora 1-hour forecast GeoJSON */
  auroraData?: any;
  /** Active GPS jamming zones GeoJSON from JammingAnalyzer */
  jammingData?: any;
  /** GDELT v2 geolocated news events GeoJSON */
  gdeltData?: any;
  /** Active NWS weather alerts GeoJSON */
  nwsAlertsData?: FeatureCollection | null;
  /** NDBC Ocean Buoy latest observations GeoJSON (Phase 1 Geospatial) */
  buoyData?: FeatureCollection | null;
  /** PeeringDB Internet Exchange Points GeoJSON (Initiative B) */
  ixpData?: FeatureCollection | null;
  /** PeeringDB Data Center Facilities GeoJSON (Initiative B) */
  facilityData?: FeatureCollection | null;
  /** DNS root server health records (Infra-06) */
  dnsRootData?: DnsRootServer[];

  /** Current ISS position (Initiative B real-time tracker) */
  issPosition?: ISSPosition | null;
  /** ISS ground track ring buffer (Initiative B real-time tracker) */
  issTrack?: ISSPosition[];
  /**
   * Minimum tone threshold for GDELT dots (Goldstein scale).
   * Default -Infinity = show all.  Pass -2 for conflict+tension only.
   */
  gdeltToneThreshold?: number;
  onEntitySelect: (entity: CoTEntity | null) => void;
  setHoveredEntity: (entity: CoTEntity | null) => void;
  setHoverPosition: (pos: { x: number; y: number } | null) => void;
  setHoveredInfra: (info: unknown) => void;
  setSelectedInfra: (info: unknown) => void;
  /** Aviation holding pattern GeoJSON (from /api/holding-patterns/active) */
  holdingPatternData?: FeatureCollection | null;
  historySegments?: HistorySegment[];
  satnogsStations?: SatNOGSStation[];
  /** ST-DBSCAN cluster centroids (Phase 2) */
  clusterData?: ClusterInfo[];
  /** Clausal chain narrative traces (AI router medial clauses) */
  clausalChainsData?: ClausalChain[];
  /** OpenAIP global restricted/danger/prohibited airspace zones GeoJSON */
  airspaceZonesData?: FeatureCollection | null;
  /** NASA FIRMS VIIRS/MODIS thermal hotspot detections GeoJSON */
  firmsData?: FeatureCollection | null;
  /** Dark vessel candidates (AIS-gap cross-reference) GeoJSON */
  darkVesselData?: FeatureCollection | null;
  /**
   * Frame-to-frame layer memoization. Pass a per-overlay instance so layer
   * groups whose inputs are unchanged return the identical Layer instances
   * (deck.gl then skips diffing and attribute regeneration for them).
   * Omitting it disables caching (every group rebuilds on every call).
   */
  cache?: LayerCache;
}

export function composeAllLayers(options: LayerCompositionOptions) {
  const {
    interpolatedEntities,
    filteredSatellites,
    js8Stations,
    rfSites,
    h3Cells,
    h3RiskCells = [],
    cablesData,
    stationsData,
    outagesData,
    towersData,
    worldCountriesData,
    countryOutageMap,
    currentSelected,
    hoveredEntity,
    filters,
    globeMode,
    enable3d,
    zoom,
    now,
    ownGrid,
    kiwiNode,
    historyTails,
    velocityVectors,
    predictedGroundTrack,
    observer,
    currentMission,
    aotShapes,
    auroraData,
    jammingData,
    gdeltData,
    nwsAlertsData,
    gdeltToneThreshold,
    buoyData,
    ixpData,
    facilityData,
    dnsRootData,
    issPosition,
    issTrack,
    onEntitySelect,
    setHoveredEntity,
    setHoverPosition,
    setHoveredInfra,
    setSelectedInfra,
    historySegments,
    holdingPatternData,
    clusterData,
    clausalChainsData,
    airspaceZonesData,
    firmsData,
    darkVesselData,
  } = options;

  const cache = options.cache ?? new LayerCache();

  // Pulse/glow animations tick at 10 Hz instead of every frame. The shimmer
  // stays visually smooth, but the pulsing groups become cache hits for ~6
  // consecutive frames instead of recomputing their color attributes at 60 fps.
  const pulseNow = now - (now % 100);

  // JS8 station layers
  const js8Layers = cache.get(
    "js8",
    [
      js8Stations,
      ownGrid,
      globeMode,
      currentSelected,
      onEntitySelect,
      setHoveredEntity,
      setHoverPosition,
      zoom,
    ],
    () => {
      if (js8Stations.length === 0 || !ownGrid) return [];
      const [ownLat, ownLon] = maidenheadToLatLon(ownGrid);
      const selectedJS8Callsign =
        currentSelected?.type === "js8" ? currentSelected.callsign : null;
      return buildJS8Layers(
        js8Stations,
        ownLat,
        ownLon,
        globeMode,
        selectedJS8Callsign,
        onEntitySelect,
        setHoveredEntity,
        setHoverPosition,
        zoom,
      );
    },
  );

  // Repeater infrastructure layers
  const repeaterLayers = cache.get(
    "repeaters",
    [
      filters?.showRepeaters,
      rfSites,
      globeMode,
      onEntitySelect,
      setHoveredEntity,
      setHoverPosition,
    ],
    () =>
      filters?.showRepeaters && rfSites.length > 0
        ? buildRFLayers(
            rfSites,
            globeMode,
            onEntitySelect,
            setHoveredEntity,
            setHoverPosition,
          )
        : [],
  );

  // Submarine Cables & Stations Layers (+ PeeringDB IXPs/Facilities)
  // Built once per input change; the outage and asset groups are spread at
  // different z-positions, so they are cached under separate keys sharing
  // one memoized build.
  const infraDeps = [
    cablesData,
    stationsData,
    outagesData,
    filters,
    setHoveredInfra,
    setSelectedInfra,
    currentSelected,
    globeMode,
    worldCountriesData,
    countryOutageMap,
    ixpData,
    facilityData,
    dnsRootData,
  ];
  let infraResult: { outages: Layer[]; assets: Layer[] } | null = null;
  const buildInfra = () =>
    (infraResult ??= buildInfraLayers(
      cablesData,
      stationsData,
      outagesData,
      filters || null,
      setHoveredInfra,
      setSelectedInfra,
      currentSelected,
      globeMode,
      worldCountriesData,
      countryOutageMap,
      ixpData ?? null,
      facilityData ?? null,
      dnsRootData ?? [],
    ));
  const outageLayers = cache.get(
    "infra-outages",
    infraDeps,
    () => buildInfra().outages,
  );
  const infraAssetLayers = cache.get(
    "infra-assets",
    infraDeps,
    () => buildInfra().assets,
  );

  // KiwiSDR node marker layer
  const kiwiLayers = cache.get("kiwi-node", [kiwiNode, pulseNow], () => {
    if (!kiwiNode || kiwiNode.lat === 0 || kiwiNode.lon === 0) return [];
    const pulse = (Math.sin(pulseNow / 400) + 1) / 2;

    return [
      new ScatterplotLayer({
        id: "kiwi-node-core",
        data: [kiwiNode],
        getPosition: (d: { lat: number; lon: number; host: string }) => [
          d.lon,
          d.lat,
        ],
        getFillColor: [251, 113, 133, 180 + pulse * 75],
        getLineColor: [251, 113, 133, 200],
        getRadius: 4000,
        radiusUnits: "meters",
        stroked: true,
        getLineWidth: 1200,
        lineWidthUnits: "meters",
        pickable: true,
      }),

      // Kiwi Node Label (re-enabled as requested by user - HUD style)
      new TextLayer({
        id: "kiwi-node-label",
        data: [kiwiNode],
        getPosition: (d: { lat: number; lon: number; host: string }) => [
          d.lon,
          d.lat,
        ],
        getText: (d: { lat: number; lon: number; host: string }) =>
          `LIVE SDR\n${d.host}`,
        getSize: 10,
        getColor: [240, 240, 240, 255],
        background: true,
        getBackgroundColor: [15, 15, 15, 190],
        getBorderColor: [251, 113, 133, 200], // Rose border for SDR
        getBorderWidth: 1,
        backgroundPadding: [6, 4],
        getPixelOffset: [0, -22],
        fontFamily: "monospace",
        fontWeight: 600,
        billboard: true,
        pickable: false,
        lineHeight: 1.2,
      }),
    ];
  });

  return [
    ...cache.get("h3-coverage", [h3Cells, filters?.showH3Coverage], () =>
      buildH3CoverageLayer(h3Cells, !!filters?.showH3Coverage),
    ),
    ...cache.get("h3-risk", [h3RiskCells, filters?.showH3Risk], () =>
      buildH3RiskLayer(h3RiskCells, !!filters?.showH3Risk),
    ),
    // Terminator geometry only changes once per minute
    ...cache.get(
      "terminator",
      [filters?.showTerminator, Math.floor(now / 60_000)],
      () => [getTerminatorLayer(!!filters?.showTerminator)],
    ),
    // Aurora oval sits below infra/entity layers — large translucent area fill
    ...cache.get(
      "aurora",
      [auroraData, filters?.showAurora, globeMode, pulseNow],
      () => buildAuroraLayer(auroraData, !!filters?.showAurora, globeMode, pulseNow),
    ),
    // Regional Shading Tier: Internet Outages
    ...outageLayers,
    // Regional Shading Tier: NWS Alerts
    // Keep NWS above outages so polygon picking is not masked in 2D.
    ...cache.get(
      "nws-alerts",
      [
        nwsAlertsData,
        filters?.showNWSAlerts,
        globeMode,
        setHoveredInfra,
        setSelectedInfra,
      ],
      () =>
        buildNWSAlertsLayer(
          nwsAlertsData ?? null,
          !!filters?.showNWSAlerts,
          globeMode,
          setHoveredInfra,
          setSelectedInfra,
        ),
    ),
    // Tactical Zones Tier: OpenAIP global airspace zones
    ...cache.get(
      "airspace",
      [
        airspaceZonesData,
        filters?.showAirspaceZones,
        globeMode,
        setHoveredInfra,
        setSelectedInfra,
        filters?.airspaceZoneTypes,
      ],
      () =>
        buildAirspaceLayer({
          data: airspaceZonesData ?? null,
          enabled: !!filters?.showAirspaceZones,
          globeMode,
          onHover: setHoveredInfra,
          onSelect: setSelectedInfra,
          enabledTypes: filters?.airspaceZoneTypes as string[] | undefined,
        }),
    ),
    // Fixed Infrastructure Assets Tier
    ...infraAssetLayers,
    // NDBC Ocean Buoys — Maritime Layer Group (Z-order 8–11)
    ...cache.get(
      "ndbc-buoys",
      [buoyData, filters?.showBuoys, globeMode, setHoveredInfra, setSelectedInfra],
      () =>
        buildNDBCLayer(
          buoyData ?? null,
          !!filters?.showBuoys,
          globeMode,
          setHoveredInfra,
          setSelectedInfra,
        ),
    ),
    // Jamming zones sit above infra but below entity chevrons
    ...cache.get(
      "jamming",
      [
        jammingData,
        filters?.showJamming,
        globeMode,
        pulseNow,
        setHoveredEntity,
        setHoverPosition,
        onEntitySelect,
      ],
      () =>
        buildJammingLayer(
          jammingData,
          !!filters?.showJamming,
          globeMode,
          pulseNow,
          setHoveredEntity,
          setHoverPosition,
          onEntitySelect,
        ),
    ),
    // Dark vessel candidates — Tier 5 Dynamic (depthBias -108, above jamming)
    ...cache.get(
      "dark-vessels",
      [
        darkVesselData,
        filters?.showDarkVessels,
        globeMode,
        pulseNow,
        setHoveredInfra,
        setSelectedInfra,
      ],
      () =>
        buildDarkVesselLayer(
          darkVesselData ?? null,
          !!filters?.showDarkVessels,
          globeMode,
          pulseNow,
          setHoveredInfra,
          setSelectedInfra,
        ),
    ),
    // NASA FIRMS thermal hotspots — Tier 4 Infra Assets (depthBias -92)
    ...cache.get(
      "firms",
      [
        firmsData,
        filters?.showFIRMS,
        globeMode,
        pulseNow,
        setHoveredInfra,
        setSelectedInfra,
      ],
      () =>
        buildFIRMSLayer(
          firmsData ?? null,
          !!filters?.showFIRMS,
          globeMode,
          pulseNow,
          setHoveredInfra,
          setSelectedInfra,
        ),
    ),
    // Cluster octagons sit above jamming so they are visible through the circular halos
    ...cache.get(
      "clusters",
      [
        clusterData,
        filters?.showClusters,
        globeMode,
        setHoveredEntity,
        setHoverPosition,
        onEntitySelect,
      ],
      () =>
        buildClusterLayer(
          clusterData ?? [],
          !!filters?.showClusters,
          globeMode,
          setHoveredEntity,
          setHoverPosition,
          onEntitySelect,
        ),
    ),
    // GDELT geolocated news events — sit above infra/jamming, below entity chevrons
    // Auto-enabled when a mission area is active (shows all events in AOT)
    ...cache.get(
      "gdelt",
      [
        gdeltData,
        filters?.showGdelt,
        globeMode,
        gdeltToneThreshold,
        filters?.showGdeltLabels,
        setHoveredEntity,
        setHoverPosition,
        onEntitySelect,
      ],
      () =>
        buildGdeltLayer(
          gdeltData,
          !!filters?.showGdelt,
          globeMode,
          gdeltToneThreshold,
          filters?.showGdeltLabels === true,
          (entity, pos) => {
            setHoveredEntity(entity);
            setHoverPosition(pos);
          },
          (g) => {
            // Transform GDELT point into a virtual entity for the sidebar
            onEntitySelect({
              uid: `gdelt-${g.event_id}`,
              type: "gdelt",
              callsign: g.name,
              lat: g.lat,
              lon: g.lon,
              altitude: 0,
              course: 0,
              speed: 0,
              lastSeen: Date.now(),
              detail: g as any,
              trail: [],
              uidHash: 0,
            });
          },
        ),
    ),
    // Clausal chain narrative traces — sits above GDELT events, below ISS/orbital
    ...cache.get(
      "clausal-chains",
      [
        clausalChainsData,
        filters?.showClausalChains,
        globeMode,
        setHoveredEntity,
        setHoverPosition,
        onEntitySelect,
      ],
      () =>
        buildClausalChainLayer(
          clausalChainsData || null,
          filters?.showClausalChains === true,
          globeMode,
          (entity, pos) => {
            setHoveredEntity(entity);
            setHoverPosition(pos);
          },
          onEntitySelect,
        ),
    ),
    // ISS real-time tracker — Navigation/Orbital group (Z-order 15–17)
    ...cache.get(
      "iss",
      [issPosition, issTrack, globeMode, filters?.showISS, setHoveredInfra, setSelectedInfra],
      () =>
        filters?.showISS !== false
          ? buildISSLayer({
              position: issPosition ?? null,
              track: issTrack ?? [],
              globeMode,
              onHover: setHoveredInfra,
              onSelect: setSelectedInfra,
            })
          : [],
    ),
    ...getOrbitalLayers({
      satellites: filteredSatellites,
      selectedEntity: currentSelected,
      hoveredEntity: hoveredEntity,
      now,
      showHistoryTails: historyTails,
      projectionMode: globeMode ? "globe" : "mercator",
      zoom,
      predictedGroundTrack: predictedGroundTrack,
      onEntitySelect,
      onHover: (entity, x, y) => {
        if (entity) {
          setHoveredEntity(entity);
          setHoverPosition({ x, y });
        } else {
          setHoveredEntity(null);
          setHoverPosition(null);
        }
      },
    }),
    ...cache.get(
      "aot",
      [aotShapes, filters, globeMode, observer, currentMission],
      () =>
        buildAOTLayers(
          aotShapes,
          filters,
          globeMode,
          observer,
          currentMission
            ? {
                lat: currentMission.lat,
                lon: currentMission.lon,
                radiusKm: (Number(filters?.rfRadius) || 300) * 1.852,
              }
            : null,
        ),
    ),
    ...repeaterLayers,
    ...kiwiLayers,
    ...cache.get(
      "towers",
      [towersData, filters?.showTowers, globeMode, setHoveredInfra, setSelectedInfra],
      () =>
        buildTowerLayer(
          towersData || [],
          filters?.showTowers === true,
          globeMode,
          setHoveredInfra,
          setSelectedInfra,
        ),
    ),
    // Historical flight path (solid coverage segments + ghost gap segments)
    ...cache.get("history-track", [historySegments], () => {
      if (!historySegments || historySegments.length === 0) return [];
      const solid = historySegments.filter((s) => !s.isGap);
      const firstSeg = solid[0];
      const lastSeg = solid[solid.length - 1];
      return [
        new PathLayer({
          id: "history-track-solid",
          data: solid,
          getPath: (d: HistorySegment) => d.path,
          getColor: [0, 255, 65, 160],
          getWidth: 2,
          widthUnits: "pixels",
          jointRounded: true,
          capRounded: true,
          pickable: false,
        }),
        new PathLayer({
          id: "history-track-gap",
          data: historySegments.filter((s) => s.isGap),
          getPath: (d: HistorySegment) => d.path,
          getColor: [251, 191, 36, 80],
          getWidth: 1,
          widthUnits: "pixels",
          dashJustified: true,
          getDashArray: [4, 4],
          extensions: [],
          pickable: false,
        }),
        // Start dot (oldest point) and end dot (current / newest)
        new ScatterplotLayer({
          id: "history-track-endpoints",
          data:
            solid.length === 0
              ? []
              : [
                  {
                    pos: firstSeg.path[0],
                    color: [0, 255, 65, 220] as [number, number, number, number],
                  },
                  {
                    pos: lastSeg.path[lastSeg.path.length - 1],
                    color: [255, 200, 0, 220] as [
                      number,
                      number,
                      number,
                      number,
                    ],
                  },
                ],
          getPosition: (d: {
            pos: [number, number, number];
            color: [number, number, number, number];
          }) => d.pos,
          getFillColor: (d: {
            pos: [number, number, number];
            color: [number, number, number, number];
          }) => d.color,
          getRadius: 5,
          radiusUnits: "pixels",
          pickable: false,
        }),
      ];
    }),
    ...buildTrailLayers(
      interpolatedEntities,
      currentSelected,
      globeMode,
      historyTails,
    ),
    // Aviation Holding Patterns - Pulsed Amber tactical zones
    ...cache.get(
      "holding-patterns",
      [
        holdingPatternData,
        filters?.showHoldingPatterns,
        globeMode,
        pulseNow,
        setHoveredEntity,
        setHoverPosition,
        onEntitySelect,
      ],
      () =>
        buildHoldingPatternLayer(
          holdingPatternData || null,
          filters?.showHoldingPatterns !== false,
          globeMode,
          pulseNow,
          (entity, pos) => {
            setHoveredEntity(entity);
            setHoverPosition(pos);
          },
          onEntitySelect,
        ),
    ),
    ...buildEntityLayers(
      interpolatedEntities,
      currentSelected,
      globeMode,
      enable3d,
      velocityVectors,
      now,
      onEntitySelect,
      setHoveredEntity,
      setHoverPosition,
      currentSelected,
    ),
    ...js8Layers,
  ];
}

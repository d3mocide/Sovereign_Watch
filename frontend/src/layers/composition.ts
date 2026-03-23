import type { Layer } from "@deck.gl/core";
import { PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { FeatureCollection } from "geojson";
import { getTerminatorLayer } from "../components/map/TerminatorLayer";
import {
  CoTEntity,
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
import { buildInfraLayers } from "./buildInfraLayers";
import { buildJammingLayer } from "./buildJammingLayer";
import { buildJS8Layers } from "./buildJS8Layers";
import { buildRFLayers } from "./buildRFLayers";
import { buildTowerLayer } from "./buildTowerLayer";
import { buildTrailLayers } from "./buildTrailLayers";
import { getOrbitalLayers } from "./OrbitalLayer";
import { getSatNOGSLayer } from "./SatNOGSLayer";

import type { GroundTrackPoint, SatNOGSStation } from "../types";
import type { H3CellData } from "./buildH3CoverageLayer";

interface LayerCompositionOptions {
  interpolatedEntities: CoTEntity[];
  filteredSatellites: CoTEntity[];
  js8Stations: JS8Station[];
  rfSites: RFSite[];
  h3Cells: H3CellData[];
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
  /** Historical flight path segments from TrackHistoryPanel */
  historySegments?: HistorySegment[];
  satnogsStations?: SatNOGSStation[];
}

export function composeAllLayers(options: LayerCompositionOptions) {
  const {
    interpolatedEntities,
    filteredSatellites,
    js8Stations,
    rfSites,
    h3Cells,
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
    gdeltToneThreshold,
    onEntitySelect,
    setHoveredEntity,
    setHoverPosition,
    setHoveredInfra,
    setSelectedInfra,
    historySegments,
    satnogsStations,
  } = options;

  // JS8 station layers
  let js8Layers: Layer[] = [];
  if (js8Stations.length > 0 && ownGrid) {
    const [ownLat, ownLon] = maidenheadToLatLon(ownGrid);
    const selectedJS8Callsign =
      currentSelected?.type === "js8" ? currentSelected.callsign : null;
    js8Layers = buildJS8Layers(
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
  }

  // Repeater infrastructure layers
  let repeaterLayers: Layer[] = [];
  if (filters?.showRepeaters && rfSites.length > 0) {
    repeaterLayers = buildRFLayers(
      rfSites,
      globeMode,
      onEntitySelect,
      setHoveredEntity,
      setHoverPosition,
    );
  }

  // Submarine Cables & Stations Layers
  const infraLayers = buildInfraLayers(
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
  );

  // KiwiSDR node marker layer
  const kiwiLayers: Layer[] = [];
  if (kiwiNode && kiwiNode.lat !== 0 && kiwiNode.lon !== 0) {
    const pulse = (Math.sin(now / 400) + 1) / 2;

    kiwiLayers.push(
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
    );

    // Kiwi Node Label (re-enabled as requested by user - HUD style)
    kiwiLayers.push(
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
    );
  }

  return [
    ...buildH3CoverageLayer(h3Cells, !!filters?.showH3Coverage),
    getTerminatorLayer(!!filters?.showTerminator),
    // Aurora oval sits below infra/entity layers — large translucent area fill
    ...buildAuroraLayer(auroraData, !!filters?.showAurora, globeMode, now),
    ...infraLayers,
    getSatNOGSLayer(satnogsStations || [], !!filters?.showSatNOGS),
    // Jamming zones sit above infra but below entity chevrons
    ...buildJammingLayer(jammingData, !!filters?.showJamming, globeMode, now),
    // GDELT geolocated news events — sit above infra/jamming, below entity chevrons
    // Auto-enabled when a mission area is active (shows all events in AOT)
    ...buildGdeltLayer(
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
    ...buildAOTLayers(
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
    ...repeaterLayers,
    ...kiwiLayers,
    ...buildTowerLayer(
      towersData || [],
      filters?.showTowers === true,
      globeMode,
      setHoveredInfra,
      setSelectedInfra,
    ),
    // Historical flight path (solid coverage segments + ghost gap segments)
    ...(historySegments && historySegments.length > 0
      ? [
          new PathLayer({
            id: "history-track-solid",
            data: historySegments.filter((s) => !s.isGap),
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
            data: (() => {
              const solid = historySegments.filter((s) => !s.isGap);
              if (solid.length === 0) return [];
              const firstSeg = solid[0];
              const lastSeg = solid[solid.length - 1];
              return [
                {
                  pos: firstSeg.path[0],
                  color: [0, 255, 65, 220] as [number, number, number, number],
                },
                {
                  pos: lastSeg.path[lastSeg.path.length - 1],
                  color: [255, 200, 0, 220] as [number, number, number, number],
                },
              ];
            })(),
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
        ]
      : []),
    ...buildTrailLayers(
      interpolatedEntities,
      currentSelected,
      globeMode,
      historyTails,
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

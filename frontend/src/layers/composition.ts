import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { CoTEntity, JS8Station, RFSite } from "../types";
import { buildJS8Layers } from "./buildJS8Layers";
import { buildRFLayers } from "./buildRFLayers";
import { buildInfraLayers } from "./buildInfraLayers";
import { getOrbitalLayers } from "./OrbitalLayer";
import { buildAOTLayers } from "./buildAOTLayers";
import { buildTrailLayers } from "./buildTrailLayers";
import { buildEntityLayers } from "./buildEntityLayers";
import { buildH3CoverageLayer } from "./buildH3CoverageLayer";
import { getTerminatorLayer } from "../components/map/TerminatorLayer";
import { maidenheadToLatLon } from "../utils/map/geoUtils";

interface LayerCompositionOptions {
  interpolatedEntities: CoTEntity[];
  filteredSatellites: CoTEntity[];
  js8Stations: JS8Station[];
  rfSites: RFSite[];
  h3Cells: any[];
  cablesData: any;
  stationsData: any;
  outagesData: any;
  worldCountriesData: any;
  countryOutageMap: Record<string, any>;
  currentSelected: CoTEntity | null;
  hoveredEntity: CoTEntity | null;
  filters: any;
  globeMode: boolean;
  enable3d: boolean;
  zoom: number;
  now: number;
  ownGrid: string | null;
  kiwiNode: { lat: number; lon: number; host: string } | null;
  historyTails: boolean;
  velocityVectors: boolean;
  predictedGroundTrack?: any[];
  observer?: any;
  currentMission?: any;
  aotShapes: any;
  onEntitySelect: (entity: CoTEntity | null) => void;
  setHoveredEntity: (entity: CoTEntity | null) => void;
  setHoverPosition: (pos: { x: number; y: number } | null) => void;
  setHoveredInfra: (info: any) => void;
  setSelectedInfra: (info: any) => void;
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
    onEntitySelect,
    setHoveredEntity,
    setHoverPosition,
    setHoveredInfra,
    setSelectedInfra,
  } = options;

  // JS8 station layers
  let js8Layers: any[] = [];
  if (js8Stations.length > 0 && ownGrid) {
    const [ownLat, ownLon] = maidenheadToLatLon(ownGrid);
    const selectedJS8Callsign = currentSelected?.type === "js8" ? currentSelected.callsign : null;
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
  let repeaterLayers: any[] = [];
  if (filters?.showRepeaters && rfSites.length > 0) {
    repeaterLayers = buildRFLayers(
      rfSites,
      globeMode,
      onEntitySelect,
      setHoveredEntity,
      setHoverPosition,
      zoom,
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
    countryOutageMap
  );

  // KiwiSDR node marker layer
  const kiwiLayers: any[] = [];
  if (kiwiNode && kiwiNode.lat !== 0 && kiwiNode.lon !== 0) {
    const pulse = (Math.sin(now / 400) + 1) / 2;

    kiwiLayers.push(
      new ScatterplotLayer({
        id: "kiwi-node-core",
        data: [kiwiNode],
        getPosition: (d: any) => [d.lon, d.lat],
        getFillColor: [251, 113, 133, 180 + pulse * 75],
        getLineColor: [251, 113, 133, 200],
        getRadius: 4000,
        radiusUnits: "meters",
        stroked: true,
        getLineWidth: 1200,
        lineWidthUnits: "meters",
        pickable: true,
      })
    );

    // Kiwi Node Label (re-enabled as requested by user - HUD style)
    kiwiLayers.push(
      new TextLayer({
        id: "kiwi-node-label",
        data: [kiwiNode],
        getPosition: (d: any) => [d.lon, d.lat],
        getText: (d: any) => `LIVE SDR\n${d.host}`,
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
      })
    );
  }

  return [
    ...buildH3CoverageLayer(h3Cells, !!filters?.showH3Coverage),
    getTerminatorLayer(!!filters?.showTerminator),
    ...infraLayers,
    ...getOrbitalLayers({
      satellites: filteredSatellites,
      selectedEntity: currentSelected,
      hoveredEntity: hoveredEntity,
      now,
      showHistoryTails: historyTails,
      showFootprints: filters?.showFootprints,
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
          radiusKm: (filters?.rfRadius || 300) * 1.852,
        }
        : null,
    ),
    ...repeaterLayers,
    ...kiwiLayers,
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

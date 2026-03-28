/**
 * buildJammingLayer — GPS Jamming / Integrity Degradation overlay.
 *
 * Renders active GPS jamming zones detected by the backend JammingAnalyzer.
 * Each zone is a ScatterplotLayer circle centred on the H3 hex centroid,
 * color-coded by confidence and assessment type.
 *
 * Assessment color scheme:
 *   'jamming'       → red/orange  (intentional)
 *   'mixed'         → amber       (ambiguous)
 *   'space_weather' → purple      (solar origin)
 *   'equipment'     → blue-grey   (single aircraft fault)
 *
 * Data source: /api/jamming/active (GeoJSON FeatureCollection)
 */

import type { PickingInfo } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import type { CoTEntity } from "../types";
import { JammingZone } from "../types";

const ASSESSMENT_COLORS: Record<string, [number, number, number]> = {
  jamming: [251, 60, 60], // Red
  mixed: [251, 191, 36], // Amber
  space_weather: [167, 102, 255], // Purple
  equipment: [100, 130, 160], // Blue-grey
};

function zoneColor(
  zone: JammingZone,
  alpha: number,
): [number, number, number, number] {
  const rgb = ASSESSMENT_COLORS[zone.assessment] ?? [200, 200, 200];
  return [...rgb, alpha] as [number, number, number, number];
}

export function buildJammingLayer(
  jammingData: any,
  visible: boolean,
  globeMode: boolean,
  now: number,
  setHoveredEntity?: (entity: CoTEntity | null) => void,
  setHoverPosition?: (pos: { x: number; y: number } | null) => void,
  onEntitySelect?: (entity: CoTEntity | null) => void,
): any[] {
  if (!visible || !jammingData?.features?.length) return [];

  const features = jammingData.features as Array<{
    geometry: { coordinates: [number, number] };
    properties: JammingZone;
  }>;

  const data = features.map((f) => ({
    ...f.properties,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  })) as (JammingZone & { lon: number; lat: number })[];

  const zoneToEntity = (
    zone: JammingZone & { lon: number; lat: number },
  ): CoTEntity => {
    const label = String(zone.assessment || "mixed").toUpperCase();
    return {
      uid: `jamming-${zone.h3_index}`,
      lat: zone.lat,
      lon: zone.lon,
      altitude: 0,
      type: "jamming",
      course: 0,
      speed: 0,
      callsign: `GPS SIGINT ${label}`,
      lastSeen: Date.now(),
      trail: [],
      uidHash: 0,
      detail: zone as unknown as Record<string, unknown>,
    };
  };

  const handleHover = (
    info: PickingInfo<JammingZone & { lon: number; lat: number }>,
  ) => {
    if (!setHoveredEntity || !setHoverPosition) return;

    if (!info.object) {
      setHoveredEntity(null);
      setHoverPosition(null);
      return;
    }
    setHoveredEntity(zoneToEntity(info.object));
    setHoverPosition({ x: info.x, y: info.y });
  };

  const handleClick = (
    info: PickingInfo<JammingZone & { lon: number; lat: number }>,
  ) => {
    if (!onEntitySelect || !info.object) return;
    onEntitySelect(zoneToEntity(info.object));
  };

  // Pulse animation: outer ring expands and fades
  const pulse = (now % 3000) / 3000; // 0→1 over 3 s

  const layers: any[] = [
    // Pulsing outer ring
    new ScatterplotLayer({
      id: `jamming-pulse-${globeMode ? "globe" : "merc"}`,
      data,
      getPosition: (d: any) => [d.lon, d.lat, 0],
      getRadius: (d: JammingZone) => {
        // Tighter footprint for readability: pulse approx 22-60 km.
        const base = 22_000 + d.confidence * 18_000;
        return base + pulse * 20_000;
      },
      radiusUnits: "meters",
      getFillColor: [0, 0, 0, 0],
      getLineColor: (d: JammingZone) => {
        const alpha = Math.round(180 * (1 - Math.pow(pulse, 2)));
        return zoneColor(d, alpha);
      },
      getLineWidth: 2000,
      lineWidthUnits: "meters",
      stroked: true,
      filled: false,
      pickable: true,
      wrapLongitude: !globeMode,
      parameters: { depthTest: !!globeMode, depthBias: globeMode ? -30.0 : 0 },
      onHover: handleHover,
      onClick: handleClick,
      updateTriggers: {
        getRadius: [now],
        getLineColor: [now],
      },
    }),

    // Solid fill zone
    new ScatterplotLayer({
      id: `jamming-fill-${globeMode ? "globe" : "merc"}`,
      data,
      getPosition: (d: any) => [d.lon, d.lat, 0],
      // Tighter static zone footprint: approx 18-45 km.
      getRadius: (d: JammingZone) => 18_000 + d.confidence * 27_000,
      radiusUnits: "meters",
      getFillColor: (d: JammingZone) =>
        zoneColor(d, Math.round(d.confidence * 60 + 15)),
      getLineColor: (d: JammingZone) => zoneColor(d, 200),
      getLineWidth: 1500,
      lineWidthUnits: "meters",
      stroked: true,
      filled: true,
      pickable: true,
      wrapLongitude: !globeMode,
      parameters: { depthTest: !!globeMode, depthBias: globeMode ? -25.0 : 0 },
      onHover: handleHover,
      onClick: handleClick,
    }),
  ];

  return layers;
}

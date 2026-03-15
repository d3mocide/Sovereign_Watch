import { ScatterplotLayer, LineLayer, TextLayer } from "@deck.gl/layers";
import type { JS8Station, CoTEntity } from "../types";

/**
 * Map SNR to RGBA using JS8Call decode thresholds:
 *   ≥ −18 dB  all speed modes decode  → emerald
 *   ≥ −24 dB  Normal / Slow decode    → yellow
 *   < −24 dB  Slow-only or below floor → red
 */
function snrRgba(snr: number, alpha: number): [number, number, number, number] {
  if (snr >= -18) return [52, 211, 153, alpha];   // emerald-400
  if (snr >= -24) return [250, 204, 21, alpha];   // yellow-400
  return [248, 113, 113, alpha];                   // red-400
}

/** Wrap a JS8 station as a fake CoTEntity so it travels through the existing
 *  select / hover / tooltip pipeline without extra state machinery. */
export function stationToEntity(station: JS8Station): CoTEntity {
  return {
    uid: `js8-${station.callsign}`,
    type: "js8",
    lat: station.lat,
    lon: station.lon,
    altitude: 0,
    course: station.bearing_deg ?? 0,
    speed: 0,
    callsign: station.callsign,
    lastSeen: (station.ts_unix || 0) * 1000,
    trail: [],
    uidHash: 0,
    detail: {
      snr: station.snr,
      grid: station.grid,
      distance_km: station.distance_km,
      distance_mi: station.distance_mi,
      bearing_deg: station.bearing_deg,
      freq: station.freq,
    },
  };
}

export function buildJS8Layers(
  stations: JS8Station[],
  ownLat: number,
  ownLon: number,
  globeMode: boolean | undefined,
  selectedCallsign: string | null,
  onEntitySelect: (entity: CoTEntity | null) => void,
  setHoveredEntity: (entity: CoTEntity | null) => void,
  setHoverPosition: (pos: { x: number; y: number } | null) => void,
  zoom: number,
): any[] {
  // Only render stations that have been geocoded from their grid square
  const positioned = stations.filter((s) => s.lat !== 0 || s.lon !== 0);
  if (positioned.length === 0) return [];

  const modeKey = globeMode ? "globe" : "merc";
  const depthParams = { depthTest: !!globeMode, depthBias: globeMode ? -210.0 : 0 };
  const layers: any[] = [];

  // 1. Bearing lines from own station to each heard station
  if (ownLat !== 0 || ownLon !== 0) {
    layers.push(
      new LineLayer({
        id: `js8-bearing-lines-${modeKey}`,
        data: positioned,
        getSourcePosition: () => [ownLon, ownLat, 0],
        getTargetPosition: (d: JS8Station) => [d.lon, d.lat, 0],
        getColor: (d: JS8Station) => snrRgba(d.snr, 35),
        getWidth: 1,
        widthMinPixels: 1,
        pickable: false,
        wrapLongitude: !globeMode,
        parameters: depthParams,
      }),
    );
  }

  // 2. Station dots (pickable — hover tooltip + click to select)
  layers.push(
    new ScatterplotLayer({
      id: `js8-stations-${modeKey}`,
      data: positioned,
      getPosition: (d: JS8Station) => [d.lon, d.lat, 0],
      getRadius: (d: JS8Station) => (selectedCallsign === d.callsign ? 9 : 6),
      radiusUnits: "pixels" as const,
      radiusMinPixels: 5,
      getFillColor: (d: JS8Station) => snrRgba(d.snr, 255),
      getLineColor: (d: JS8Station) =>
        selectedCallsign === d.callsign
          ? [255, 255, 255, 255]
          : ([10, 10, 10, 180] as [number, number, number, number]),
      getLineWidth: 1.5,
      lineWidthUnits: "pixels" as const,
      stroked: true,
      filled: true,
      pickable: true,
      wrapLongitude: !globeMode,
      parameters: depthParams,
      onHover: (info: any) => {
        if (info.object) {
          setHoveredEntity(stationToEntity(info.object as JS8Station));
          setHoverPosition({ x: info.x, y: info.y });
        } else {
          setHoveredEntity(null);
          setHoverPosition(null);
        }
      },
      onClick: (info: any) => {
        if (info.object) {
          const station = info.object as JS8Station;
          const already = selectedCallsign === station.callsign;
          onEntitySelect(already ? null : stationToEntity(station));
        }
      },
      updateTriggers: {
        getRadius: [selectedCallsign],
        getLineColor: [selectedCallsign],
      },
    }),
  );
  
  // 3. Callsign labels (re-enabled as requested by user - HUD style)
  if (zoom >= 7) {
    layers.push(
      new TextLayer({
        id: `js8-labels-${modeKey}`,
        data: positioned,
        getPosition: (d: JS8Station) => [d.lon, d.lat, 0],
        getText: (d: JS8Station) => d.callsign,
        getSize: 12,
        getColor: [240, 240, 240, 255],
        background: true,
        getBackgroundColor: [15, 15, 15, 190],
        getBorderColor: (d: JS8Station) => snrRgba(d.snr, 255),
        getBorderWidth: 1,
        backgroundPadding: [6, 3],
        getPixelOffset: [0, -22],
        fontFamily: "monospace",
        fontWeight: 600,
        billboard: true,
        pickable: false,
        wrapLongitude: !globeMode,
        parameters: { ...depthParams, depthBias: -220.0 }, // Ensure on top of dots
      }),
    );
  }

  return layers;
}

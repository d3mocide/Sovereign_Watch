import { Layer } from "@deck.gl/core";
import { GeoJsonLayer } from "@deck.gl/layers";
import type { FeatureCollection } from "geojson";

export function buildHoldingPatternLayer(
  data: FeatureCollection | null,
  visible: boolean,
  _globeMode: boolean,
  now: number,
  onHover: (entity: any, pos: { x: number; y: number } | null) => void,
  onSelect: (entity: any) => void
): Layer[] {
  if (!visible || !data || !data.features || data.features.length === 0) {
    return [];
  }

  const pulse = (Math.sin(now / 800) + 1) / 2;
  const layers: Layer[] = [];

  // 1. The Alert Boundary (Z-Ring style) - Minimalist/Pulsing
  layers.push(
    new GeoJsonLayer({
      id: "holding-pattern-boundaries",
      data,
      visible,
      pickable: true,
      stroked: true,
      filled: true,
      lineWidthMinPixels: 2,
      pointRadiusMinPixels: 12, // Larger hit area for easier analyst hover
      getLineColor: [255, 140, 0, 100 + pulse * 80],
      getFillColor: [255, 140, 0, 15],
      getLineWidth: 2,
      dashJustified: true,
      getDashArray: [6, 4],
      wrapLongitude: !_globeMode,
      parameters: {
        depthTest: !!_globeMode,
        depthBias: _globeMode ? -205.0 : 0,
      },
      onHover: (info) => {
        if (info.object) {
          const p = info.object.properties;
          // Virtual entity for tooltip/analyst panel
          onHover({
            uid: `hold-${p.hex_id}`,
            type: "hold",
            callsign: `${p.callsign || p.hex_id} (HOLDING)`,
            lat: info.coordinate?.[1] || 0,
            lon: info.coordinate?.[0] || 0,
            altitude: p.altitude,
            course: 0,
            speed: 0,
            lastSeen: Date.now(),
            detail: p,
            trail: [],
            uidHash: 0,
          }, { x: info.x, y: info.y });
        } else {
          onHover(null, null);
        }
      },
      onClick: (info) => {
          if (info.object) {
             const p = info.object.properties;
             onSelect({
                uid: `hold-${p.hex_id}`,
                type: "hold",
                callsign: p.callsign || p.hex_id,
                lat: info.coordinate?.[1] || p.lat || 0,
                lon: info.coordinate?.[0] || p.lon || 0,
                altitude: p.altitude,
                course: 0,
                speed: 0,
                lastSeen: Date.now(),
                detail: p,
                trail: [],
                uidHash: 0,
             });
          }
      },
      updateTriggers: {
        getLineColor: [pulse],
      },
    })
  );

  return layers;
}

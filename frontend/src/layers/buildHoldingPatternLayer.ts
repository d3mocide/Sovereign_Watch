import { Layer } from "@deck.gl/core";
import { GeoJsonLayer } from "@deck.gl/layers";
import type { FeatureCollection } from "geojson";

type HoldProps = {
  turns_completed?: number | string;
};

function getHoldSeverityColor(turnsCompletedRaw: number | string | undefined) {
  const turns = Number(turnsCompletedRaw ?? 0);

  // Severity buckets:
  // <2 turns: amber, 2-5: orange, >=5: red (high-priority extended hold)
  if (turns >= 5) {
    return {
      stroke: [255, 56, 56],
      fill: [255, 56, 56],
      severity: 1.0,
    };
  }
  if (turns >= 2) {
    return {
      stroke: [255, 120, 0],
      fill: [255, 120, 0],
      severity: 0.65,
    };
  }
  return {
    stroke: [255, 183, 0],
    fill: [255, 183, 0],
    severity: 0.35,
  };
}

export function buildHoldingPatternLayer(
  data: FeatureCollection | null,
  visible: boolean,
  _globeMode: boolean,
  now: number,
  onHover: (entity: any, pos: { x: number; y: number } | null) => void,
  onSelect: (entity: any) => void,
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
      getLineColor: (f: any) => {
        const props = (f?.properties ?? {}) as HoldProps;
        const color = getHoldSeverityColor(props.turns_completed);
        const alpha = Math.round(90 + pulse * 90 + color.severity * 40);
        return [color.stroke[0], color.stroke[1], color.stroke[2], alpha];
      },
      getFillColor: (f: any) => {
        const props = (f?.properties ?? {}) as HoldProps;
        const color = getHoldSeverityColor(props.turns_completed);
        const alpha = Math.round(10 + color.severity * 35 + pulse * 6);
        return [color.fill[0], color.fill[1], color.fill[2], alpha];
      },
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
          onHover(
            {
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
            },
            { x: info.x, y: info.y },
          );
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
        getLineColor: [pulse, now],
        getFillColor: [pulse, now],
      },
    }),
  );

  return layers;
}

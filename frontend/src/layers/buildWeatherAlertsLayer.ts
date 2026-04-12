import type { Layer } from "@deck.gl/core";
import { GeoJsonLayer } from "@deck.gl/layers";
import type { Feature, FeatureCollection, Geometry } from "geojson";

type NWSAlertProperties = {
  event?: string;
  severity?: string;
  urgency?: string;
  areaDesc?: string;
  sent?: string;
  expires?: string;
};

function severityColor(severity?: string): [number, number, number, number] {
  if (severity === "Extreme") return [220, 38, 38, 165];
  if (severity === "Severe") return [249, 115, 22, 150];
  if (severity === "Moderate") return [234, 179, 8, 130];
  if (severity === "Minor") return [59, 130, 246, 115];
  return [148, 163, 184, 110];
}

export function buildNWSAlertsLayer(
  alertsData: FeatureCollection | null,
  visible: boolean,
  globeMode: boolean,
  setHoveredInfra: (info: unknown) => void,
  setSelectedInfra: (info: unknown) => void,
): Layer[] {
  if (!visible || !alertsData?.features?.length) return [];

  return [
    new GeoJsonLayer({
      id: `nws-alerts-${globeMode ? "globe" : "merc"}`,
      data: alertsData,
      pickable: true,
      filled: true,
      stroked: true,
      lineWidthMinPixels: 1,
      lineWidthMaxPixels: 3,
      getLineWidth: 2,
      getFillColor: (f: Feature<Geometry, NWSAlertProperties>) =>
        severityColor(f.properties?.severity),
      getLineColor: (f: Feature<Geometry, NWSAlertProperties>) => {
        const [r, g, b] = severityColor(f.properties?.severity);
        return [r, g, b, 220];
      },
      parameters: { 
        depthTest: !!globeMode, 
        depthMask: !!globeMode,
        depthBias: globeMode ? -30.0 : 0,
      },
      onHover: (info: unknown) => setHoveredInfra(info),
      onClick: (info: unknown) => setSelectedInfra(info),
      updateTriggers: {
        getFillColor: [alertsData],
        getLineColor: [alertsData],
      },
    }),
  ];
}

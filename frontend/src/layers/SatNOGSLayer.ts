import { ScatterplotLayer } from "@deck.gl/layers";
import type { SatNOGSStation } from "../types";

export function getSatNOGSLayer(
  stations: SatNOGSStation[],
  visible: boolean
) {
  return new ScatterplotLayer<SatNOGSStation>({
    id: "satnogs-stations-layer",
    data: stations,
    visible,
    pickable: true,
    opacity: 0.8,
    stroked: true,
    filled: true,
    radiusScale: 1,
    radiusMinPixels: 3,
    radiusMaxPixels: 10,
    lineWidthMinPixels: 1,
    getPosition: (d) => [d.lon, d.lat, d.altitude || 0],
    getFillColor: (d) => d.status === "testing" ? [255, 165, 0, 200] : [0, 200, 150, 200], // Orange for testing, Teal for active
    getLineColor: [0, 0, 0, 150],
    getRadius: 15000, 
    updateTriggers: {
      getFillColor: [stations],
    },
  });
}

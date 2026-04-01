import { ScatterplotLayer } from "@deck.gl/layers";
import type { CoTEntity, SatNOGSStation } from "../types";

function toSatnogsEntity(station: SatNOGSStation): CoTEntity {
  return {
    uid: `satnogs-${station.id}`,
    type: "satnogs",
    callsign: station.name,
    lat: station.lat,
    lon: station.lon,
    altitude: station.altitude || 0,
    course: 0,
    speed: 0,
    lastSeen: Date.now(),
    uidHash: 0,
    trail: [],
    detail: {
      satnogs_id: station.id,
      status: station.status,
      name: station.name,
      lat: station.lat,
      lon: station.lon,
      altitude_m: station.altitude || 0,
    },
  };
}

export function getSatNOGSLayer(
  stations: SatNOGSStation[],
  visible: boolean,
  setHoveredEntity: (entity: CoTEntity | null) => void,
  setHoverPosition: (pos: { x: number; y: number } | null) => void,
  onEntitySelect: (entity: CoTEntity | null) => void,
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
    onHover: (info) => {
      const station = info.object as SatNOGSStation | undefined;
      if (!station) {
        setHoveredEntity(null);
        setHoverPosition(null);
        return;
      }

      setHoveredEntity(toSatnogsEntity(station));
      setHoverPosition({ x: info.x ?? 0, y: info.y ?? 0 });
    },
    onClick: (info) => {
      const station = info.object as SatNOGSStation | undefined;
      if (!station) return;
      onEntitySelect(toSatnogsEntity(station));
    },
    updateTriggers: {
      getFillColor: [stations],
    },
  });
}

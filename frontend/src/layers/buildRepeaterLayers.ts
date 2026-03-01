import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { RepeaterStation, CoTEntity } from "../types";

/** Colour by digital mode availability */
function repeaterColor(r: RepeaterStation, alpha: number): [number, number, number, number] {
  const modes = r.modes.map((m) => m.toLowerCase());
  if (modes.some((m) => m.includes("d-star") || m.includes("fusion") || m.includes("dmr") || m.includes("p25"))) {
    return [139, 92, 246, alpha]; // violet-500  — digital
  }
  if (r.status?.toLowerCase().includes("off")) {
    return [100, 116, 139, alpha]; // slate-500  — off-air
  }
  return [20, 184, 166, alpha]; // teal-500  — standard FM open
}

/** Wrap a repeater as a CoTEntity so it works with the existing
 *  hover/tooltip pipeline without adding new state machinery. */
export function repeaterToEntity(r: RepeaterStation): CoTEntity {
  const modesStr = r.modes.length ? r.modes.join(", ") : "FM";
  return {
    uid: `repeater-${r.callsign}-${r.frequency}`,
    type: "repeater",
    lat: r.lat,
    lon: r.lon,
    altitude: 0,
    course: 0,
    speed: 0,
    callsign: r.callsign,
    lastSeen: Date.now(),
    trail: [],
    uidHash: 0,
    detail: {
      frequency: r.frequency,
      input_freq: r.input_freq,
      ctcss: r.ctcss ?? "none",
      use: r.use,
      status: r.status,
      city: r.city,
      state: r.state,
      modes: modesStr,
    },
  };
}

export function buildRepeaterLayers(
  repeaters: RepeaterStation[],
  globeMode: boolean | undefined,
  onEntitySelect: (entity: CoTEntity | null) => void,
  setHoveredEntity: (entity: CoTEntity | null) => void,
  setHoverPosition: (pos: { x: number; y: number } | null) => void,
  zoom: number,
): any[] {
  if (repeaters.length === 0) return [];

  const modeKey = globeMode ? "globe" : "merc";
  const depthParams = { depthTest: !!globeMode, depthBias: globeMode ? -210.0 : 0 };
  const layers: any[] = [];

  // 1. Outer halo (non-pickable, decorative)
  layers.push(
    new ScatterplotLayer({
      id: `repeater-halo-${modeKey}`,
      data: repeaters,
      getPosition: (d: RepeaterStation) => [d.lon, d.lat, 0],
      getRadius: 9,
      radiusUnits: "pixels" as const,
      radiusMinPixels: 5,
      getFillColor: (d: RepeaterStation) => repeaterColor(d, 40),
      stroked: false,
      filled: true,
      pickable: false,
      wrapLongitude: true,
      parameters: depthParams,
    }),
  );

  // 2. Core dot (pickable — hover tooltip + click to select)
  layers.push(
    new ScatterplotLayer({
      id: `repeater-dots-${modeKey}`,
      data: repeaters,
      getPosition: (d: RepeaterStation) => [d.lon, d.lat, 0],
      getRadius: 5,
      radiusUnits: "pixels" as const,
      radiusMinPixels: 3,
      getFillColor: (d: RepeaterStation) => repeaterColor(d, 220),
      getLineColor: [0, 0, 0, 0] as [number, number, number, number],
      stroked: false,
      filled: true,
      pickable: true,
      wrapLongitude: true,
      parameters: depthParams,
      onHover: (info: any) => {
        if (info.object) {
          setHoveredEntity(repeaterToEntity(info.object as RepeaterStation));
          setHoverPosition({ x: info.x, y: info.y });
        } else {
          setHoveredEntity(null);
          setHoverPosition(null);
        }
      },
      onClick: (info: any) => {
        if (info.object) {
          onEntitySelect(repeaterToEntity(info.object as RepeaterStation));
        }
      },
    }),
  );

  // 3. Callsign + freq labels (only at zoom >= 9)
  if (zoom >= 9) {
    layers.push(
      new TextLayer({
        id: `repeater-labels-${modeKey}`,
        data: repeaters,
        getPosition: (d: RepeaterStation) => [d.lon, d.lat, 0],
        getText: (d: RepeaterStation) => `${d.callsign}\n${d.frequency}`,
        getSize: 10,
        getColor: (d: RepeaterStation) => repeaterColor(d, 200),
        getPixelOffset: [0, -16],
        fontFamily: "monospace",
        fontWeight: "bold",
        billboard: true,
        pickable: false,
        wrapLongitude: true,
        parameters: { depthTest: true, depthBias: 0 },
        lineHeight: 1.3,
      }),
    );
  }

  return layers;
}

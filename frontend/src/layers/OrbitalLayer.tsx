import type { PickingInfo } from "@deck.gl/core";
import {
  IconLayer,
  PathLayer,
  ScatterplotLayer,
  SolidPolygonLayer,
} from "@deck.gl/layers";
import { CoTEntity, GroundTrackPoint } from "../types";

type PathPoint3D = [number, number, number];
interface SatGapBridge {
  path: PathPoint3D[];
  entity: CoTEntity;
}

const createSatIconAtlas = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";

  // 4-point diamond/star shape
  ctx.save();
  ctx.translate(32, 32);
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.lineTo(8, -8);
  ctx.lineTo(24, 0);
  ctx.lineTo(8, 8);
  ctx.lineTo(0, 24);
  ctx.lineTo(-8, 8);
  ctx.lineTo(-24, 0);
  ctx.lineTo(-8, -8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  return {
    url: canvas.toDataURL(),
    width: 64,
    height: 64,
    mapping: {
      satellite: { x: 0, y: 0, width: 64, height: 64, anchorY: 32, mask: true },
    },
  };
};

const SAT_ICON_ATLAS = createSatIconAtlas();

const getSatColor = (
  category?: string,
  alpha: number = 255,
): [number, number, number, number] => {
  const cat = (category || "").toLowerCase();
  if (
    cat === "gps" ||
    cat.includes("gps") ||
    cat.includes("gnss") ||
    cat.includes("galileo") ||
    cat.includes("beidou") ||
    cat.includes("glonass")
  )
    return [56, 189, 248, alpha];
  if (
    cat === "weather" ||
    cat.includes("weather") ||
    cat.includes("noaa") ||
    cat.includes("meteosat")
  )
    return [251, 191, 36, alpha];
  if (
    cat === "comms" ||
    cat.includes("comms") ||
    cat.includes("communications") ||
    cat.includes("starlink") ||
    cat.includes("iridium")
  )
    return [52, 211, 153, alpha];
  if (
    cat === "surveillance" ||
    cat.includes("surveillance") ||
    cat.includes("military") ||
    cat.includes("isr") ||
    cat.includes("intel") ||
    cat.includes("earth observation") ||
    cat.includes("imaging")
  )
    return [251, 113, 133, alpha];
  return [156, 163, 175, alpha];
};

interface OrbitalLayerProps {
  satellites: CoTEntity[];
  selectedEntity: CoTEntity | null;
  hoveredEntity: CoTEntity | null;
  now: number;
  showHistoryTails: boolean;
  projectionMode?: string;
  zoom: number;
  predictedGroundTrack?: GroundTrackPoint[];
  onEntitySelect: (entity: CoTEntity | null) => void;
  onHover: (entity: CoTEntity | null, x: number, y: number) => void;
}

interface FaceDatum {
  polygon: number[][];
  entity: CoTEntity;
  shade?: number;
}

function buildGemFaces(
  satellites: CoTEntity[],
  selectedUid: string | undefined,
  zoom: number = 0,
): FaceDatum[] {
  const faces: FaceDatum[] = [];
  const pxToDeg = 360 / 512 / Math.pow(2, Math.max(0, zoom));

  for (const d of satellites) {
    const isSelected = selectedUid === d.uid;
    const alt = d.altitude || 1000;

    const desiredPx = isSelected ? 12 : 6;
    const sizeDegUnclamped = desiredPx * pxToDeg;

    // Compensate for altitude expansion
    const altRadiusScale = (6371 + alt / 1000) / 6371;
    const sizeDeg = Math.min(
      Math.max(sizeDegUnclamped / altRadiusScale, 0.02),
      1.0,
    );

    const latRad = (d.lat * Math.PI) / 180;
    const lonScale = Math.min(1 / Math.max(0.01, Math.cos(latRad)), 10);

    // Vertical apex offset
    const gemH = sizeDeg * 111_000 * altRadiusScale * 0.6;

    const apex = [d.lon, d.lat, alt + gemH];
    const nadir = [d.lon, d.lat, alt - gemH];
    const vN = [d.lon, d.lat + sizeDeg, alt];
    const vE = [d.lon + sizeDeg * lonScale, d.lat, alt];
    const vS = [d.lon, d.lat - sizeDeg, alt];
    const vW = [d.lon - sizeDeg * lonScale, d.lat, alt];

    const tris = [
      [apex, vN, vE],
      [apex, vE, vS],
      [apex, vS, vW],
      [apex, vW, vN],
      [nadir, vE, vN],
      [nadir, vS, vE],
      [nadir, vW, vS],
      [nadir, vN, vW],
    ];
    const shades = [1.0, 0.75, 0.5, 0.75, 0.8, 0.6, 0.4, 0.6];
    for (let i = 0; i < tris.length; i++) {
      faces.push({ polygon: tris[i], entity: d, shade: shades[i] });
    }
  }
  return faces;
}

export function getOrbitalLayers({
  satellites,
  selectedEntity,
  hoveredEntity,
  now,
  showHistoryTails,
  projectionMode,
  zoom,
  predictedGroundTrack,
  onEntitySelect,
  onHover,
}: OrbitalLayerProps) {
  const R_EARTH_KM = 6371;
  const sfx = projectionMode ? `-${projectionMode}` : "";
  const gemFaces =
    projectionMode === "globe"
      ? buildGemFaces(satellites, selectedEntity?.uid, zoom)
      : [];

  const selectedSat = selectedEntity
    ? satellites.find((s) => s.uid === selectedEntity.uid)
    : null;

  return [
    // 1. Footprint Circle
    ...(projectionMode !== "globe"
      ? [
          new ScatterplotLayer({
            id: `satellite-footprint${sfx}`,
            data: satellites.filter(
              (s) =>
                s.uid === selectedEntity?.uid || s.uid === hoveredEntity?.uid,
            ),
            getPosition: (d: CoTEntity) => [d.lon, d.lat, 0],
            getRadius: (d: CoTEntity) => {
              const altKm = (d.altitude || 0) / 1000;
              if (altKm <= 0) return 0;
              const footprintKm =
                2 * R_EARTH_KM * Math.acos(R_EARTH_KM / (R_EARTH_KM + altKm));
              return footprintKm * 1000;
            },
            radiusUnits: "meters",
            getFillColor: (d: CoTEntity) =>
              getSatColor(d.detail?.category as string, 20),
            getLineColor: (d: CoTEntity) =>
              getSatColor(d.detail?.category as string, 180),
            getLineWidth: 2,
            lineWidthUnits: "pixels",
            stroked: true,
            filled: true,
            pickable: false,
            wrapLongitude: projectionMode !== "globe",
            parameters: { depthTest: true, depthBias: 50.0 },
            updateTriggers: {
              getRadius: [selectedEntity?.uid, hoveredEntity?.uid],
              getFillColor: [selectedEntity?.uid, hoveredEntity?.uid],
            },
          }),
        ]
      : []),

    // 2. Orbital Trail
    ...(showHistoryTails
      ? [
          new PathLayer({
            id: `satellite-ground-track${sfx}`,
            data: satellites,
            getPath: (d: CoTEntity): PathPoint3D[] => {
              const trailRaw = d.smoothedTrail || [];
              if (trailRaw.length === 0) return [];
              
              const trail = trailRaw.map(
                (pt) => [pt[0] ?? 0, pt[1] ?? 0, pt[2] ?? 0] as PathPoint3D,
              );
              if (projectionMode === "globe") {
                const alt = d.altitude || 0;
                return trail.map(
                  (pt: PathPoint3D) => [pt[0], pt[1], alt] as PathPoint3D,
                );
              }
              return trail;
            },
            getColor: (d: CoTEntity) => {
              const isSelected =
                d.uid === selectedEntity?.uid || d.uid === hoveredEntity?.uid;
              if (isSelected)
                return getSatColor(d.detail?.category as string, 200);
              return getSatColor(d.detail?.category as string, 120);
            },
            getWidth: (d: CoTEntity) =>
              d.uid === selectedEntity?.uid || d.uid === hoveredEntity?.uid
                ? 4.5
                : 3.5,
            widthMinPixels: 2.5,
            jointRounded: true,
            capRounded: true,
            pickable: false,
            wrapLongitude: projectionMode !== "globe",
            parameters: { depthTest: true, depthBias: 50.0 },
            updateTriggers: {
              getPath: [now],
              getColor: [selectedEntity?.uid, hoveredEntity?.uid],
              getWidth: [selectedEntity?.uid, hoveredEntity?.uid],
            },
          }),
          new PathLayer({
            id: `satellite-gap-bridge${sfx}`,
            data: satellites
              .filter((d) => {
                if (!Array.isArray(d.smoothedTrail) || d.smoothedTrail.length === 0)
                  return false;
                const last = d.smoothedTrail[d.smoothedTrail.length - 1];
                if (!last) return false;
                const dist = Math.sqrt(
                  Math.pow(last[0] - d.lon, 2) + Math.pow(last[1] - d.lat, 2),
                );
                return dist > 0.05;
              })
              .map((d) => {
                const last = d.smoothedTrail![d.smoothedTrail!.length - 1];
                const alt = d.altitude || 0;
                return {
                  path: [
                    [last[0], last[1], alt] as PathPoint3D,
                    [d.lon, d.lat, alt] as PathPoint3D,
                  ],
                  entity: d,
                };
              }),
            getPath: (d: SatGapBridge) => d.path,
            getColor: (d: SatGapBridge) => {
              const isSelected =
                d.entity.uid === selectedEntity?.uid ||
                d.entity.uid === hoveredEntity?.uid;
              if (isSelected)
                return getSatColor(d.entity.detail?.category as string, 200);
              return getSatColor(d.entity.detail?.category as string, 120);
            },
            getWidth: (d: SatGapBridge) =>
              d.entity.uid === selectedEntity?.uid ||
              d.entity.uid === hoveredEntity?.uid
                ? 4.5
                : 3.5,
            widthMinPixels: 2.5,
            jointRounded: true,
            capRounded: true,
            pickable: false,
            wrapLongitude: projectionMode !== "globe",
            parameters: { depthTest: true, depthBias: 50.0 },
            updateTriggers: {
              getPath: [now],
              getColor: [selectedEntity?.uid, hoveredEntity?.uid],
              getWidth: [selectedEntity?.uid, hoveredEntity?.uid],
            },
          }),
        ]
      : []),

    // 2b. Predicted future ground track
    ...(showHistoryTails &&
    predictedGroundTrack &&
    predictedGroundTrack.length > 1 &&
    selectedEntity
      ? [
          new PathLayer({
            id: `satellite-predicted-track${sfx}`,
            data: [predictedGroundTrack],
            // @ts-expect-error - deck.gl path type complexity
            getPath: (pts: GroundTrackPoint[]) => {
              if (projectionMode === "globe") {
                const alt = selectedEntity.altitude || 0;
                return pts.map((pt) => [pt.lon, pt.lat, alt]);
              }
              return pts.map((pt) => [pt.lon, pt.lat]);
            },
            getColor: () =>
              getSatColor(selectedEntity.detail?.category as string, 160),
            getWidth: 2,
            widthMinPixels: 1.5,
            getDashArray: [6, 4],
            dashJustified: true,
            jointRounded: false,
            capRounded: false,
            pickable: false,
            wrapLongitude: projectionMode !== "globe",
            parameters: { depthTest: true, depthBias: 60.0 },
            updateTriggers: {
              getPath: [selectedEntity?.uid, predictedGroundTrack?.length],
            },
          }),
        ]
      : []),

    // 4. Satellite Markers
    ...(projectionMode === "globe"
      ? [
          new SolidPolygonLayer({
            id: `satellite-markers-globe${sfx}`,
            data: gemFaces,
            getPolygon: (d: FaceDatum) => d.polygon as unknown as number[],
            extruded: false,
            getFillColor: (d: FaceDatum) => {
              const base = getSatColor(
                d.entity.detail?.category as string,
                220,
              );
              const shade = d.shade || 1.0;
              return [
                Math.round(base[0] * shade),
                Math.round(base[1] * shade),
                Math.round(base[2] * shade),
                base[3],
              ];
            },
            pickable: true,
            wrapLongitude: false,
            parameters: { depthTest: true },
            onHover: (info: {
              object?: FaceDatum | null;
              x: number;
              y: number;
            }) => {
              onHover(
                (info.object?.entity ?? null) as CoTEntity | null,
                info.x,
                info.y,
              );
            },
            onClick: (info: { object?: FaceDatum | null }) => {
              const entity = info.object?.entity ?? null;
              if (entity) {
                const newSelection =
                  selectedEntity?.uid === entity.uid ? null : entity;
                onEntitySelect(newSelection);
              } else {
                onEntitySelect(null);
              }
            },
            updateTriggers: {
              getPolygon: [selectedEntity?.uid],
              getFillColor: [selectedEntity?.uid],
            },
          }),
        ]
      : [
          new IconLayer({
            id: `satellite-markers-merc${sfx}`,
            data: satellites,
            getIcon: () => "satellite",
            iconAtlas: SAT_ICON_ATLAS.url,
            iconMapping: SAT_ICON_ATLAS.mapping,
            getPosition: (d: CoTEntity) => [d.lon, d.lat, d.altitude || 0],
            getSize: (d: CoTEntity) => {
              const isSelected = selectedEntity?.uid === d.uid;
              return isSelected ? 16 : 12;
            },
            sizeUnits: "pixels",
            sizeMinPixels: 6,
            billboard: true,
            getColor: (d: CoTEntity) =>
              getSatColor(d.detail?.category as string, 255),
            pickable: true,
            wrapLongitude: projectionMode !== "globe",
            parameters: { depthTest: true, depthBias: 0 },
            onHover: (info: PickingInfo<CoTEntity>) => {
              onHover(info.object ?? null, info.x, info.y);
            },
            onClick: (info: PickingInfo<CoTEntity>) => {
              if (info.object) {
                const entity = info.object as CoTEntity;
                const newSelection =
                  selectedEntity?.uid === entity.uid ? null : entity;
                onEntitySelect(newSelection);
              } else {
                onEntitySelect(null);
              }
            },
            updateTriggers: {
              getSize: [selectedEntity?.uid],
              getColor: [selectedEntity?.uid],
            },
          }),
        ]),

    // 5. Glow / Highlight ring
    ...(selectedSat
      ? [
          new ScatterplotLayer({
            id: `satellite-selection-ring-${selectedEntity!.uid}`,
            data: [selectedSat],
            getPosition: (d: CoTEntity) => [d.lon, d.lat, d.altitude || 0],
            getRadius: () => {
              const cycle = (now % 2000) / 2000;
              return 20 + cycle * 30;
            },
            radiusUnits: "pixels",
            getFillColor: [0, 0, 0, 0],
            getLineColor: (d: CoTEntity) => {
              const cycle = (now % 2000) / 2000;
              const alpha = Math.round(255 * (1 - Math.pow(cycle, 2)));
              return getSatColor(d.detail?.category as string, alpha);
            },
            getLineWidth: 2,
            stroked: true,
            filled: false,
            pickable: false,
            wrapLongitude: projectionMode !== "globe",
            parameters: { depthTest: true, depthBias: -201.0 },
            updateTriggers: { getRadius: [now], getLineColor: [now] },
          }),
        ]
      : []),
  ];
}

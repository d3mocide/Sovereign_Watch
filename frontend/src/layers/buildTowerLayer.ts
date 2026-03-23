import type { Layer, PickingInfo } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import type { Tower } from "../types";

type TowerPickInfo = {
  object?: {
    id: string;
    type: "tower";
    geometry: {
      type: "Point";
      coordinates: [number, number];
    };
    properties: {
      id: string;
      name: string;
      entity_type: "tower";
      fcc_id?: string;
      tower_type?: string;
      owner?: string;
      status?: string;
      height_m?: number;
      elevation_m?: number;
      source: "FCC";
    };
  };
  coordinate?: [number, number];
  x?: number;
  y?: number;
};

const normalizeTowerInfo = (info: PickingInfo<Tower>): TowerPickInfo => {
  const tower = info?.object;
  const coordinate = Array.isArray(info.coordinate)
    ? ([info.coordinate[0] ?? 0, info.coordinate[1] ?? 0] as [number, number])
    : undefined;

  if (!tower) {
    return {
      coordinate,
      x: info.x,
      y: info.y,
    };
  }

  const coordinates = Array.isArray(tower.coordinates)
    ? tower.coordinates
    : (coordinate ?? [0, 0]);
  const properties = {
    id: tower.id,
    name: `FCC TOWER: ${tower.fccId || "UNKNOWN"}`,
    entity_type: "tower" as const,
    fcc_id: tower.fccId,
    tower_type: tower.type,
    owner: tower.owner,
    status: tower.status,
    height_m: tower.heightM,
    elevation_m: tower.elevationM,
    source: "FCC" as const,
  };

  return {
    coordinate,
    x: info.x,
    y: info.y,
    object: {
      id: tower.id,
      type: "tower",
      geometry: {
        type: "Point",
        coordinates,
      },
      properties,
    },
  };
};

export const buildTowerLayer = (
  towers: Tower[],
  visible: boolean,
  globeMode: boolean,
  onHover: (info: unknown) => void,
  onSelect: (info: unknown) => void,
): Layer[] => {
  if (!visible || !towers || towers.length === 0) return [];

  return [
    new ScatterplotLayer<Tower>({
      id: `fcc-towers-layer-${globeMode ? "globe" : "merc"}`,
      data: towers,
      pickable: true,
      opacity: 0.9,
      stroked: true,
      filled: true,
      radiusScale: 1,
      radiusMinPixels: 2,
      radiusMaxPixels: 12,
      lineWidthMinPixels: 1,
      getPosition: (d: Tower) => d.coordinates,
      getFillColor: [249, 115, 22, 200], // Orange-500
      getLineColor: [0, 0, 0, 150],
      wrapLongitude: !globeMode,
      onHover: (info: PickingInfo<Tower>) => {
        onHover(normalizeTowerInfo(info));
      },
      onClick: (info: PickingInfo<Tower>) => {
        if (info.object) {
          onSelect(normalizeTowerInfo(info));
        }
      },
    }),
  ];
};

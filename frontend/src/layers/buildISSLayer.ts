/**
 * buildISSLayer — ISS real-time position (IconLayer) + ground track (PathLayer).
 *
 * Z-order: 15–17 (Navigation/Orbital group, per composition.ts z-ordering rules).
 *
 * The icon is a simple white dot; the ground track is a faded white PathLayer
 * that fades toward the tail to convey direction of travel.
 */

import { IconLayer, PathLayer } from "@deck.gl/layers";
import type { ISSPosition } from "../types";

// Minimal inline atlas: white circle on transparent canvas
function createISSAtlas() {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    // Outer glow ring
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 4;
    ctx.stroke();

    // Inner filled circle
    ctx.beginPath();
    ctx.arc(32, 32, 14, 0, Math.PI * 2);
    ctx.fillStyle = "white";
    ctx.fill();

    return {
        url: canvas.toDataURL(),
        width: size,
        height: size,
        mapping: {
            iss: { x: 0, y: 0, width: size, height: size, anchorY: size / 2, mask: false },
        },
    };
}

const ISS_ATLAS = createISSAtlas();

interface ISSLayerOptions {
    position: ISSPosition | null;
    track: ISSPosition[];
    globeMode?: boolean;
    onHover?: (info: unknown) => void;
    onSelect?: (info: unknown) => void;
}

export function buildISSLayer({
    position,
    track,
    globeMode = false,
    onHover,
    onSelect,
}: ISSLayerOptions) {
    const layers = [];

    // Ground track PathLayer — white fading line
    if (track.length >= 2) {
        // Reverse so index 0 is oldest; PathLayer renders head→tail
        const ordered = [...track].reverse();

        layers.push(
            new PathLayer({
                id: `iss-track-layer-${globeMode ? "globe" : "merc"}`,
                data: [{ path: ordered.map((p) => [p.lon, p.lat]) }],
                getPath: (d: { path: [number, number][] }) => d.path,
                getColor: [255, 255, 255, 120],
                getWidth: 2,
                widthMinPixels: 1,
                widthMaxPixels: 3,
                wrapLongitude: !globeMode,
                parameters: {
                    depthTest: !!globeMode,
                    depthMask: !!globeMode,
                    depthBias: globeMode ? -28.0 : 0,
                },
            })
        );
    }

    // ISS current position IconLayer
    if (position) {
        layers.push(
            new IconLayer<ISSPosition>({
                id: `iss-position-layer-${globeMode ? "globe" : "merc"}`,
                data: [position],
                iconAtlas: ISS_ATLAS.url,
                iconMapping: ISS_ATLAS.mapping,
                getIcon: () => "iss",
                getPosition: (d: ISSPosition) => [d.lon, d.lat],
                getSize: 32,
                sizeScale: 1,
                pickable: true,
                getColor: [250, 204, 21, 255],  // yellow-400
                parameters: {
                    depthTest: !!globeMode,
                    depthMask: !!globeMode,
                    depthBias: globeMode ? -30.0 : 0,
                },
                onHover: onHover
                    ? (info: unknown) => {
                          const pickInfo = info as { object?: ISSPosition; x: number; y: number };
                          if (pickInfo.object) {
                              onHover({
                                  ...pickInfo,
                                  object: {
                                      type: "iss",
                                      properties: {
                                          name: "ISS (International Space Station)",
                                          entity_type: "iss",
                                          lat: pickInfo.object.lat,
                                          lon: pickInfo.object.lon,
                                          altitude_km: pickInfo.object.altitude_km,
                                          velocity_kms: pickInfo.object.velocity_kms,
                                          timestamp: pickInfo.object.timestamp,
                                      },
                                  },
                              });
                          } else {
                              onHover({ ...pickInfo, object: null });
                          }
                      }
                    : undefined,
                onClick: onSelect
                    ? (info: unknown) => {
                          const pickInfo = info as { object?: ISSPosition };
                          if (pickInfo.object) onSelect(info);
                      }
                    : undefined,
            })
        );
    }

    return layers;
}

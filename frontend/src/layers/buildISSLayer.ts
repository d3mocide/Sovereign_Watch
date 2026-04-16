/**
 * buildISSLayer — ISS real-time position beacon + ground track.
 *
 * Z-order: 15–17 (Navigation/Orbital group, per composition.ts z-ordering rules).
 *
 * The marker is rendered as layered scatterplot beacons so it remains visible
 * across map modes, while the ground track is split at the antimeridian to
 * avoid world-spanning wrap artifacts.
 */

import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { ISSPosition } from "../types";

interface ISSLayerOptions {
    position: ISSPosition | null;
    track: ISSPosition[];
    globeMode?: boolean;
    onHover?: (info: unknown) => void;
    onSelect?: (info: unknown) => void;
}

interface ISSPathSegment {
    path: [number, number][];
}

function toOrderedTrack(track: ISSPosition[]): ISSPosition[] {
    return [...track]
        .filter(
            (point) =>
                Number.isFinite(point.lat) &&
                Number.isFinite(point.lon) &&
                typeof point.timestamp === "string"
        )
        .reverse();
}

function splitTrackAtAntimeridian(track: ISSPosition[]): ISSPathSegment[] {
    const ordered = toOrderedTrack(track);
    if (ordered.length < 2) {
        return [];
    }

    const segments: ISSPathSegment[] = [];
    let currentSegment: [number, number][] = [[ordered[0].lon, ordered[0].lat]];

    for (let index = 1; index < ordered.length; index += 1) {
        const prev = ordered[index - 1];
        const curr = ordered[index];
        const crossed = Math.abs(curr.lon - prev.lon) > 180;

        if (crossed) {
            // Interpolate latitude at the antimeridian (±180)
            const direction = curr.lon - prev.lon > 0 ? -1 : 1; // 1: E->W (+180), -1: W->E (-180)
            const targetLon = direction === 1 ? 180 : -180;
            const otherLon = direction === 1 ? -180 : 180;

            // Simple linear interpolation for latitude
            let lon1 = prev.lon;
            let lon2 = curr.lon;
            if (direction === 1) lon2 += 360;
            else lon2 -= 360;

            const t = (targetLon - lon1) / (lon2 - lon1);
            const interLat = prev.lat + t * (curr.lat - prev.lat);

            // Close current segment at the edge
            currentSegment.push([targetLon, interLat]);
            segments.push({ path: currentSegment });

            // Start next segment from the opposite edge
            currentSegment = [[otherLon, interLat], [curr.lon, curr.lat]];
        } else {
            currentSegment.push([curr.lon, curr.lat]);
        }
    }

    if (currentSegment.length >= 2) {
        segments.push({ path: currentSegment });
    }

    return segments;
}

function toIssFeature(position: ISSPosition) {
    return {
        type: "iss",
        properties: {
            name: "ISS (International Space Station)",
            entity_type: "iss",
            lat: position.lat,
            lon: position.lon,
            altitude_km: position.altitude_km,
            velocity_kms: position.velocity_kms,
            timestamp: position.timestamp,
        },
    };
}

export function buildISSLayer({
    position,
    track,
    globeMode = false,
    onHover,
    onSelect,
}: ISSLayerOptions) {
    const layers = [];
    const trackSegments = splitTrackAtAntimeridian(track);

    if (trackSegments.length > 0) {
        layers.push(
            new PathLayer<ISSPathSegment>({
                id: `iss-track-layer-${globeMode ? "globe" : "merc"}`,
                data: trackSegments,
                getPath: (segment) => segment.path,
                getColor: [255, 244, 189, 136],
                getWidth: 2,
                widthMinPixels: 1,
                widthMaxPixels: 3,
                wrapLongitude: false,
                parameters: {
                    depthTest: !!globeMode,
                    depthMask: !!globeMode,
                    depthBias: globeMode ? -28.0 : 0,
                } as any,
            })
        );
    }

    if (position) {
        const markerData = [position];
        const markerAltitudeMeters = (position.altitude_km ?? 0) * 1000;

        layers.push(
            new ScatterplotLayer<ISSPosition>({
                id: `iss-position-glow-${globeMode ? "globe" : "merc"}`,
                data: markerData,
                getPosition: (point) => [point.lon, point.lat, markerAltitudeMeters],
                getRadius: 18,
                radiusUnits: "pixels",
                filled: true,
                stroked: false,
                pickable: false,
                getFillColor: [250, 204, 21, 72],
                parameters: {
                    depthTest: !!globeMode,
                    depthMask: false,
                    depthBias: globeMode ? -34.0 : 0,
                } as any,
            }),
            new ScatterplotLayer<ISSPosition>({
                id: `iss-position-core-${globeMode ? "globe" : "merc"}`,
                data: markerData,
                getPosition: (point) => [point.lon, point.lat, markerAltitudeMeters],
                getRadius: 6,
                radiusUnits: "pixels",
                filled: true,
                stroked: true,
                lineWidthUnits: "pixels",
                getLineWidth: 2,
                pickable: true,
                getFillColor: [255, 250, 230, 255],
                getLineColor: [250, 204, 21, 255],
                parameters: {
                    depthTest: !!globeMode,
                    depthMask: false,
                    depthBias: globeMode ? -36.0 : 0,
                } as any,
                onHover: onHover
                    ? (info: unknown) => {
                          const pickInfo = info as { object?: ISSPosition; x: number; y: number };
                          if (pickInfo.object) {
                              onHover({
                                  ...pickInfo,
                                  object: toIssFeature(pickInfo.object),
                              });
                          } else {
                              onHover({ ...pickInfo, object: null });
                          }
                      }
                    : undefined,
                onClick: onSelect
                    ? (info: unknown) => {
                          const pickInfo = info as { object?: ISSPosition };
                          if (pickInfo.object) {
                              onSelect({
                                  ...pickInfo,
                                  object: toIssFeature(pickInfo.object),
                              });
                          }
                      }
                    : undefined,
            })
        );
    }

    return layers;
}

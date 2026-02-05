import React, { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl';

interface PollingAreaVisualizationProps {
    center: { lat: number; lon: number } | null;
    radiusNm: number;
}

export const PollingAreaVisualization: React.FC<PollingAreaVisualizationProps> = ({ center, radiusNm }) => {
    if (!center) return null;

    const shapes = useMemo(() => {
        // Constants
        const NM_TO_DEG = 1 / 60;
        
        // 1. Maritime Bounding Box (Rectangle)
        // Matches Python poller calculation:
        // lat_offset = radius_nm / 60.0
        // lon_offset = radius_nm / (60.0 * math.cos(math.radians(center_lat)))
        const latOffset = radiusNm * NM_TO_DEG;
        const cosLat = Math.cos(center.lat * (Math.PI / 180));
        const safeCosLat = Math.max(Math.abs(cosLat), 0.0001); // Prevent division by zero at poles
        const lonOffset = radiusNm * NM_TO_DEG / safeCosLat;

        const minLat = center.lat - latOffset;
        const maxLat = center.lat + latOffset;
        const minLon = center.lon - lonOffset;
        const maxLon = center.lon + lonOffset;

        const maritimeBox = {
            type: 'Feature',
            properties: { type: 'maritime' },
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [minLon, minLat],
                    [maxLon, minLat],
                    [maxLon, maxLat],
                    [minLon, maxLat],
                    [minLon, minLat] // Close loop
                ]]
            }
        };

        // 2. Aviation Radius (Circle)
        // Generate 64 points
        const points = [];
        for (let i = 0; i <= 64; i++) {
            const angle = (i / 64) * 2 * Math.PI;
            // Simple flat earth approximation for display is sufficient, 
            // or use proper geodesic if needed. For visual feedback, this matches the box calculation logic.
            const dLat = (radiusNm * NM_TO_DEG) * Math.cos(angle);
            const dLon = (radiusNm * NM_TO_DEG / safeCosLat) * Math.sin(angle);
            points.push([center.lon + dLon, center.lat + dLat]);
        }

        const aviationCircle = {
            type: 'Feature',
            properties: { type: 'aviation' },
            geometry: {
                type: 'Polygon',
                coordinates: [points]
            }
        };

        return {
            type: 'FeatureCollection',
            features: [maritimeBox, aviationCircle]
        };
    }, [center, radiusNm]);

    return (
        <Source id="polling-area-source" type="geojson" data={shapes as any}>
            {/* Maritime Box - Cyan Dotted Line */}
            <Layer
                id="maritime-box-line"
                type="line"
                paint={{
                    'line-color': '#00ffff',
                    'line-width': 1,
                    'line-dasharray': [2, 4],
                    'line-opacity': 0.6
                }}
                filter={['==', 'type', 'maritime']}
            />
             <Layer
                id="maritime-box-fill"
                type="fill"
                paint={{
                    'fill-color': '#00ffff',
                    'fill-opacity': 0.05
                }}
                filter={['==', 'type', 'maritime']}
            />

            {/* Aviation Circle - Green Solid Line */}
            <Layer
                id="aviation-circle-line"
                type="line"
                paint={{
                    'line-color': '#00ff41',
                    'line-width': 2,
                    'line-opacity': 0.8
                }}
                filter={['==', 'type', 'aviation']}
            />
            {/* Pulsing Fill for Aviation */}
             <Layer
                id="aviation-circle-fill"
                type="fill"
                paint={{
                    'fill-color': '#00ff41',
                    'fill-opacity': 0.08
                }}
                filter={['==', 'type', 'aviation']}
            />
        </Source>
    );
};

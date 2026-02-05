import React from 'react';
import { Source, Layer } from 'react-map-gl';

interface CoverageCircleProps {
  center: [number, number]; // [lon, lat]
  radiusNm: number;
  color?: string;
  opacity?: number;
}

/**
 * Creates a GeoJSON circle polygon from a center point and radius.
 * Uses the simple circle approximation for visualization.
 */
function createCircle(center: [number, number], radiusNm: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const [lon, lat] = center;
  const radiusKm = radiusNm * 1.852; // Nautical miles to kilometers
  const points = 64;
  const coordinates: number[][] = [];

  for (let i = 0; i < points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = radiusKm * Math.cos(angle);
    const dy = radiusKm * Math.sin(angle);

    // Approximate degrees per kilometer
    const dLat = dy / 111.32;
    const dLon = dx / (111.32 * Math.cos(lat * Math.PI / 180));

    coordinates.push([lon + dLon, lat + dLat]);
  }

  // Close the ring
  coordinates.push(coordinates[0]);

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
  };
}

export const CoverageCircle: React.FC<CoverageCircleProps> = ({
  center,
  radiusNm,
  color = '#00ff41',
  opacity = 0.15,
}) => {
  const circle = createCircle(center, radiusNm);

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [circle],
  };

  return (
    <>
      {/* Fill Layer */}
      <Source id="coverage-area" type="geojson" data={geojson}>
        <Layer
          id="coverage-fill"
          type="fill"
          paint={{
            'fill-color': color,
            'fill-opacity': opacity,
          }}
        />
        <Layer
          id="coverage-outline"
          type="line"
          paint={{
            'line-color': color,
            'line-width': 2,
            'line-opacity': 0.6,
            'line-dasharray': [2, 2],
          }}
        />
        {/* Animated pulse ring */}
        <Layer
          id="coverage-pulse"
          type="line"
          paint={{
            'line-color': color,
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              5, 1,
              10, 3,
            ],
            'line-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              5, 0.3,
              10, 0.8,
            ],
            'line-blur': 4,
          }}
        />
      </Source>
    </>
  );
};

import { useState, useEffect } from 'react';

export const useInfraData = () => {
  const [cablesData, setCablesData] = useState<any>(null);
  const [stationsData, setStationsData] = useState<any>(null);

  useEffect(() => {
    // Attempt to fetch from local public/data first
    Promise.all([
      fetch('/data/submarine-cables.geojson').then(r => r.json()).catch(() => null),
      fetch('/data/cable-landing-points.geojson').then(r => r.json()).catch(() => null)
    ]).then(([cables, stations]) => {
      if (cables && stations) {
        setCablesData(cables);
        setStationsData(stations);
      } else {
        // Fallback to minimal representative data if fetches fail
        const fallbackCables = {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {
                id: "tat-14",
                name: "TAT-14",
                owners: "Consortium",
                capacity: "3.2 Tbps",
                rfs: "2001",
                landing_points: "US, UK, FR, NL, DE, DK",
                length_km: 15400,
                status: "ACTIVE"
              },
              geometry: {
                type: "LineString",
                coordinates: [
                  [-74.0, 40.0],
                  [-10.0, 45.0],
                  [0.0, 50.0],
                  [5.0, 52.0]
                ]
              }
            },
            {
               type: "Feature",
               properties: {
                 id: "sea-me-we-4",
                 name: "SEA-ME-WE 4",
                 owners: "Consortium",
                 capacity: "4.6 Tbps",
                 rfs: "2005",
                 landing_points: "FR, IT, EG, SA, IN, SG",
                 length_km: 18800,
                 status: "ACTIVE"
               },
               geometry: {
                 type: "LineString",
                 coordinates: [
                   [5.0, 43.0],
                   [15.0, 38.0],
                   [30.0, 31.0],
                   [40.0, 20.0],
                   [70.0, 15.0],
                   [100.0, 5.0]
                 ]
               }
            }
          ]
        };
        const fallbackStations = {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { id: "st-nj", name: "Manasquan, NJ", country: "United States", cables: "TAT-14" },
              geometry: { type: "Point", coordinates: [-74.0, 40.0] }
            },
            {
              type: "Feature",
              properties: { id: "st-uk", name: "Bude, UK", country: "United Kingdom", cables: "TAT-14" },
              geometry: { type: "Point", coordinates: [0.0, 50.0] }
            },
            {
               type: "Feature",
               properties: { id: "st-fr", name: "Marseille", country: "France", cables: "SEA-ME-WE 4" },
               geometry: { type: "Point", coordinates: [5.0, 43.0] }
            },
            {
               type: "Feature",
               properties: { id: "st-eg", name: "Alexandria", country: "Egypt", cables: "SEA-ME-WE 4" },
               geometry: { type: "Point", coordinates: [30.0, 31.0] }
            }
          ]
        };
        console.warn("Using fallback submarine cable data.");
        setCablesData(fallbackCables);
        setStationsData(fallbackStations);
      }
    });
  }, []);

  return { cablesData, stationsData };
};

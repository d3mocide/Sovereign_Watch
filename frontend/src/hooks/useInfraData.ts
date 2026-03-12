import { useState, useEffect } from 'react';

// These are module-level constants so they have stable reference identity.
// Declaring them inside the hook body caused a new object reference on every
// render, which made the useEffect dependency re-fire infinitely.
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

const fallbackEmpty = {
  type: "FeatureCollection",
  features: []
};

export const useInfraData = () => {
  const [cablesData, setCablesData] = useState<any>(null);
  const [stationsData, setStationsData] = useState<any>(null);
  const [outagesData, setOutagesData] = useState<any>(null);
  
  useEffect(() => {
    const fetchRealData = async () => {
      try {
        const [cablesRes, stationsRes, outagesRes] = await Promise.all([
          fetch("/api/infra/cables").then(r => r.ok ? r.json() : null).catch(() => null),
          fetch("/api/infra/stations").then(r => r.ok ? r.json() : null).catch(() => null),
          fetch("/api/infra/outages").then(r => r.ok ? r.json() : null).catch(() => null)
        ]);

        if (cablesRes && cablesRes.features && cablesRes.features.length > 0) {
          setCablesData(cablesRes);
        } else {
          setCablesData(fallbackCables);
        }

        if (stationsRes && stationsRes.features && stationsRes.features.length > 0) {
          setStationsData(stationsRes);
        } else {
          setStationsData(fallbackStations);
        }

        if (outagesRes) {
          setOutagesData(outagesRes);
        } else {
          setOutagesData(fallbackEmpty);
        }

      } catch (err) {
        console.warn("Falling back to local cache or minimal data:", err);
        setCablesData(fallbackCables);
        setStationsData(fallbackStations);
        setOutagesData(fallbackEmpty);
        setOutagesData(fallbackEmpty);
      }
    };
    fetchRealData();

    // Refresh outages every 10 minutes from the backend (which caches every 30m)
    const interval = setInterval(fetchRealData, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return { cablesData, stationsData, outagesData };
};

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

export const useInfraData = () => {
  const [cablesData, setCablesData] = useState<any>(null);
  const [stationsData, setStationsData] = useState<any>(null);

  useEffect(() => {
    const CACHE_KEY_CABLES = 'infra_cables_data';
    const CACHE_KEY_STATIONS = 'infra_stations_data';
    const CACHE_KEY_TS = 'infra_data_timestamp';
    const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

    const fetchRealData = async () => {
      try {
        // 1. Check Cache first
        const cachedTs = localStorage.getItem(CACHE_KEY_TS);
        const now = Date.now();

        if (cachedTs && (now - parseInt(cachedTs)) < CACHE_TTL) {
          const cachedCables = localStorage.getItem(CACHE_KEY_CABLES);
          const cachedStations = localStorage.getItem(CACHE_KEY_STATIONS);
          if (cachedCables && cachedStations) {
            console.log("Using cached submarine cable data (valid for 24h)");
            setCablesData(JSON.parse(cachedCables));
            setStationsData(JSON.parse(cachedStations));
            return; // Exit early
          }
        }

        // 2. Fetch if no cache or expired
        const cablesUrl = "https://www.submarinecablemap.com/api/v3/cable/cable-geo.json";
        const stationsUrl = "https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json";

        const [cablesRes, stationsRes] = await Promise.all([
          fetch("https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(cablesUrl)).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch("https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(stationsUrl)).then(r => r.ok ? r.json() : null).catch(() => null)
        ]);

        if (cablesRes) {
          const finalStations = stationsRes || fallbackStations;
          setCablesData(cablesRes);
          setStationsData(finalStations);

          // Update Cache
          localStorage.setItem(CACHE_KEY_CABLES, JSON.stringify(cablesRes));
          localStorage.setItem(CACHE_KEY_STATIONS, JSON.stringify(finalStations));
          localStorage.setItem(CACHE_KEY_TS, Date.now().toString());
        } else {
          throw new Error("Failed to fetch cables from proxy");
        }
      } catch (err) {
        console.warn("Falling back to local cache or minimal data:", err);

        // Final fallback: try expired cache before hardcoded
        const expiredCables = localStorage.getItem(CACHE_KEY_CABLES);
        const expiredStations = localStorage.getItem(CACHE_KEY_STATIONS);

        if (expiredCables && expiredStations) {
          console.warn("Using EXPIRED cached data as emergency fallback.");
          setCablesData(JSON.parse(expiredCables));
          setStationsData(JSON.parse(expiredStations));
        } else {
          console.warn("No cache available. Using hardcoded representative data.");
          setCablesData(fallbackCables);
          setStationsData(fallbackStations);
        }
      }
    };
    fetchRealData();
  }, [fallbackCables, fallbackStations]);

  return { cablesData, stationsData };
};

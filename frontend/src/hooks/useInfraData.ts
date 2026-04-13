import type { FeatureCollection } from "geojson";
import { useEffect, useRef, useState } from "react";
import type { CdnEdgeNode, DnsRootServer } from "../types";

const isFeatureCollection = (value: unknown): value is FeatureCollection => {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "FeatureCollection" &&
    Array.isArray((value as { features?: unknown }).features)
  );
};

// These are module-level constants so they have stable reference identity.
// Declaring them inside the hook body caused a new object reference on every
// render, which made the useEffect dependency re-fire infinitely.
const fallbackCables: FeatureCollection = {
  type: "FeatureCollection" as const,
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
        status: "ACTIVE",
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [-74.0, 40.0],
          [-10.0, 45.0],
          [0.0, 50.0],
          [5.0, 52.0],
        ],
      },
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
        status: "ACTIVE",
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [5.0, 43.0],
          [15.0, 38.0],
          [30.0, 31.0],
          [40.0, 20.0],
          [70.0, 15.0],
          [100.0, 5.0],
        ],
      },
    },
  ],
};

const fallbackStations: FeatureCollection = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature",
      properties: {
        id: "st-nj",
        name: "Manasquan, NJ",
        country: "United States",
        cables: "TAT-14",
      },
      geometry: { type: "Point", coordinates: [-74.0, 40.0] },
    },
    {
      type: "Feature",
      properties: {
        id: "st-uk",
        name: "Bude, UK",
        country: "United Kingdom",
        cables: "TAT-14",
      },
      geometry: { type: "Point", coordinates: [0.0, 50.0] },
    },
    {
      type: "Feature",
      properties: {
        id: "st-fr",
        name: "Marseille",
        country: "France",
        cables: "SEA-ME-WE 4",
      },
      geometry: { type: "Point", coordinates: [5.0, 43.0] },
    },
    {
      type: "Feature",
      properties: {
        id: "st-eg",
        name: "Alexandria",
        country: "Egypt",
        cables: "SEA-ME-WE 4",
      },
      geometry: { type: "Point", coordinates: [30.0, 31.0] },
    },
  ],
};

const fallbackEmpty: FeatureCollection = {
  type: "FeatureCollection" as const,
  features: [],
};

export const useInfraData = () => {
  const [cablesData, setCablesData] = useState<FeatureCollection | null>(null);
  const [stationsData, setStationsData] = useState<FeatureCollection | null>(
    null,
  );
  const [outagesData, setOutagesData] = useState<FeatureCollection | null>(
    null,
  );
  const [gdeltData, setGdeltData] = useState<FeatureCollection | null>(null);
  const [nwsAlertsData, setNwsAlertsData] = useState<FeatureCollection | null>(
    null,
  );
  const [ixpData, setIxpData] = useState<FeatureCollection | null>(null);
  const [facilityData, setFacilityData] = useState<FeatureCollection | null>(null);
  const [dnsRootData, setDnsRootData] = useState<DnsRootServer[]>([]);
  const [cdnEdgeData, setCdnEdgeData] = useState<CdnEdgeNode[]>([]);

  // Track whether PeeringDB data has been fetched once (it's global, no bbox needed)
  const peeringdbFetchedRef = useRef(false);

  useEffect(() => {
    const fetchCables = async () => {
      try {
        const res = await fetch("/api/infra/cables");
        const data: unknown = await res.json();
        if (isFeatureCollection(data) && data.features.length > 0) {
          setCablesData(data);
        } else {
          setCablesData(fallbackCables);
        }
      } catch (err) {
        console.warn("Cables fetch failed, using fallback:", err);
        setCablesData(fallbackCables);
      }
    };

    const fetchStations = async () => {
      try {
        const res = await fetch("/api/infra/stations");
        const data: unknown = await res.json();
        if (isFeatureCollection(data) && data.features.length > 0) {
          setStationsData(data);
        } else {
          setStationsData(fallbackStations);
        }
      } catch (err) {
        console.warn("Stations fetch failed, using fallback:", err);
        setStationsData(fallbackStations);
      }
    };

    const fetchOutages = async () => {
      try {
        const res = await fetch("/api/infra/outages");
        const data: unknown = await res.json();
        if (isFeatureCollection(data)) {
          setOutagesData(data);
        } else {
          setOutagesData(fallbackEmpty);
        }
      } catch (err) {
        console.warn("Outages fetch failed, using fallback:", err);
        setOutagesData(fallbackEmpty);
      }
    };

    const fetchGdelt = async () => {
      try {
        const res = await fetch("/api/gdelt/events");
        const data: unknown = await res.json();
        if (isFeatureCollection(data)) {
          setGdeltData(data);
        } else {
          setGdeltData(fallbackEmpty);
        }
      } catch (err) {
        console.warn("GDELT fetch failed, using fallback:", err);
        setGdeltData(fallbackEmpty);
      }
    };

    const fetchNwsAlerts = async () => {
      try {
        const res = await fetch("/api/infra/nws-alerts");
        const data: unknown = await res.json();
        if (isFeatureCollection(data)) {
          setNwsAlertsData(data);
        } else {
          setNwsAlertsData(fallbackEmpty);
        }
      } catch (err) {
        console.warn("NWS alerts fetch failed, using fallback:", err);
        setNwsAlertsData(fallbackEmpty);
      }
    };

    const fetchPeeringDB = async () => {
      if (peeringdbFetchedRef.current) return;
      try {
        const [ixpRes, facRes] = await Promise.all([
          fetch("/api/infrastructure/ixps"),
          fetch("/api/infrastructure/facilities"),
        ]);
        const ixpJson: unknown = await ixpRes.json();
        const facJson: unknown = await facRes.json();
        if (isFeatureCollection(ixpJson)) setIxpData(ixpJson);
        if (isFeatureCollection(facJson)) setFacilityData(facJson);
        peeringdbFetchedRef.current = true;
      } catch (err) {
        console.warn("PeeringDB fetch failed:", err);
      }
    };

    const fetchDnsRoot = async () => {
      try {
        const res = await fetch("/api/infra/dns-root");
        if (res.ok) {
          const j = await res.json() as { servers?: DnsRootServer[] };
          setDnsRootData(j.servers ?? []);
        }
      } catch (err) {
        console.warn("DNS root fetch failed:", err);
      }
    };

    const fetchCdnEdge = async () => {
      try {
        const res = await fetch("/api/infra/cdn-nodes");
        if (res.ok) {
          const j = await res.json() as { nodes?: CdnEdgeNode[] };
          setCdnEdgeData(j.nodes ?? []);
        }
      } catch (err) {
        console.warn("CDN edge fetch failed:", err);
      }
    };

    const fetchAll = () => {
      fetchCables();
      fetchStations();
      fetchOutages();
      fetchGdelt();
      fetchNwsAlerts();
      fetchPeeringDB();
      fetchDnsRoot();
      fetchCdnEdge();
    };

    fetchAll();

    // Refresh outages every 10 minutes from the backend (which caches every 30m)
    const outageInterval = setInterval(fetchOutages, 10 * 60 * 1000);
    // Refresh GDELT every 15 minutes
    const gdeltInterval = setInterval(fetchGdelt, 15 * 60 * 1000);
    // Refresh NWS active alerts every 5 minutes (poller updates every 10 minutes)
    const nwsInterval = setInterval(fetchNwsAlerts, 5 * 60 * 1000);
    // Refresh PeeringDB once every 24 hours (matches poller cadence)
    const peeringdbInterval = setInterval(
      () => {
        peeringdbFetchedRef.current = false;
        fetchPeeringDB();
      },
      24 * 60 * 60 * 1000,
    );
    // Refresh DNS root health every 5 minutes (matches poller cadence)
    const dnsInterval = setInterval(fetchDnsRoot, 5 * 60 * 1000);
    // Refresh CDN edge PoPs every 6 hours (matches poller cadence)
    const cdnInterval = setInterval(fetchCdnEdge, 6 * 60 * 60 * 1000);
    return () => {
      clearInterval(outageInterval);
      clearInterval(gdeltInterval);
      clearInterval(nwsInterval);
      clearInterval(peeringdbInterval);
      clearInterval(dnsInterval);
      clearInterval(cdnInterval);
    };
  }, []);

  return {
    cablesData,
    stationsData,
    outagesData,
    gdeltData,
    nwsAlertsData,
    ixpData,
    facilityData,
    dnsRootData,
    cdnEdgeData,
  };
};

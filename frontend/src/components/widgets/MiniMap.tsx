import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { cellToBoundary } from "h3-js";
import { fetchClusters } from "../../api/clusters";
import { fetchH3Risk } from "../../api/h3Risk";
import { CoTEntity } from "../../types";
import { calculateZoom, getDistanceMeters } from "../../utils/map/geoUtils";

const DARK_MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export interface RFSiteResult {
  id: string;
  callsign: string;
  name: string;
  service: string;
  emcomm_flags: string[] | null;
  city: string | null;
  state: string | null;
  modes: string[];
  lat?: number;
  lon?: number;
}

function makeMissionCircle(
  lat: number,
  lon: number,
  radiusNm: number,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const NM_TO_DEG = 1 / 60;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const safeCos = Math.max(Math.abs(cosLat), 0.0001);
  const N = 128;
  const coords: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * 2 * Math.PI;
    coords.push([
      lon + ((radiusNm * NM_TO_DEG) / safeCos) * Math.sin(a),
      lat + radiusNm * NM_TO_DEG * Math.cos(a),
    ]);
  }
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [coords] },
    properties: {},
  };
}

/** Build an 8-sided polygon ring in geographic coords for MapLibre fill layers. */
function makeOctagonRing(
  lat: number,
  lon: number,
  radiusM: number,
): [number, number][] {
  const sides = 8;
  const latDeg = radiusM / 111_320;
  const lonDeg = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  // Rotate 22.5° so a flat edge faces up (stop-sign orientation)
  const offset = Math.PI / 8;
  const ring: [number, number][] = [];
  for (let i = 0; i <= sides; i++) {
    const angle = offset + (i * 2 * Math.PI) / sides;
    ring.push([lon + lonDeg * Math.cos(angle), lat + latDeg * Math.sin(angle)]);
  }
  return ring;
}

export interface MiniMapProps {
  mission: { lat: number; lon: number; radius_nm: number };
  entitiesRef: React.MutableRefObject<Map<string, CoTEntity>>;
  satellitesRef: React.MutableRefObject<Map<string, CoTEntity>>;
  rfSites: RFSiteResult[];
  nwsAlerts?: GeoJSON.Feature[];
}

export const MiniTacticalMap: React.FC<MiniMapProps> = ({
  mission,
  entitiesRef,
  satellitesRef,
  rfSites,
  nwsAlerts = [],
}) => {
  const DASHBOARD_RISK_CRITICAL_THRESHOLD = 0.72;
  const [h3RiskFeatures, setH3RiskFeatures] = useState<GeoJSON.Feature[]>([]);
  const [jammingFeatures, setJammingFeatures] = useState<GeoJSON.Feature[]>([]);
  const [holdingFeatures, setHoldingFeatures] = useState<GeoJSON.Feature[]>([]);
  const [clusterFeatures, setClusterFeatures] = useState<GeoJSON.Feature[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef(false);
  const criticalHolds = holdingFeatures.filter((f: any) => {
    const turns = Number(f?.properties?.turns_completed ?? 0);
    return turns >= 5;
  }).length;

  useEffect(() => {
    if (!containerRef.current) return;
    const zoom = Math.max(2, calculateZoom(mission.radius_nm) - 1.0);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_MAP_STYLE,
      center: [mission.lon, mission.lat],
      zoom,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;
    map.on("load", () => {
      const circle = makeMissionCircle(
        mission.lat,
        mission.lon,
        mission.radius_nm,
      );
      map.addSource("mission-circle", { type: "geojson", data: circle });
      map.addLayer({
        id: "mission-fill",
        type: "fill",
        source: "mission-circle",
        paint: { "fill-color": "#00ff41", "fill-opacity": 0.05 },
      });

      map.addSource("h3-risk", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "h3-risk-fill",
        type: "fill",
        source: "h3-risk",
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "risk_score"], 0],
            0.72,
            "#ff9f1c",
            0.85,
            "#ff5f3d",
            1,
            "#ff3246",
          ],
          "fill-opacity": 0.4,
        },
      });
      map.addLayer({
        id: "h3-risk-line",
        type: "line",
        source: "h3-risk",
        paint: {
          "line-color": "#ffd1d8",
          "line-opacity": 0.6,
          "line-width": 1.4,
        },
      });

      map.addLayer({
        id: "mission-border",
        type: "line",
        source: "mission-circle",
        paint: {
          "line-color": "#00ff41",
          "line-width": 1.5,
          "line-opacity": 0.7,
        },
      });
      map.addSource("entities", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "ent-air",
        type: "circle",
        source: "entities",
        filter: ["==", ["get", "etype"], "air"],
        paint: {
          "circle-radius": 2.5,
          "circle-color": "#00ff41",
          "circle-opacity": 0.85,
        },
      });
      map.addLayer({
        id: "ent-sea",
        type: "circle",
        source: "entities",
        filter: ["==", ["get", "etype"], "sea"],
        paint: {
          "circle-radius": 2.5,
          "circle-color": "#22d3ee",
          "circle-opacity": 0.85,
        },
      });
      map.addSource("orbital", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "ent-orbital",
        type: "circle",
        source: "orbital",
        paint: {
          "circle-radius": 2,
          "circle-color": "#a855f7",
          "circle-opacity": 0.6,
        },
      });
      map.addSource("emcomm", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "ent-emcomm",
        type: "circle",
        source: "emcomm",
        paint: {
          "circle-radius": 2,
          "circle-color": "#fbbf24",
          "circle-opacity": 0.8,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fbbf2433",
        },
      });

      map.addSource("jamming-zones", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "jamming-zone-halo",
        type: "circle",
        source: "jamming-zones",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "confidence"], 0],
            0,
            4,
            1,
            10,
          ],
          "circle-color": [
            "match",
            ["get", "assessment"],
            "jamming",
            "#fb3c3c",
            "space_weather",
            "#a766ff",
            "equipment",
            "#6b7280",
            "#fbbf24",
          ],
          "circle-opacity": 0.25,
          "circle-stroke-width": 1,
          "circle-stroke-color": [
            "match",
            ["get", "assessment"],
            "jamming",
            "#fb3c3c",
            "space_weather",
            "#a766ff",
            "equipment",
            "#94a3b8",
            "#fbbf24",
          ],
          "circle-stroke-opacity": 0.6,
        },
      });

      map.addSource("holding-zones", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "holding-zone-halo",
        type: "circle",
        source: "holding-zones",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "turns_completed"], 0],
            0,
            3,
            2,
            7,
            5,
            11,
          ],
          "circle-color": [
            "case",
            [">=", ["coalesce", ["get", "turns_completed"], 0], 5],
            "#ff3838",
            [">=", ["coalesce", ["get", "turns_completed"], 0], 2],
            "#ff7800",
            "#fbb700",
          ],
          "circle-opacity": 0.2,
          "circle-stroke-width": 1,
          "circle-stroke-color": [
            "case",
            [">=", ["coalesce", ["get", "turns_completed"], 0], 5],
            "#ff3838",
            [">=", ["coalesce", ["get", "turns_completed"], 0], 2],
            "#ff7800",
            "#fbb700",
          ],
          "circle-stroke-opacity": 0.75,
        },
      });

      map.addLayer({
        id: "holding-zone-core",
        type: "circle",
        source: "holding-zones",
        paint: {
          "circle-radius": 2,
          "circle-color": [
            "case",
            [">=", ["coalesce", ["get", "turns_completed"], 0], 5],
            "#ff3838",
            [">=", ["coalesce", ["get", "turns_completed"], 0], 2],
            "#ff7800",
            "#fbb700",
          ],
          "circle-opacity": 0.95,
        },
      });

      map.addSource("cluster-zones", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "cluster-zone-fill",
        type: "fill",
        source: "cluster-zones",
        paint: {
          "fill-color": "#06b6d4",
          "fill-opacity": 0.10,
        },
      });
      map.addLayer({
        id: "cluster-zone-outline",
        type: "line",
        source: "cluster-zones",
        paint: {
          "line-color": "#22d3ee",
          "line-width": 1.5,
          "line-opacity": 0.85,
        },
      });

      map.addSource("nws-alerts", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "nws-alerts-fill",
        type: "fill",
        source: "nws-alerts",
        paint: {
          "fill-color": [
            "match",
            ["coalesce", ["get", "severity"], "Unknown"],
            "Extreme", "#ef4444",
            "Severe", "#f97316",
            "Moderate", "#f59e0b",
            "Minor", "#3b82f6",
            "#6b7280"
          ],
          "fill-opacity": 0.15,
        },
      });
      map.addLayer({
        id: "nws-alerts-line",
        type: "line",
        source: "nws-alerts",
        paint: {
          "line-color": [
            "match",
            ["coalesce", ["get", "severity"], "Unknown"],
            "Extreme", "#ef4444",
            "Severe", "#f97316",
            "Moderate", "#f59e0b",
            "Minor", "#3b82f6",
            "#6b7280"
          ],
          "line-width": 1.5,
          "line-opacity": 0.6,
          "line-dasharray": [2, 2],
        },
      });

      mapReadyRef.current = true;
    });
    return () => {
      mapReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [mission.lat, mission.lon, mission.radius_nm]);

  useEffect(() => {
    let cancelled = false;

    // Use a fixed medium/coarse tactical resolution to balance readability and locality.
    const resolution = 4;

    const toPolygon = (cell: string): [number, number][] => {
      const boundary = cellToBoundary(cell) as [number, number][];
      const ring = boundary.map(([lat, lon]) => [lon, lat] as [number, number]);
      if (ring.length === 0) return ring;

      const [firstLon, firstLat] = ring[0];
      const [lastLon, lastLat] = ring[ring.length - 1];
      if (firstLon !== lastLon || firstLat !== lastLat) {
        ring.push([firstLon, firstLat]);
      }
      return ring;
    };

    const fetchRiskOverlay = async () => {
      try {
        const cells = await fetchH3Risk(resolution);
        if (cancelled) return;

        const radiusMeters = mission.radius_nm * 1852 * 1.25;
        const criticalCells = cells
          .filter(
            (c) =>
              c.risk_score >= DASHBOARD_RISK_CRITICAL_THRESHOLD &&
              getDistanceMeters(mission.lat, mission.lon, c.lat, c.lon) <=
              radiusMeters,
          )
          .sort((a, b) => b.risk_score - a.risk_score)
          .slice(0, 300);

        const features = criticalCells
          .map((c) => {
            const polygon = toPolygon(c.cell);
            if (polygon.length < 4) return null;
            return {
              type: "Feature" as const,
              geometry: {
                type: "Polygon" as const,
                coordinates: [polygon],
              },
              properties: {
                risk_score: c.risk_score,
              },
            };
          })
          .filter((feature): feature is NonNullable<typeof feature> => !!feature);

        setH3RiskFeatures(features as GeoJSON.Feature[]);
      } catch {
        if (!cancelled) {
          setH3RiskFeatures([]);
        }
      }
    };

    fetchRiskOverlay();
    const id = setInterval(fetchRiskOverlay, 90_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mission.lat, mission.lon, mission.radius_nm]);

  useEffect(() => {
    let cancelled = false;

    const fetchHazardOverlays = async () => {
      try {
        const [jammingResp, holdingResp] = await Promise.all([
          fetch("/api/jamming/active"),
          fetch("/api/holding-patterns/active"),
        ]);

        if (!cancelled && jammingResp.ok) {
          const j = await jammingResp.json();
          setJammingFeatures(
            Array.isArray(j?.features) ? (j.features as GeoJSON.Feature[]) : [],
          );
        }

        if (!cancelled && holdingResp.ok) {
          const h = await holdingResp.json();
          setHoldingFeatures(
            Array.isArray(h?.features) ? (h.features as GeoJSON.Feature[]) : [],
          );
        }
      } catch {
        // Non-blocking mini-map overlays.
      }
    };

    fetchHazardOverlays();
    const id = setInterval(fetchHazardOverlays, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchClusterOverlay = async () => {
      try {
        const resp = await fetchClusters({
          lat: mission.lat,
          lon: mission.lon,
          radiusNm: mission.radius_nm,
          lookbackHours: 4,
        });
        if (cancelled) return;
        // Build octagon Polygon features (matches tactical map shape)
        const BASE_R = 3000; // metres — same as CLUSTER_BASE_RADIUS_M in buildClusterLayer.ts
        const MAX_R = 12000;
        const features: GeoJSON.Feature[] = (resp.clusters ?? []).map((c) => {
          const radiusM = Math.min(BASE_R + c.entity_count * 250, MAX_R);
          const ring = makeOctagonRing(c.centroid_lat, c.centroid_lon, radiusM);
          return {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [ring] },
            properties: { entity_count: c.entity_count, cluster_id: c.cluster_id },
          };
        });
        setClusterFeatures(features);
      } catch {
        // Non-blocking.
      }
    };

    fetchClusterOverlay();
    const id = setInterval(fetchClusterOverlay, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mission.lat, mission.lon, mission.radius_nm]);

  const updateLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    const airSea: GeoJSON.Feature[] = [];
    entitiesRef.current.forEach((e) => {
      airSea.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [e.lon, e.lat] },
        properties: {
          etype: e.vesselClassification !== undefined ? "sea" : "air",
        },
      });
    });
    const orb: GeoJSON.Feature[] = [];
    satellitesRef.current.forEach((e) => {
      if (e.detail?.constellation !== "Starlink") {
        orb.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [e.lon, e.lat] },
          properties: {},
        });
      }
    });
    const emcomm: GeoJSON.Feature[] = [];
    rfSites.forEach((s) => {
      if (s.lat !== undefined && s.lon !== undefined) {
        emcomm.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [s.lon, s.lat] },
          properties: {},
        });
      }
    });

    (
      map.getSource("entities") as maplibregl.GeoJSONSource | undefined
    )?.setData({ type: "FeatureCollection", features: airSea });
    (map.getSource("orbital") as maplibregl.GeoJSONSource | undefined)?.setData(
      { type: "FeatureCollection", features: orb },
    );
    (map.getSource("emcomm") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: emcomm,
    });
    (
      map.getSource("jamming-zones") as maplibregl.GeoJSONSource | undefined
    )?.setData({
      type: "FeatureCollection",
      features: jammingFeatures,
    });
    (
      map.getSource("holding-zones") as maplibregl.GeoJSONSource | undefined
    )?.setData({
      type: "FeatureCollection",
      features: holdingFeatures,
    });
    (map.getSource("h3-risk") as maplibregl.GeoJSONSource | undefined)?.setData(
      {
        type: "FeatureCollection",
        features: h3RiskFeatures,
      },
    );
    (map.getSource("cluster-zones") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: clusterFeatures,
    });
    (map.getSource("nws-alerts") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: nwsAlerts,
    });
  }, [
    entitiesRef,
    satellitesRef,
    rfSites,
    jammingFeatures,
    holdingFeatures,
    h3RiskFeatures,
    clusterFeatures,
    nwsAlerts,
  ]);

  useEffect(() => {
    const t0 = setTimeout(updateLayers, 1500);
    const ti = setInterval(updateLayers, 5000);
    return () => {
      clearTimeout(t0);
      clearInterval(ti);
    };
  }, [updateLayers]);

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />

      {/* Bottom-right mini-map hazard legend */}
      <div className="pointer-events-none absolute bottom-2 right-2 z-10 rounded border border-amber-400/25 bg-black/75 px-2 py-1 shadow-[0_2px_10px_rgba(0,0,0,0.4)] backdrop-blur-sm">
        <div className="text-[7px] uppercase tracking-widest text-white/45 font-bold">
          Hazards
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
          <span className="text-[8px] font-bold text-rose-300">JAM</span>
          <span className="text-[8px] text-white/55 tabular-nums">
            {jammingFeatures.length}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${criticalHolds > 0 ? "bg-red-400" : "bg-amber-400"}`}
          />
          <span
            className={`text-[8px] font-bold ${criticalHolds > 0 ? "text-red-300" : "text-amber-300"}`}
          >
            HOLD
          </span>
          <span className="text-[8px] text-white/55 tabular-nums">
            {holdingFeatures.length}
            {criticalHolds > 0 ? ` (${criticalHolds}C)` : ""}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
          <span className="text-[8px] font-bold text-cyan-300">CLSTR</span>
          <span className="text-[8px] text-white/55 tabular-nums">
            {clusterFeatures.length}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-red-300" />
          <span className="text-[8px] font-bold text-red-200">CRIT RISK</span>
          <span className="text-[8px] text-white/55 tabular-nums">
            {h3RiskFeatures.length}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          <span className="text-[8px] font-bold text-amber-400">NWS</span>
          <span className="text-[8px] text-white/55 tabular-nums">
            {nwsAlerts.length}
          </span>
        </div>
      </div>
    </div>
  );
};

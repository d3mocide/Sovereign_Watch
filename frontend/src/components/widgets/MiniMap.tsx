import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import React, { useCallback, useEffect, useRef } from "react";
import { CoTEntity } from "../../types";
import { calculateZoom } from "../../utils/map/geoUtils";

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

export interface MiniMapProps {
  mission: { lat: number; lon: number; radius_nm: number };
  entitiesRef: React.MutableRefObject<Map<string, CoTEntity>>;
  satellitesRef: React.MutableRefObject<Map<string, CoTEntity>>;
  rfSites: RFSiteResult[];
}

export const MiniTacticalMap: React.FC<MiniMapProps> = ({
  mission,
  entitiesRef,
  satellitesRef,
  rfSites,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef(false);

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
      mapReadyRef.current = true;
    });
    return () => {
      mapReadyRef.current = false;
      map.remove();
      mapRef.current = null;
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

    (map.getSource("entities") as maplibregl.GeoJSONSource | undefined)?.setData(
      { type: "FeatureCollection", features: airSea },
    );
    (map.getSource("orbital") as maplibregl.GeoJSONSource | undefined)?.setData(
      { type: "FeatureCollection", features: orb },
    );
    (map.getSource("emcomm") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: emcomm,
    });
  }, [entitiesRef, satellitesRef, rfSites]);

  useEffect(() => {
    const t0 = setTimeout(updateLayers, 1500);
    const ti = setInterval(updateLayers, 5000);
    return () => {
      clearTimeout(t0);
      clearInterval(ti);
    };
  }, [updateLayers]);

  return <div ref={containerRef} className="w-full h-full" />;
};

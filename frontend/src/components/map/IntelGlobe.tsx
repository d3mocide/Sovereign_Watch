/**
 * IntelGlobe — OSINT Globe View
 *
 * A dedicated 3D globe map for the INTEL view mode.
 * Layers:
 *   1. Country heat overlay (GeoJsonLayer, threat-tinted country fills)
 *   2. GDELT event dots (ScatterplotLayer, existing buildGdeltLayer)
 *   3. Conflict arc projections (ArcLayer, buildGdeltArcLayer)
 *
 * The map is always in globe (3D) projection and uses the CARTO dark-matter style.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
import type { CoTEntity } from "../../types";
import { buildGdeltLayer, type GdeltPoint } from "../../layers/buildGdeltLayer";
import { buildGdeltArcLayer } from "../../layers/buildGdeltArcLayer";
import { buildCountryHeatLayer, type ActorEntry } from "../../layers/buildCountryHeatLayer";
import { type MapStyleKey, resolveMapStyle } from "./intelMapStyles";

const MapLibreAdapterLazy = lazy(() => import("./MapLibreAdapter"));

interface IntelGlobeProps {
  gdeltData: FeatureCollection | null;
  worldCountriesData: FeatureCollection | null;
  onEntitySelect: (entity: CoTEntity | null) => void;
  mapStyle?: MapStyleKey;
}

export function IntelGlobe({
  gdeltData,
  worldCountriesData,
  onEntitySelect,
  mapStyle: mapStyleProp = "dark",
}: IntelGlobeProps) {
  // Always globe (3D) projection
  const [viewState, setViewState] = useState({
    latitude: 20,
    longitude: 15,
    zoom: 1.8,
    pitch: 0,
    bearing: 0,
  });

  // Actors for country heat layer
  const [actors, setActors] = useState<ActorEntry[]>([]);

  // Animation tick for arc pulse (0→1 once per second)
  const animTickRef = useRef(0);
  const [animTick, setAnimTick] = useState(0);

  // Fetch actors on mount and refresh every 5 minutes
  useEffect(() => {
    const fetchActors = async () => {
      try {
        const res = await fetch("/api/gdelt/actors?limit=40&hours=24");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setActors(data);
        }
      } catch {
        // silently ignore — country heat just won't show
      }
    };
    fetchActors();
    const interval = setInterval(fetchActors, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Animation loop — continuous tick for smooth arc pulse
  useEffect(() => {
    let last = performance.now();
    let raf: number;
    const loop = (now: number) => {
      const dt = (now - last) / 1000; // seconds
      last = now;
      animTickRef.current = (animTickRef.current + dt) % 1;
      setAnimTick(animTickRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // IntelGlobe uses the sidebar for GDELT detail; no floating tooltip needed.
  const handleHover = useCallback(() => {}, []);

  const handleGdeltClick = useCallback(
    (event: GdeltPoint) => {
      onEntitySelect({
        uid: `gdelt-${event.event_id}`,
        type: "gdelt",
        callsign: event.name,
        lat: event.lat,
        lon: event.lon,
        altitude: 0,
        course: 0,
        speed: 0,
        lastSeen: Date.now(),
        trail: [],
        uidHash: 0,
        detail: event as unknown as Record<string, unknown>,
      } as CoTEntity);
    },
    [onEntitySelect],
  );

  const layers = [
    // 1. Country threat heat
    ...buildCountryHeatLayer(
      worldCountriesData as any,
      actors,
      true,
      true,
      animTick,
    ),
    // 2. GDELT event dots (all events — no tone filter in Intel view)
    ...buildGdeltLayer(
      gdeltData as any,
      true,
      true,
      -Infinity,
      false, // no domain labels — too noisy at global zoom
      handleHover,
      handleGdeltClick,
    ),
    // 3. Conflict arc projections
    ...buildGdeltArcLayer(gdeltData as any, true, true, animTick),
  ];

  return (
    <div className="absolute inset-0">
      <Suspense fallback={<div className="absolute inset-0 bg-tactical-bg" />}>
        <MapLibreAdapterLazy
          viewState={viewState}
          onMove={(evt: any) => setViewState(evt.viewState)}
          mapStyle={resolveMapStyle(mapStyleProp) as string}
          style={{ width: "100%", height: "100%" }}
          globeMode={true}
          showAttribution={false}
          deckProps={{
            id: "intel-globe-overlay",
            key: "intel-globe",
            globeMode: true,
            layers,
          }}
        />
      </Suspense>
    </div>
  );
}

/**
 * IntelGlobe — OSINT Globe View
 *
 * A dedicated 3D globe map for the INTEL view mode.
 * Layers:
 *   1. Country heat overlay (GeoJsonLayer, threat-tinted country fills)
 *   2. GDELT event dots (ScatterplotLayer, existing buildGdeltLayer)
 *   3. Conflict arc projections (ArcLayer, buildGdeltArcLayer)
 *
 * Auto-spin: when `spin` is true the globe rotates at ~3°/s.
 * User interaction (onMove) pauses spin for 3 s before resuming.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
import type { CoTEntity } from "../../types";
import { buildGdeltLayer, type GdeltPoint } from "../../layers/buildGdeltLayer";
import { buildGdeltArcLayer } from "../../layers/buildGdeltArcLayer";
import { buildCountryHeatLayer, type ActorEntry } from "../../layers/buildCountryHeatLayer";
import { type MapStyleKey, resolveMapStyle } from "./intelMapStyles";

const SPIN_DEG_PER_SEC = 3;
const SPIN_RESUME_DELAY_MS = 3000;

const MapLibreAdapterLazy = lazy(() => import("./MapLibreAdapter"));

interface IntelGlobeProps {
  gdeltData: FeatureCollection | null;
  worldCountriesData: FeatureCollection | null;
  onEntitySelect: (entity: CoTEntity | null) => void;
  mapStyle?: MapStyleKey;
  /** When true the globe auto-rotates; pauses 3 s after any user interaction. */
  spin?: boolean;
}

export function IntelGlobe({
  gdeltData,
  worldCountriesData,
  onEntitySelect,
  mapStyle: mapStyleProp = "dark",
  spin = false,
}: IntelGlobeProps) {
  const [viewState, setViewState] = useState({
    latitude: 20,
    longitude: 15,
    zoom: 1.8,
    pitch: 0,
    bearing: 0,
  });

  // Mutable refs for rAF loop — avoids stale closures
  const viewStateRef = useRef(viewState);
  viewStateRef.current = viewState;
  const spinRef = useRef(spin);
  spinRef.current = spin;
  const lastInteractionRef = useRef<number>(0); // timestamp of last onMove

  // Actors for country heat layer
  const [actors, setActors] = useState<ActorEntry[]>([]);

  // animTick drives arc opacity pulse (0→1 per second)
  const animTickRef = useRef(0);
  const [animTick, setAnimTick] = useState(0);

  // Fetch actors on mount and every 5 minutes
  useEffect(() => {
    const fetchActors = async () => {
      try {
        const res = await fetch("/api/gdelt/actors?limit=40&hours=24");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setActors(data);
        }
      } catch {
        // silently ignore
      }
    };
    fetchActors();
    const interval = setInterval(fetchActors, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Combined rAF loop: arc pulse tick + globe spin
  useEffect(() => {
    let last = performance.now();
    let raf: number;

    const loop = (now: number) => {
      const dt = (now - last) / 1000; // seconds elapsed
      last = now;

      // Arc pulse
      animTickRef.current = (animTickRef.current + dt) % 1;
      setAnimTick(animTickRef.current);

      // Globe spin — only when enabled and user has been idle ≥ SPIN_RESUME_DELAY_MS
      if (spinRef.current) {
        const idleMs = now - lastInteractionRef.current;
        if (idleMs >= SPIN_RESUME_DELAY_MS) {
          setViewState((prev) => ({
            ...prev,
            longitude: prev.longitude + SPIN_DEG_PER_SEC * dt,
          }));
        }
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []); // stable — reads spin/viewState via refs

  const handleMove = useCallback((evt: any) => {
    lastInteractionRef.current = performance.now();
    setViewState(evt.viewState);
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
    ...buildCountryHeatLayer(worldCountriesData as any, actors, true, true, animTick),
    ...buildGdeltLayer(gdeltData as any, true, true, -Infinity, false, handleHover, handleGdeltClick),
    ...buildGdeltArcLayer(gdeltData as any, true, true, animTick),
  ];

  return (
    <div className="absolute inset-0">
      <Suspense fallback={<div className="absolute inset-0 bg-tactical-bg" />}>
        <MapLibreAdapterLazy
          viewState={viewState}
          onMove={handleMove}
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

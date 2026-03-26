/**
 * IntelGlobe — OSINT Globe View
 *
 * Renders identically to SituationGlobe / OrbitalMap:
 *   - MapLibre GL globe as the base renderer (beautiful tiles, proper depth context)
 *   - StarField background
 *   - DeckGL overlay via imperative MapboxOverlay.setProps() — same pattern as
 *     SituationGlobe, which renders GDELT on a MapLibre globe without any occlusion.
 *
 * WHY IMPERATIVE (not deckProps.layers):
 *   Passing layers reactively through deckProps.layers causes timing races between
 *   React re-renders and the MapboxOverlay's internal render cycle. The imperative
 *   setProps() pattern (used by SituationGlobe) bypasses this entirely — layers are
 *   pushed directly to the overlay each animation frame.
 */
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildCountryHeatLayer,
  type ActorEntry,
} from "../../layers/buildCountryHeatLayer";
import { buildGdeltArcLayer } from "../../layers/buildGdeltArcLayer";
import { buildGdeltLayer, type GdeltPoint } from "../../layers/buildGdeltLayer";
import type { CoTEntity } from "../../types";
import { resolveMapStyle, type MapStyleKey } from "./intelMapStyles";
import { MapControls } from "./MapControls";
import MapLibreAdapter from "./MapLibreAdapter";
import { StarField } from "./StarField";

const SPIN_DEG_PER_SEC = 3;
const SPIN_RESUME_DELAY_MS = 1000;

interface IntelGlobeProps {
  gdeltData: FeatureCollection | null;
  worldCountriesData: FeatureCollection | null;
  onEntitySelect: (entity: CoTEntity | null) => void;
  mapStyle?: MapStyleKey;
  onMapStyleChange?: (style: MapStyleKey) => void;
  renderMode?: "2D" | "3D";
  onRenderModeChange?: (mode: "2D" | "3D") => void;
  /** When true the globe auto-rotates; pauses after any user interaction. */
  spin?: boolean;
}

export function IntelGlobe({
  gdeltData,
  worldCountriesData,
  onEntitySelect,
  mapStyle: mapStyleProp = "dark",
  onMapStyleChange,
  renderMode = "3D",
  onRenderModeChange,
  spin = false,
}: IntelGlobeProps) {
  const globeMode = renderMode === "3D";
  const defaultZoom = 2.2; // ~2 clicks tighter than prior 1.8

  const [viewState, setViewState] = useState({
    latitude: 20,
    longitude: 15,
    zoom: defaultZoom,
    pitch: 0,
    bearing: 0,
  });

  // Mutable refs for rAF loop — avoids stale closures
  const spinRef = useRef(spin);
  spinRef.current = spin;
  const lastInteractionRef = useRef<number>(0);

  // Imperative overlay reference — same pattern as SituationGlobe
  const overlayRef = useRef<MapboxOverlay | null>(null);

  // Actors for country heat layer
  const [actors, setActors] = useState<ActorEntry[]>([]);

  // animTick drives arc opacity pulse (0->1 per second)
  // Also acts as the heartbeat that triggers imperative layer updates
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
      const dt = (now - last) / 1000;
      last = now;

      animTickRef.current = (animTickRef.current + dt) % 1;
      setAnimTick(animTickRef.current);

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

  const debugMode = mapStyleProp === "debug";
  const mapStyle = useMemo(() => resolveMapStyle(mapStyleProp), [mapStyleProp]);

  // Static layer: GDELT points don't pulse — recomputed only when data/handlers change
  const gdeltLayer = useMemo(
    () =>
      buildGdeltLayer(
        gdeltData as any,
        true,
        globeMode,
        -Infinity,
        false,
        handleHover,
        handleGdeltClick,
        debugMode,
      ),
    [gdeltData, globeMode, handleHover, handleGdeltClick, debugMode],
  );

  // Imperative overlay update — same pattern as SituationGlobe.
  // animTick fires every frame, so layers are pushed as soon as the overlay
  // is ready (overlayRef is set by onOverlayLoaded below).
  useEffect(() => {
    if (!overlayRef.current) return;
    overlayRef.current.setProps({
      layers: [
        ...buildCountryHeatLayer(
          worldCountriesData as any,
          actors,
          true,
          globeMode,
          animTick,
          debugMode,
        ),
        ...gdeltLayer,
        ...buildGdeltArcLayer(
          gdeltData as any,
          true,
          globeMode,
          animTick,
          debugMode,
        ),
      ],
    });
  }, [
    worldCountriesData,
    actors,
    animTick,
    gdeltLayer,
    gdeltData,
    globeMode,
    debugMode,
  ]);

  const zoomBy = useCallback((delta: number) => {
    setViewState((prev) => ({
      ...prev,
      zoom: Math.max(1, Math.min(8, prev.zoom + delta)),
    }));
  }, []);

  return (
    <div
      className="absolute inset-0 bg-[#0a0a0a]"
      style={{ userSelect: "none" }}
    >
      <StarField active={true} />
      <MapLibreAdapter
        key={`intel-maplibre-${renderMode}-${mapStyleProp}`}
        showAttribution={false}
        globeMode={globeMode}
        onLoad={(evt: unknown) => {
          const map = (evt as { target?: any })?.target;
          if (!map?.getStyle) return;

          const style = map.getStyle();
          const layers = style?.layers ?? [];

          for (const layer of layers) {
            const id = String(layer?.id ?? "").toLowerCase();
            const type = String(layer?.type ?? "").toLowerCase();

            const isLabelLayer =
              type === "symbol" ||
              id.includes("label") ||
              id.includes("place") ||
              id.includes("country-name") ||
              id.includes("settlement");

            if (!isLabelLayer) continue;
            if (!map.getLayer(layer.id)) continue;

            try {
              map.removeLayer(layer.id);
            } catch {
              // Ignore style-internal ordering errors during hot reload/style swaps.
            }
          }
        }}
        viewState={viewState}
        onMove={(evt: unknown) => {
          const moveEvt = evt as {
            originalEvent?: unknown;
            viewState?: Partial<typeof viewState>;
          };
          if (moveEvt.originalEvent) {
            lastInteractionRef.current = performance.now();
          }
          setViewState((prev) => ({
            latitude: moveEvt.viewState?.latitude ?? prev.latitude,
            longitude: moveEvt.viewState?.longitude ?? prev.longitude,
            zoom: moveEvt.viewState?.zoom ?? prev.zoom,
            pitch: globeMode ? 0 : (moveEvt.viewState?.pitch ?? prev.pitch),
            bearing: globeMode
              ? 0
              : (moveEvt.viewState?.bearing ?? prev.bearing),
          }));
        }}
        mapStyle={mapStyle}
        style={{
          width: "100vw",
          height: "100vh",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
        deckProps={{
          key: `intel-overlay-${mapStyleProp}`,
          id: "intel-overlay",
          onOverlayLoaded: (ov) => {
            overlayRef.current = ov;
          },
        }}
      />

      <MapControls
        globeMode={globeMode}
        onToggleGlobe={() => onRenderModeChange?.(globeMode ? "2D" : "3D")}
        enable3d={false}
        onSet2D={() => onRenderModeChange?.("2D")}
        onSet3D={() => onRenderModeChange?.("3D")}
        mapStyleMode={mapStyleProp}
        styleOptions={
          onMapStyleChange
            ? [
                { key: "dark", label: "DARK" },
                { key: "debug", label: "DEBUG" },
              ]
            : undefined
        }
        onSetStyleMode={(mode) => onMapStyleChange?.(mode as MapStyleKey)}
        onZoomIn={() => zoomBy(0.75)}
        onZoomOut={() => zoomBy(-0.75)}
      />
    </div>
  );
}

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
import { fetchH3Risk, type H3RiskCellData } from "../../api/h3Risk";
import { buildH3RiskLayer } from "../../layers/buildH3RiskLayer";
import {
  buildCountryHeatLayer,
  type ActorEntry,
} from "../../layers/buildCountryHeatLayer";
import { buildGdeltArcLayer } from "../../layers/buildGdeltArcLayer";
import { buildGdeltLayer, type GdeltPoint } from "../../layers/buildGdeltLayer";
import type { CoTEntity } from "../../types";
import type { MapFilters } from "../../types";
import { resolveMapStyle, type MapStyleKey } from "./intelMapStyles";
import { MapControls } from "./MapControls";
import MapLibreAdapter from "./MapLibreAdapter";
import { StarField } from "./StarField";

const SPIN_DEG_PER_SEC = 3;
const SPIN_RESUME_DELAY_MS = 1000;
const INTEL_H3_RISK_RESOLUTION = 4;

interface IntelGlobeProps {
  gdeltData: FeatureCollection | null;
  worldCountriesData: FeatureCollection | null;
  filters?: MapFilters;
  onEntitySelect: (entity: CoTEntity | null) => void;
}

export function IntelGlobe({
  gdeltData,
  worldCountriesData,
  filters,
  onEntitySelect,
}: IntelGlobeProps) {
  const [mapStyleKey, setMapStyleKey] = useState<MapStyleKey>("dark");
  const [projection, setProjection] = useState<"globe" | "mercator">("globe");
  const [spin, setSpin] = useState(true);
  const [enable3d, setEnable3d] = useState(false);

  const globeMode = projection === "globe";
  const defaultZoom = 2.2;

  // Viewstate state for interaction only
  const [viewState, setViewState] = useState({
    latitude: 20,
    longitude: 15,
    zoom: defaultZoom,
    pitch: 0,
    bearing: 0,
  });

  // Mutable refs for high-performance rAF loop (prevents React re-renders every frame)
  const mapRef = useRef<any>(null);
  const lngRef = useRef(15);
  const spinRef = useRef(spin);
  spinRef.current = spin;
  const lastInteractionRef = useRef<number>(0);

  // Imperative overlay reference
  const overlayRef = useRef<MapboxOverlay | null>(null);

  // Actors for country heat layer
  const [actors, setActors] = useState<ActorEntry[]>([]);
  const [h3RiskCells, setH3RiskCells] = useState<H3RiskCellData[]>([]);

  // animTick drives pulse animations
  const animTickRef = useRef(0);

  // Ref syncing for the RAF loop
  const worldCountriesDataRef = useRef(worldCountriesData);
  worldCountriesDataRef.current = worldCountriesData;

  const actorsRef = useRef(actors);
  actorsRef.current = actors;

  const gdeltDataRef = useRef(gdeltData);
  gdeltDataRef.current = gdeltData;

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const h3RiskCellsRef = useRef(h3RiskCells);
  h3RiskCellsRef.current = h3RiskCells;

  const globeModeRef = useRef(globeMode);
  globeModeRef.current = globeMode;

  // Fetch actors every 5 minutes
  useEffect(() => {
    const fetchActors = async () => {
      try {
        const res = await fetch("/api/gdelt/actors?limit=40&hours=24");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setActors(data);
        }
      } catch {
        /* skip */
      }
    };
    fetchActors();
    const interval = setInterval(fetchActors, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch H3 risk cells at a globe-friendly coarse resolution.
  useEffect(() => {
    if (!filters?.showH3Risk) {
      setH3RiskCells([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      const cells = await fetchH3Risk(INTEL_H3_RISK_RESOLUTION);
      if (!cancelled) setH3RiskCells(cells);
    };

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [filters?.showH3Risk]);

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

  const mapStyle = useMemo(() => resolveMapStyle(mapStyleKey), [mapStyleKey]);

  // Static layer memo
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
      ),
    [gdeltData, globeMode, handleHover, handleGdeltClick],
  );

  const gdeltLayerRef = useRef(gdeltLayer);
  gdeltLayerRef.current = gdeltLayer;

  // Animation & Data Layer composition loop
  useEffect(() => {
    let last = performance.now();
    let raf: number;

    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;

      animTickRef.current = (animTickRef.current + dt) % 1;

      // PERFORMANCE OPTIMIZATION: Imperative Spin
      // We update the map instance directly instead of triggering a React render cycle via setViewState.
      // This eliminates the jitter caused by concurrent state updates in SituationGlobe.
      if (spinRef.current && mapRef.current) {
        const idleMs = now - lastInteractionRef.current;
        if (idleMs >= SPIN_RESUME_DELAY_MS) {
          lngRef.current = (lngRef.current + SPIN_DEG_PER_SEC * dt) % 360;
          mapRef.current.jumpTo({
            center: [lngRef.current, viewState.latitude],
          });
        }
      }

      if (overlayRef.current) {
        overlayRef.current.setProps({
          layers: [
            ...buildH3RiskLayer(
              h3RiskCellsRef.current,
              !!filtersRef.current?.showH3Risk,
            ),
            ...buildCountryHeatLayer(
              worldCountriesDataRef.current as any,
              actorsRef.current,
              true,
              globeModeRef.current,
              animTickRef.current,
            ),
            ...gdeltLayerRef.current,
            ...buildGdeltArcLayer(
              gdeltDataRef.current as any,
              true,
              globeModeRef.current,
              animTickRef.current,
            ),
          ],
        });
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []); // Only run once on mount

  const zoomBy = useCallback((delta: number) => {
    setViewState((prev) => ({
      ...prev,
      zoom: Math.max(1, Math.min(8, prev.zoom + delta)),
    }));
  }, []);

  const handleAdjustBearing = useCallback((delta: number) => {
    setViewState((prev) => ({
      ...prev,
      bearing: (prev.bearing + delta) % 360,
    }));
  }, []);

  const handleAdjustPitch = useCallback((delta: number) => {
    setViewState((prev) => ({
      ...prev,
      pitch: Math.max(0, Math.min(60, prev.pitch + delta)),
    }));
  }, []);

  const handleResetNorth = useCallback(() => {
    setViewState((prev) => ({ ...prev, bearing: 0, pitch: 0 }));
  }, []);

  return (
    <div
      className="absolute inset-0 bg-[#0a0a0a]"
      style={{ userSelect: "none" }}
    >
      <StarField active={true} />
      <MapLibreAdapter
        key={`intel-maplibre-${globeMode ? "globe" : "mercator"}-${mapStyleKey}`}
        showAttribution={false}
        globeMode={globeMode}
        onLoad={(evt: any) => {
          const map = evt?.target;
          if (!map) return;
          mapRef.current = map;

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
              /* ignore style swap race */
            }
          }
        }}
        viewState={viewState}
        onMove={(evt: any) => {
          if (evt.originalEvent) {
            lastInteractionRef.current = performance.now();
          }
          const next = evt.viewState;
          if (next) {
            lngRef.current = next.longitude;
            setViewState({
              latitude: next.latitude,
              longitude: next.longitude,
              zoom: next.zoom,
              pitch: globeMode ? 0 : next.pitch,
              bearing: globeMode ? 0 : next.bearing,
            });
          }
        }}
        mapStyle={mapStyle}
        style={{
          width: "100vw",
          height: "100vh",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
        deckProps={{
          key: `intel-overlay-${mapStyleKey}-${globeMode}`,
          id: "intel-overlay",
          onOverlayLoaded: (ov) => {
            overlayRef.current = ov;
          },
        }}
      />

      <MapControls
        globeMode={globeMode}
        onToggleGlobe={() =>
          setProjection((p) => (p === "globe" ? "mercator" : "globe"))
        }
        enable3d={enable3d}
        onSet2D={() => {
          setEnable3d(false);
          setViewState((prev) => ({ ...prev, pitch: 0, bearing: 0 }));
        }}
        onSet3D={() => setEnable3d(true)}
        onAdjustBearing={handleAdjustBearing}
        onAdjustPitch={handleAdjustPitch}
        onResetNorth={handleResetNorth}
        mapStyleMode={mapStyleKey}
        styleOptions={[
          { key: "dark", label: "DARK" },
          { key: "satellite", label: "SAT" },
        ]}
        onSetStyleMode={(mode) => setMapStyleKey(mode as MapStyleKey)}
        onZoomIn={() => zoomBy(0.75)}
        onZoomOut={() => zoomBy(-0.75)}
        spin={spin}
        onToggleSpin={() => setSpin((s) => !s)}
        bottomOffsetClass="bottom-[42px]"
      />
    </div>
  );
}

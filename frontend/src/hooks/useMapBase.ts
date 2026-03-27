/**
 * useMapBase — shared base state for all map views.
 *
 * Extracts the ~70 lines of identical boilerplate that was duplicated between
 * TacticalMap and OrbitalMap (and partially IntelGlobe):
 *
 *   - map adapter selection (MapLibre vs Mapbox based on token availability)
 *   - map style resolution (dark / satellite / Mapbox standard)
 *   - mapRef / overlayRef / mapInstanceRef
 *   - mapLoaded / enable3d / mapStyleMode state
 *   - view state initialised from URL hash → env vars → defaults
 *   - URL hash sync effect
 *   - globe-mode reset effect (null stale instances, reset mapLoaded)
 *   - handleMapLoad / handleOverlayLoaded callbacks
 *
 * TacticalMap and OrbitalMap become thin wrappers that call this hook and add
 * their domain-specific layer composition and event handling on top.
 */

import { MapboxOverlay } from "@deck.gl/mapbox";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import {
  _enableMapbox,
  _isValidToken,
  _mapboxToken,
  DARK_MAP_STYLE,
  MapboxAdapterLazy,
  MapLibreAdapterLazy,
  SATELLITE_MAP_STYLE,
} from "../components/map/mapStyles";
import {
  parseMissionHash,
  updateMissionHash,
} from "./useMissionHash";

interface UseMapBaseOptions {
  /** Current globe projection state (drives adapter selection + style). */
  globeMode?: boolean;
  /** Initial zoom level when no URL hash is present. Defaults to 9.5. */
  defaultZoom?: number;
}

export function useMapBase({
  globeMode,
  defaultZoom = 9.5,
}: UseMapBaseOptions = {}) {
  // ---------------------------------------------------------------------------
  // Map state
  // ---------------------------------------------------------------------------
  const [mapLoaded, setMapLoaded] = useState(false);
  const [enable3d, setEnable3d] = useState(false);
  const [mapStyleMode, setMapStyleMode] = useState<"dark" | "satellite">(
    "dark",
  );

  // ---------------------------------------------------------------------------
  // Adapter + style selection
  // ---------------------------------------------------------------------------
  const mapToken = _enableMapbox && _isValidToken ? _mapboxToken : undefined;

  // Globe mode always uses MapLibre — Mapbox Globe blocks CustomLayerInterface
  // which is required by MapboxOverlay. Mercator uses Mapbox when a valid token
  // is present for premium basemap quality.
  const MapComponent =
    globeMode || !mapToken ? MapLibreAdapterLazy : MapboxAdapterLazy;

  const mapStyle =
    mapToken && !globeMode
      ? "mapbox://styles/mapbox/standard"
      : mapStyleMode === "satellite"
        ? SATELLITE_MAP_STYLE
        : DARK_MAP_STYLE;

  // ---------------------------------------------------------------------------
  // Refs
  // ---------------------------------------------------------------------------
  const mapRef = useRef<MapRef>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  // Raw MapLibre GL map from onLoad event.target (bypasses react-map-gl wrapping)
  const mapInstanceRef = useRef<unknown>(null);

  // ---------------------------------------------------------------------------
  // View state — initialised from URL hash → env vars → built-in defaults
  // ---------------------------------------------------------------------------
  const [viewState, setViewState] = useState(() => {
    const hashState = parseMissionHash();
    const envLat = import.meta.env.VITE_CENTER_LAT as string | undefined;
    const envLon = import.meta.env.VITE_CENTER_LON as string | undefined;
    const initialLat =
      hashState.lat !== null
        ? hashState.lat
        : envLat
          ? parseFloat(envLat)
          : 45.5152;
    const initialLon =
      hashState.lon !== null
        ? hashState.lon
        : envLon
          ? parseFloat(envLon)
          : -122.6784;
    const initialZoom =
      hashState.zoom !== null ? hashState.zoom : defaultZoom;
    return {
      latitude: initialLat,
      longitude: initialLon,
      zoom: initialZoom,
      pitch: 0,
      bearing: 0,
    };
  });

  // Sync view position back to URL hash whenever it changes
  useEffect(() => {
    updateMissionHash({
      lat: viewState.latitude,
      lon: viewState.longitude,
      zoom: viewState.zoom,
    });
  }, [viewState.latitude, viewState.longitude, viewState.zoom]);

  // On globe-mode toggle: null out stale map/overlay instances and reset loaded
  // flag so the new adapter initialises cleanly.
  useEffect(() => {
    setMapLoaded(false);
    mapInstanceRef.current = null;
    overlayRef.current = null;
  }, [globeMode]);

  // ---------------------------------------------------------------------------
  // Stable callbacks
  // ---------------------------------------------------------------------------
  const handleMapLoad = useCallback((evt?: unknown) => {
    // evt.target is the react-map-gl Map wrapper — call .getMap() for the
    // raw MapLibre/Mapbox GL instance.
    const target = (evt as { target?: unknown } | undefined)?.target;
    if (target && typeof target === "object") {
      const mapTarget = target as { getMap?: () => unknown };
      mapInstanceRef.current =
        typeof mapTarget.getMap === "function" ? mapTarget.getMap() : target;
    }
    setMapLoaded(true);
  }, []);

  const handleOverlayLoaded = useCallback((overlay: MapboxOverlay) => {
    overlayRef.current = overlay;
  }, []);

  return {
    // Refs
    mapRef,
    overlayRef,
    mapInstanceRef,
    // State
    mapLoaded,
    setMapLoaded,
    enable3d,
    setEnable3d,
    mapStyleMode,
    setMapStyleMode,
    // Derived
    mapToken,
    MapComponent,
    mapStyle,
    // View state
    viewState,
    setViewState,
    // Callbacks
    handleMapLoad,
    handleOverlayLoaded,
  };
}

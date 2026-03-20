import { useEffect } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { buildGraticule } from "../utils/map/geoUtils";

// Detect Mapbox token presence at module level (same pattern as TacticalMap)
const _mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
const _enableMapbox = import.meta.env.VITE_ENABLE_MAPBOX !== 'false';
const _isValidToken = !!_mapboxToken && _mapboxToken.startsWith('pk.');
const _isMapbox = _enableMapbox && _isValidToken;

interface UseMapCameraOptions {
  mapRef: React.RefObject<MapRef>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mapInstanceRef: React.MutableRefObject<any>;
  mapLoaded: boolean;
  globeMode: boolean | undefined;
  enable3d: boolean;
  setEnable3d: React.Dispatch<React.SetStateAction<boolean>>;
  mapToken: string;
  mapStyleMode?: 'dark' | 'satellite';
}

export function useMapCamera({
  mapRef,
  mapInstanceRef,
  mapLoaded,
  globeMode,
  enable3d,
  setEnable3d,
  mapToken,
  mapStyleMode = 'dark',
}: UseMapCameraOptions) {
  // Globe projection: Mapbox GL JS uses a string argument; MapLibre GL JS v5 uses { type }.
  // MapLibre v5 also requires the style to be loaded before setProjection can be called.
  useEffect(() => {
    if (!mapLoaded) return;
    const map = mapInstanceRef.current ?? (mapRef.current?.getMap?.() as unknown as { setProjection?: (p: unknown) => void; isStyleLoaded?: () => boolean; on?: (e: string, cb: () => void) => void; off?: (e: string, cb: () => void) => void });
    if (!map || typeof map.setProjection !== "function") return;

    const applyProjection = () => {
      // Globe mode always uses MapLibre adapter (regardless of token presence).
      // MapLibre requires the object form { type: 'globe' }; Mapbox uses a bare string.
      const isMapbox = !!mapToken && !globeMode;
      if (globeMode) {
        // Globe and 3D terrain/fog often conflict visually or performance-wise.
        // Force 2D mode when entering Globe view.
        setEnable3d(false);

        map.setProjection(isMapbox ? "globe" : { type: "globe" });

        const center = map.getCenter?.();

        // Globe view is locked to top-down (0 pitch, 0 bearing) for stability.
        // Fly-out to a high zoom (1.8) for a global perspective.
        // We do NOT call setViewState immediately here to avoid fighting the animation.
        map.flyTo({
          center,
          zoom: 1.8,
          pitch: 0,
          bearing: 0,
          duration: 1800,
          easing: (t: number) => 1 - Math.pow(1 - t, 3),
        });
      } else {
        map.setProjection(isMapbox ? "mercator" : { type: "mercator" });
      }
    };

    // MapLibre v5 requires style to be fully loaded before setProjection can be called
    if (map.isStyleLoaded?.()) {
      applyProjection();
    } else {
      map.once("style.load", applyProjection);
    }
  }, [globeMode, mapLoaded, mapToken]);

  // Graticule grid — only visible in globe mode
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!mapLoaded || !map) return;

    const SOURCE_ID = "graticule";
    const LAYER_ID = "graticule-lines";

    // White lines over satellite imagery; light blue over dark tactical basemap
    const lineColor = mapStyleMode === 'satellite'
      ? "rgba(255, 255, 255, 0.35)"
      : "rgba(80, 180, 255, 0.45)";

    const add = () => {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: buildGraticule(30) as unknown as GeoJSON.FeatureCollection,
        });
      }
      if (map.getLayer(LAYER_ID)) {
        // Update color in place when globeStyle changes without a full style reload
        map.setPaintProperty(LAYER_ID, "line-color", lineColor);
      } else {
        map.addLayer({
          id: LAYER_ID,
          type: "line",
          source: SOURCE_ID,
          // Safer: omit slot entirely for MapLibre, or use 'top' explicitly for Mapbox
          ...(_isMapbox ? { slot: "top" } : {}),
          layout: {
            "line-cap": "round",
          },
          paint: {
            "line-color": lineColor,
            "line-width": 0.5,
          },
        });
      }
    };

    const remove = () => {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };

    const apply = () => {
      if (globeMode) {
        add();
      } else {
        remove();
      }
    };

    // Use persistent listener so the graticule is re-applied whenever the style
    // is reloaded (e.g. switching between dark and satellite basemaps).
    map.on("style.load", apply);
    if (map.isStyleLoaded?.()) apply();

    return () => {
      map.off("style.load", apply);
    };
  }, [globeMode, mapLoaded, mapStyleMode]);

  // Dedicated 3D visuals + atmosphere Effect
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!mapLoaded || !map) return;

    const SKY_LAYER_ID = "tactical-sky-atmosphere";

    const sync3D = () => {
      // Globe always runs on MapLibre — token presence alone doesn't mean Mapbox.
      const isMapbox = !!mapToken && !globeMode;

      // ── Terrain (Mapbox only) ──────────────────────────────────────────
      if (enable3d) {
        if (isMapbox) {
          if (!map.getSource("mapbox-dem")) {
            map.addSource("mapbox-dem", {
              type: "raster-dem",
              url: "mapbox://mapbox.mapbox-terrain-dem-v1",
              tileSize: 512,
              maxzoom: 14,
            });
          }
          try {
            map.setTerrain({ source: "mapbox-dem", exaggeration: 2.0 });
          } catch (e) {
            console.warn("[TacticalMap] Failed to set terrain:", e);
          }
        }
      } else {
        if (map.getTerrain?.()) map.setTerrain(null);
      }

      // ── Atmosphere ────────────────────────────────────────────────────
      // MapLibre GL JS does NOT have setFog() — that's Mapbox-proprietary.
      // MapLibre v5 uses the setAtmosphere() API for cinematic space effects.
      //
      // Satellite mode: set atmosphere to null so the WebGL canvas remains
      // transparent outside the globe sphere — this lets the StarField canvas
      // (rendered behind the map at z-index:0) show through.
      //
      // Dark tactical mode: use a deep navy atmosphere but with reduced
      // opacity to allow the StarField background to show through.
      if (globeMode && mapStyleMode !== 'satellite') {
        try {
          if (typeof map.setAtmosphere === 'function') {
            map.setAtmosphere({
              "color": "rgba(12, 30, 58, 0.4)",      // Semi-transparent deep navy
              "halo-color": "rgba(0, 13, 31, 0.6)",  // Darker outer halo
              "intensity": 5,                        // Glow intensity
            });
          }
        } catch (e) {
          console.warn("[TacticalMap] setAtmosphere failed:", e);
        }
      } else {
        // Clear atmosphere if not in Dark Globe mode
        if (typeof map.setAtmosphere === 'function') {
          map.setAtmosphere(null);
        }
        // Also ensure any stale sky layers are removed if they somehow exist
        if (map.getLayer(SKY_LAYER_ID)) {
          map.removeLayer(SKY_LAYER_ID);
        }
      }
    };

    // Use persistent listener so sky layer is re-applied whenever the style
    // is reloaded (e.g. switching between dark and satellite basemaps).
    map.on("style.load", sync3D);
    if (map.isStyleLoaded()) {
      // Defer one tick so MapLibre v5 can commit any pending projection
      // changes (e.g. globe) into the style before adding sky layer.
      setTimeout(sync3D, 0);
    }
    return () => {
      map.off("style.load", sync3D);
    };
  }, [mapLoaded, enable3d, mapToken, globeMode, mapStyleMode]);


  const setViewMode = (mode: "2d" | "3d") => {
    const map = mapRef.current?.getMap();
    if (!mapRef.current || !map) return;
    if (mode === "2d") {
      setEnable3d(false);
      // Reset projection to flat mercator (switching back to Mapbox adapter)
      try {
        (map as unknown as { setProjection: (p: unknown) => void }).setProjection(
          mapToken ? "mercator" : { type: "mercator" },
        );
      } catch (_) {
        // Ignore projection errors during rapid state transitions
      }
      mapRef.current.flyTo({
        pitch: 0,
        bearing: 0,
        duration: 1500,
        easing: (t: number) => 1 - Math.pow(1 - t, 3),
      });
    } else {
      setEnable3d(true);
      mapRef.current.flyTo({
        pitch: 50,
        bearing: 0,
        duration: 2000,
        easing: (t: number) => 1 - Math.pow(1 - t, 3),
      });
    }
  };

  const handleAdjustCamera = (type: "pitch" | "bearing", delta: number) => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    if (type === "pitch") {
      const currentPitch = map.getPitch();
      const newPitch = Math.max(0, Math.min(85, currentPitch + delta));
      map.easeTo({ pitch: newPitch, duration: 300 });
    } else if (type === "bearing") {
      const currentBearing = map.getBearing();
      map.easeTo({ bearing: currentBearing + delta, duration: 300 });
    }
  };

  const handleResetCompass = () => {
    mapRef.current?.getMap().easeTo({ bearing: 0, duration: 1000 });
  };

  return { setViewMode, handleAdjustCamera, handleResetCompass };
}

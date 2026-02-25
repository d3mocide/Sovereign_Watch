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
}

export function useMapCamera({
  mapRef,
  mapInstanceRef,
  mapLoaded,
  globeMode,
  enable3d,
  setEnable3d,
  mapToken,
}: UseMapCameraOptions) {
  // Globe projection: Mapbox GL JS uses a string argument; MapLibre GL JS v5 uses { type }.
  // MapLibre v5 also requires the style to be loaded before setProjection can be called.
  useEffect(() => {
    if (!mapLoaded) return;
    const map = mapInstanceRef.current ?? (mapRef.current?.getMap?.() as any);
    if (!map || typeof map.setProjection !== "function") return;

    const applyProjection = () => {
      const isMapbox = !!mapToken;
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

    const add = () => {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: buildGraticule(30) as any,
        });
      }
      if (!map.getLayer(LAYER_ID)) {
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
            "line-color": "rgba(80, 180, 255, 0.45)",
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
      globeMode ? add() : remove();
    };

    if (map.isStyleLoaded?.()) apply();
    else map.once("style.load", apply);

    return () => {
      map.off("style.load", apply);
    };
  }, [globeMode, mapLoaded]);

  // Dedicated 3D visuals Effect
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!mapLoaded || !map) return;

    const sync3D = () => {
      const isMapbox = !!mapToken;

      if (enable3d) {
        // 1. Terrain - Mapbox Only (URL is Mapbox-exclusive)
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

        // 2. Fog - Mapbox GL v2+ Only
        if (isMapbox && map.setFog) {
          try {
            map.setFog({
              range: [0.5, 10],
              color: "rgba(10, 15, 25, 1)",
              "high-color": "rgba(20, 30, 50, 1)",
              "space-color": "rgba(5, 5, 15, 1)",
              "horizon-blend": 0.1,
            });
          } catch (e) {
            console.warn("[TacticalMap] Failed to set fog:", e);
          }
        }
      } else if (globeMode) {
        // Globe mode: apply space/atmosphere fog without terrain
        // MapLibre v5 and Mapbox both support these properties
        if (map.setFog) {
          try {
            map.setFog({
              "space-color": "#000510",
              "star-intensity": 0.55,
              "horizon-blend": 0.15,
              "high-color": "#1a3060",
              color: "#0d1a30",
              range: [0.5, 10],
            });
          } catch (e) {
            console.warn("[TacticalMap] Globe fog not supported:", e);
          }
        }
      } else {
        if (map.getTerrain?.()) map.setTerrain(null);
        if (map.setFog) map.setFog(null);
      }
    };

    if (map.isStyleLoaded()) sync3D();
    else map.on("style.load", sync3D);
    return () => {
      map.off("style.load", sync3D);
    };
  }, [mapLoaded, enable3d, mapToken, globeMode]);

  const setViewMode = (mode: "2d" | "3d") => {
    const map = mapRef.current?.getMap();
    if (!mapRef.current || !map) return;
    if (mode === "2d") {
      setEnable3d(false);
      // Reset projection to flat mercator
      try {
        (map as any).setProjection(
          mapToken ? "mercator" : { type: "mercator" },
        );
      } catch (_) { }
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

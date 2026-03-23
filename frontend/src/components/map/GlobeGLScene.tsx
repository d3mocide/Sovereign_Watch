/**
 * GlobeGLScene – globe.gl (Three.js) sphere with a transparent deck.gl
 * GlobeView canvas layered on top for existing data overlays.
 *
 * Architecture:
 *  • globe.gl (z-index 0): sphere, atmosphere, country polygon fills,
 *    submarine cable paths, satellite trail paths, starfield background.
 *  • deck.gl standalone / GlobeView (z-index 1, transparent): aurora oval,
 *    GDELT events, entity icons, mission area rings, terminator – all fed
 *    from existing layer builders without modification.
 *  • Camera sync: globe.gl OrbitControls 'change' → pointOfView() →
 *    deck.gl viewState update so both canvases always agree.
 *
 * The parent component drives updates imperatively via the ref handle to
 * avoid React re-render overhead in the hot (per-frame) path.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { Deck, _GlobeView as GlobeView } from "@deck.gl/core";
import type { Layer } from "@deck.gl/core";
import type { FeatureCollection, Feature } from "geojson";
import type { CoTEntity } from "../../types";

// ─── Public interface ────────────────────────────────────────────────────────

export interface GlobeGLSceneHandle {
  /** Replace deck.gl layers. Call on every animation frame. */
  updateDeckLayers(layers: Layer[]): void;
  /**
   * Rebuild satellite trails + submarine cable paths on globe.gl.
   * Call periodically (e.g. every 1–2 s) rather than every frame to keep
   * Three.js geometry rebuilds cheap.
   */
  updateGlobePaths(
    satellites: CoTEntity[],
    cables: FeatureCollection | null,
  ): void;
}

interface GlobeGLSceneProps {
  /** GeoJSON FeatureCollection of world country polygons. */
  worldCountriesData: FeatureCollection | null;
  /** Map of ISO-A2 country code → outage properties for cap-colour tinting. */
  countryOutageMap: Record<string, Record<string, unknown>>;
  /** Auto-rotate the globe continuously. Default true. */
  autoRotate?: boolean;
  /** Starting point-of-view. Defaults to { lat:15, lng:0, altitude:2.5 }. */
  initialPOV?: { lat: number; lng: number; altitude: number };
}

// ─── Camera conversion ───────────────────────────────────────────────────────

/**
 * Convert globe.gl pointOfView altitude (globe radii above surface) to a
 * deck.gl GlobeView zoom level.
 *
 * Empirically: altitude 2.5 (default full-globe view) ≈ deck zoom 1.0.
 * Each halving of altitude adds ~1 zoom step.
 *   zoom = log₂(2.5 / altitude) + 1.0
 */
function altitudeToZoom(altitude: number): number {
  const clamped = Math.max(0.01, altitude);
  return Math.max(0.5, Math.min(20, Math.log2(2.5 / clamped) + 1.0));
}

// ─── Component ───────────────────────────────────────────────────────────────

export const GlobeGLScene = forwardRef<GlobeGLSceneHandle, GlobeGLSceneProps>(
  function GlobeGLScene(
    {
      worldCountriesData,
      countryOutageMap,
      autoRotate = true,
      initialPOV = { lat: 15, lng: 0, altitude: 2.5 },
    },
    ref,
  ) {
    // DOM refs
    const globeContainerRef = useRef<HTMLDivElement>(null);
    const deckCanvasRef = useRef<HTMLCanvasElement>(null);

    // Instance refs (never cause re-renders)
    const globeRef = useRef<any>(null);
    const deckRef = useRef<Deck<any[]> | null>(null);

    // ── Imperative handle ─────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      updateDeckLayers(layers) {
        deckRef.current?.setProps({ layers });
      },
      updateGlobePaths(satellites, cables) {
        const g = globeRef.current;
        if (!g) return;

        // ── Satellite trail paths ──────────────────────────────────────
        // Take up to the last 30 track points per satellite.
        const satPaths = satellites
          .filter((s) => s.trail && s.trail.length >= 2)
          .map((s) => ({
            _type: "sat" as const,
            uid: s.uid,
            // Trail points are [lon, lat, alt_m, speed, ts?]
            points: s.trail.slice(-30).map((p) => [p[0], p[1]] as [number, number]),
          }));

        // ── Submarine cable paths ─────────────────────────────────────
        const cablePaths: {
          _type: "cable";
          id: string;
          points: [number, number][];
        }[] = [];
        if (cables?.features) {
          for (const f of cables.features) {
            if (!f.geometry) continue;
            if (f.geometry.type === "LineString") {
              cablePaths.push({
                _type: "cable",
                id: (f.properties?.name as string) || "cable",
                points: f.geometry.coordinates as [number, number][],
              });
            } else if (f.geometry.type === "MultiLineString") {
              f.geometry.coordinates.forEach((seg, i) => {
                cablePaths.push({
                  _type: "cable",
                  id: `${(f.properties?.name as string) || "cable"}_${i}`,
                  points: seg as [number, number][],
                });
              });
            }
          }
        }

        const allPaths = [...cablePaths, ...satPaths];
        if (allPaths.length === 0) return;

        g.pathsData(allPaths)
          .pathPoints((d: { points: [number, number][] }) => d.points)
          .pathPointLat((p: [number, number]) => p[1])
          .pathPointLng((p: [number, number]) => p[0])
          .pathPointAlt(() => 0.004)
          .pathColor((d: { _type: string }) =>
            d._type === "sat"
              ? ["rgba(180,100,255,0.85)", "rgba(180,100,255,0)"]
              : "rgba(0,200,255,0.3)",
          )
          .pathStroke((d: { _type: string }) => (d._type === "sat" ? 0.8 : 0.4))
          .pathDashLength(0.08)
          .pathDashGap(0.03)
          .pathDashAnimateTime(4000);
      },
    }));

    // ── Initialize deck.gl standalone ─────────────────────────────────────
    useEffect(() => {
      const canvas = deckCanvasRef.current;
      if (!canvas) return;

      // Cast DeckProps as any to sidestep the ViewStateMap<View[]> vs flat
      // GlobeViewState TypeScript inference battle in deck.gl v9 generics.
      const deckProps = {
        canvas,
        views: [new GlobeView({ id: "globe" })],
        initialViewState: {
          globe: {
            longitude: initialPOV.lng,
            latitude: initialPOV.lat,
            zoom: altitudeToZoom(initialPOV.altitude),
          },
        },
        controller: false,
        layers: [],
        useDevicePixels: true,
      };
      const deck = new Deck(deckProps as any);
      deckRef.current = deck as unknown as Deck<any[]>;

      return () => {
        deck.finalize();
        deckRef.current = null;
      };
      // Only runs once on mount — initialPOV is intentionally not re-reactive.
    }, []);

    // ── Initialize globe.gl ───────────────────────────────────────────────
    useEffect(() => {
      const container = globeContainerRef.current;
      if (!container) return;

      let cancelled = false;

      // Dynamic import keeps Three.js out of the main bundle until needed.
      import("globe.gl").then(({ default: Globe }) => {
        if (cancelled || !globeContainerRef.current) return;

        const globe = new Globe(globeContainerRef.current, {
          rendererConfig: { antialias: true, alpha: false },
        });

        globe
          .globeImageUrl(
            "//unpkg.com/three-globe/example/img/earth-night.jpg",
          )
          .backgroundImageUrl(
            "//unpkg.com/three-globe/example/img/night-sky.png",
          )
          .atmosphereColor("lightskyblue")
          .atmosphereAltitude(0.15)
          // Country fills (data set later via effect)
          .polygonsData([])
          .polygonCapColor(() => "rgba(30,30,60,0.38)")
          .polygonSideColor(() => "rgba(0,0,0,0)")
          .polygonStrokeColor(() => "#22224a")
          .polygonAltitude(0.001)
          // Paths (satellite trails + cables, driven via imperative handle)
          .pathsData([])
          // Initial point of view (no transition animation)
          .pointOfView(initialPOV);

        const controls = globe.controls();
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        if (autoRotate) {
          controls.autoRotate = true;
          controls.autoRotateSpeed = 0.4;
        }

        // Camera sync: globe.gl camera → deck.gl viewState
        const onCameraChange = () => {
          if (!deckRef.current) return;
          const pov: { lat: number; lng: number; altitude: number } =
            globe.pointOfView();
          deckRef.current.setProps({
            viewState: {
              globe: {
                longitude: pov.lng,
                latitude: pov.lat,
                zoom: altitudeToZoom(pov.altitude),
              },
            },
          } as any);
        };
        controls.addEventListener("change", onCameraChange);

        globeRef.current = globe;

        return () => {
          controls.removeEventListener("change", onCameraChange);
        };
      });

      return () => {
        cancelled = true;
        // globe.gl doesn't expose a dispose method; clear the container.
        if (globeContainerRef.current) {
          globeContainerRef.current.innerHTML = "";
        }
        globeRef.current = null;
      };
    }, []);

    // ── Update globe.gl auto-rotate when prop changes ─────────────────────
    useEffect(() => {
      const g = globeRef.current;
      if (!g) return;
      g.controls().autoRotate = autoRotate;
    }, [autoRotate]);

    // ── Update country polygon fills ──────────────────────────────────────
    useEffect(() => {
      const g = globeRef.current;
      if (!g || !worldCountriesData) return;

      g.polygonsData(worldCountriesData.features).polygonCapColor(
        (feat: Feature) => {
          const code =
            (feat.properties?.iso_a2 as string) ||
            (feat.properties?.ISO_A2 as string) ||
            "";
          const outage = countryOutageMap[code];
          if (outage) {
            const severity = (outage.severity as number) ?? 0;
            const r = Math.min(255, 40 + severity * 55);
            return `rgba(${r},15,15,0.5)`;
          }
          return "rgba(30,30,60,0.38)";
        },
      );
    }, [worldCountriesData, countryOutageMap]);

    // ── Resize globe.gl renderer when container resizes ───────────────────
    useEffect(() => {
      const container = globeContainerRef.current;
      if (!container) return;
      const ro = new ResizeObserver(() => {
        const g = globeRef.current;
        if (!g) return;
        g.width(container.offsetWidth).height(container.offsetHeight);
      });
      ro.observe(container);
      return () => ro.disconnect();
    }, []);

    // ── Render ────────────────────────────────────────────────────────────
    return (
      <div className="w-full h-full bg-black relative overflow-hidden">
        {/* globe.gl Three.js canvas – fills the container */}
        <div ref={globeContainerRef} className="absolute inset-0" />

        {/* deck.gl overlay – transparent, receives no pointer events so
            globe.gl OrbitControls stay in control of pan / zoom / click. */}
        <canvas
          ref={deckCanvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: "none", zIndex: 1 }}
        />
      </div>
    );
  },
);

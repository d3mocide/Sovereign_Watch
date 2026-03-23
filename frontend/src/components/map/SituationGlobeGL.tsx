/**
 * SituationGlobeGL – drop-in replacement for SituationGlobe using the
 * globe.gl + Three.js backend (GlobeGLScene) instead of MapLibre GL.
 *
 * Same external props interface as SituationGlobe so callers can switch
 * between implementations with a one-line change.
 *
 * Compared to the MapLibre-based SituationGlobe:
 *  • Atmosphere glow rendered via Three.js shader (globe.gl built-in)
 *  • Satellite trail paths rendered on the Three.js sphere surface
 *  • Submarine cables rendered as globe.gl pathsData (no tile-fetch overhead)
 *  • Country fills driven by GeoJSON polygon data (same outage tinting)
 *  • Aurora, GDELT, mission rings still rendered via deck.gl GlobeView overlay
 *  • Auto-rotation handled by Three.js OrbitControls (smoother inertia)
 */

import type { FeatureCollection } from "geojson";
import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { buildAOTLayers } from "../../layers/buildAOTLayers";
import { buildAuroraLayer } from "../../layers/buildAuroraLayer";
import { buildGdeltLayer } from "../../layers/buildGdeltLayer";
import { buildInfraLayers } from "../../layers/buildInfraLayers";
import { getOrbitalLayers } from "../../layers/OrbitalLayer";
import type { CoTEntity, DRState } from "../../types";
import { interpolatePVB } from "../../utils/interpolation";
import { getTerminatorLayer } from "./TerminatorLayer";
import { GlobeGLScene, type GlobeGLSceneHandle } from "./GlobeGLScene";

// ─── Props (identical to SituationGlobe) ────────────────────────────────────

interface SituationGlobeGLProps {
  satellitesRef: React.MutableRefObject<Map<string, CoTEntity>>;
  cablesData: FeatureCollection | null;
  stationsData: FeatureCollection | null;
  outagesData: FeatureCollection | null;
  worldCountriesData: FeatureCollection | null;
  showTerminator: boolean;
  drStateRef: React.MutableRefObject<Map<string, DRState>>;
  mission: { lat: number; lon: number; radius_nm: number } | null;
  onGdeltClick?: (event: unknown) => void;
  onHover?: (
    entity: unknown | null,
    pos: { x: number; y: number } | null,
  ) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const SituationGlobeGL: React.FC<SituationGlobeGLProps> = ({
  satellitesRef,
  cablesData,
  stationsData,
  outagesData,
  worldCountriesData,
  showTerminator,
  drStateRef,
  mission,
  onGdeltClick,
  onHover,
}) => {
  const sceneRef = useRef<GlobeGLSceneHandle>(null);

  // Interpolation visual state (same as SituationGlobe)
  const visualStateRef = useRef<
    Map<string, { lat: number; lon: number; alt: number }>
  >(new Map());

  // Remote data feeds
  const [auroraData, setAuroraData] = useState<any>(null);
  const [gdeltData, setGdeltData] = useState<any>(null);

  // Throttle globe path updates – paths rebuild Three.js geometry, so limit
  // to once every 2 s rather than every animation frame.
  const lastPathUpdateRef = useRef(0);

  // ── Country outage map (derived from outagesData) ─────────────────────
  const countryOutageMap = useMemo(() => {
    if (!outagesData?.features) return {} as Record<string, Record<string, unknown>>;
    const map: Record<string, Record<string, unknown>> = {};
    for (const f of outagesData.features) {
      const props = f.properties as Record<string, unknown> | null;
      const code = props?.country_code as string | undefined;
      if (!code) continue;
      const cur = map[code];
      if (!cur || ((props?.severity as number) || 0) > ((cur.severity as number) || 0)) {
        map[code] = props ?? {};
      }
    }
    return map;
  }, [outagesData]);

  // ── Aurora polling ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const fetch_ = async () => {
      try {
        const r = await fetch("/api/space-weather/aurora");
        if (r.ok && !cancelled) setAuroraData(await r.json());
      } catch {
        /* silent */
      }
    };
    fetch_();
    const id = setInterval(fetch_, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ── GDELT polling ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const fetch_ = async () => {
      try {
        const r = await fetch("/api/gdelt/events");
        if (r.ok && !cancelled) setGdeltData(await r.json());
      } catch {
        /* silent */
      }
    };
    fetch_();
    const id = setInterval(fetch_, 15 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Stable callback refs so the RAF loop closure doesn't go stale
  const onHoverRef = useRef(onHover);
  useEffect(() => { onHoverRef.current = onHover; }, [onHover]);
  const onGdeltClickRef = useRef(onGdeltClick);
  useEffect(() => { onGdeltClickRef.current = onGdeltClick; }, [onGdeltClick]);

  // Keep copies of the latest data that are safe to read in the RAF closure
  const auroraRef = useRef<any>(null);
  useEffect(() => { auroraRef.current = auroraData; }, [auroraData]);
  const gdeltRef = useRef<any>(null);
  useEffect(() => { gdeltRef.current = gdeltData; }, [gdeltData]);

  const showTerminatorRef = useRef(showTerminator);
  useEffect(() => { showTerminatorRef.current = showTerminator; }, [showTerminator]);

  const missionRef = useRef(mission);
  useEffect(() => { missionRef.current = mission; }, [mission]);

  const cablesRef = useRef(cablesData);
  useEffect(() => { cablesRef.current = cablesData; }, [cablesData]);

  const stationsRef = useRef(stationsData);
  useEffect(() => { stationsRef.current = stationsData; }, [stationsData]);

  const outagesRef = useRef(outagesData);
  useEffect(() => { outagesRef.current = outagesData; }, [outagesData]);

  const worldRef = useRef(worldCountriesData);
  useEffect(() => { worldRef.current = worldCountriesData; }, [worldCountriesData]);

  const countryOutageMapRef = useRef(countryOutageMap);
  useEffect(() => { countryOutageMapRef.current = countryOutageMap; }, [countryOutageMap]);

  // ── Animation loop ────────────────────────────────────────────────────
  const lastFrameRef = useRef(0);

  const animate = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const now = Date.now();
    const dt = now - (lastFrameRef.current || now);
    lastFrameRef.current = now;

    // 1. Interpolate ISR/Intel satellite positions
    const filteredSats: CoTEntity[] = [];
    satellitesRef.current.forEach((sat, uid) => {
      const cat = ((sat.detail?.category as string) || "").toLowerCase();
      const isIntel =
        cat.includes("intel") ||
        cat.includes("surveillance") ||
        cat.includes("military") ||
        cat.includes("isr");
      if (!isIntel) return;

      const dr = drStateRef.current.get(uid);
      const visual = visualStateRef.current.get(uid);
      const { visual: nextVisual, interpolatedEntity } = interpolatePVB(
        sat,
        dr,
        visual,
        now,
        dt,
      );
      visualStateRef.current.set(uid, nextVisual);
      filteredSats.push(interpolatedEntity);
    });

    // 2. Build deck.gl overlay layers
    const infraLayers = buildInfraLayers(
      cablesRef.current,
      stationsRef.current,
      outagesRef.current,
      {
        showCables: false, // cables are on globe.gl, not deck.gl
        showLandingStations: false,
        showOutages: true,
        cableOpacity: 0,
      },
      () => {},
      () => {},
      null,
      true,
      worldRef.current,
      countryOutageMapRef.current,
    );

    const orbitalLayers = getOrbitalLayers({
      satellites: filteredSats,
      selectedEntity: null,
      hoveredEntity: null,
      now,
      showHistoryTails: false,
      projectionMode: "globe",
      zoom: 1.5,
      onEntitySelect: () => {},
      onHover: () => {},
    });

    const missionLayers = buildAOTLayers(
      null,
      undefined,
      true,
      null,
      missionRef.current
        ? {
            lat: missionRef.current.lat,
            lon: missionRef.current.lon,
            radiusKm: missionRef.current.radius_nm * 1.852,
          }
        : null,
    );

    const deckLayers = [
      getTerminatorLayer(!!showTerminatorRef.current),
      ...buildAuroraLayer(auroraRef.current, true, true, now),
      ...infraLayers,
      ...buildGdeltLayer(
        gdeltRef.current,
        true,
        true,
        -2,
        true,
        onHoverRef.current ?? (() => {}),
        onGdeltClickRef.current,
      ),
      ...missionLayers,
      ...orbitalLayers,
    ];

    scene.updateDeckLayers(deckLayers);

    // 3. Update globe.gl paths every 2 s (geometry rebuild throttle)
    if (now - lastPathUpdateRef.current > 2000) {
      lastPathUpdateRef.current = now;
      scene.updateGlobePaths(filteredSats, cablesRef.current);
    }
  }, [satellitesRef, drStateRef]);

  // Run the animation loop
  useEffect(() => {
    let raf: number;
    const loop = () => {
      animate();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [animate]);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full bg-black relative overflow-hidden">
      <Suspense
        fallback={
          <div className="flex items-center justify-center w-full h-full text-[10px] text-white/20 uppercase tracking-widest">
            Initialising Global View...
          </div>
        }
      >
        <GlobeGLScene
          ref={sceneRef}
          worldCountriesData={worldCountriesData}
          countryOutageMap={countryOutageMap}
          autoRotate={true}
        />
      </Suspense>
      <div className="absolute top-2 right-2 text-[8px] text-purple-400/50 bg-black/70 px-1.5 py-0.5 rounded tracking-widest pointer-events-none select-none border border-purple-500/20">
        GLOBAL SITUATION
      </div>
    </div>
  );
};

import { MapboxOverlay } from "@deck.gl/mapbox";
import type { FeatureCollection } from "geojson";
import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { MapRef } from "react-map-gl/maplibre";
import { buildAOTLayers } from "../../layers/buildAOTLayers";
import { buildAuroraLayer } from "../../layers/buildAuroraLayer";
import { buildCountryHeatLayer, type ActorEntry } from "../../layers/buildCountryHeatLayer";
import { buildGdeltLayer } from "../../layers/buildGdeltLayer";
import { buildInfraLayers } from "../../layers/buildInfraLayers";
import { LayerCache } from "../../layers/layerCache";
import { getOrbitalLayers } from "../../layers/OrbitalLayer";
import { CoTEntity, DRState } from "../../types";
import { interpolatePVB } from "../../utils/interpolation";
import MapLibreAdapter from "./MapLibreAdapter";
import { StarField } from "./StarField";
import { getTerminatorLayer } from "./TerminatorLayer";

interface SituationGlobeProps {
  satellitesRef: React.MutableRefObject<Map<string, CoTEntity>>;
  cablesData: FeatureCollection | null;
  stationsData: FeatureCollection | null;
  outagesData: FeatureCollection | null;
  worldCountriesData: FeatureCollection | null;
  showTerminator: boolean;
  drStateRef: React.MutableRefObject<Map<string, DRState>>;
  mission: { lat: number; lon: number; radius_nm: number } | null;
  onGdeltClick?: (event: any) => void;
  onHover?: (entity: any | null, pos: { x: number; y: number } | null) => void;
  /** PeeringDB Internet Exchange Points GeoJSON (Initiative B) */
  ixpData?: FeatureCollection | null;
  /** PeeringDB Data Center Facilities GeoJSON (Initiative B) */
  facilityData?: FeatureCollection | null;
  /** DNS root server health records (Infra-06) */
  dnsRootData?: import("../../types").DnsRootServer[];
  /** Cloudflare CDN edge PoP records (Infra-07) */
  
}

const DARK_MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export const SituationGlobe: React.FC<SituationGlobeProps> = ({
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
  ixpData,
  facilityData,
  dnsRootData,
}) => {
  const GLOBE_ROTATION_DEG_PER_60FPS_FRAME = 0.01;

  // Keep a mutable ref for the longitude for smooth, jitter-free spin
  const lngRef = useRef(0);
  const mapRef = useRef<MapRef>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);

  // Per-overlay layer memoization. Without this, the layer groups below get
  // rebuilt with brand-new accessor closures on every rAF tick (the effect
  // is keyed on `now`, which updates 60x/sec from the auto-rotation loop),
  // forcing deck.gl to regenerate and re-upload GPU attribute buffers for
  // infra/aurora/country-heat/terminator/gdelt every single frame instead of
  // only when their actual inputs change. Same pattern as useAnimationLoop.ts.
  const layerCacheRef = useRef<LayerCache | null>(null);
  if (!layerCacheRef.current) layerCacheRef.current = new LayerCache();

  const [viewState, setViewState] = useState({
    latitude: 15,
    longitude: 0,
    zoom: 2,
    pitch: 0,
    bearing: 0,
  });

  const [now, setNow] = useState(0);
  const lastFrameTimeRef = useRef(0);
  const visualStateRef = useRef<
    Map<string, { lat: number; lon: number; alt: number }>
  >(new Map());
  const [auroraData, setAuroraData] = useState<any>(null);
  const [gdeltData, setGdeltData] = useState<any>(null);
  const [actors, setActors] = useState<ActorEntry[]>([]);

  // Poll for aurora data
  useEffect(() => {
    let cancelled = false;
    const fetchAurora = async () => {
      try {
        const r = await fetch("/api/space-weather/aurora");
        if (r.ok && !cancelled) setAuroraData(await r.json());
      } catch {
        /* silent fail */
      }
    };
    fetchAurora();
    const id = setInterval(fetchAurora, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Poll GDELT conflict + tension events (tone ≤ -2) for the globe overlay
  useEffect(() => {
    let cancelled = false;
    const fetchActors = async () => {
      try {
        const r = await fetch("/api/gdelt/actors?limit=40&hours=24");
        if (r.ok && !cancelled) {
          const data = await r.json();
          if (Array.isArray(data)) setActors(data);
        }
      } catch { /* silent fail */ }
    };
    fetchActors();
    const id = setInterval(fetchActors, 5 * 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Poll GDELT conflict + tension events (tone ≤ -2) for the globe overlay
  useEffect(() => {
    let cancelled = false;
    const fetchGdelt = async () => {
      try {
        const r = await fetch("/api/gdelt/events");
        if (r.ok && !cancelled) setGdeltData(await r.json());
      } catch {
        /* silent fail */
      }
    };
    fetchGdelt();
    // 5 min matches the server-side cache TTL, so a cold-started backend
    // (empty first response) recovers within one cache window.
    const id = setInterval(fetchGdelt, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Auto-rotation logic
  useEffect(() => {
    let raf: number;
    lastFrameTimeRef.current = Date.now();

    const rotate = () => {
      const currentTime = Date.now();
      const dt = currentTime - lastFrameTimeRef.current;

      // Update longitude imperatively for 0-jitter rotation
      const map = mapRef.current?.getMap();
      if (map) {
        lngRef.current =
          (lngRef.current + GLOBE_ROTATION_DEG_PER_60FPS_FRAME * (dt / 16.67)) %
          360;
        map.jumpTo({
          center: [lngRef.current, viewState.latitude],
        });
      }

      setNow(currentTime);
      raf = requestAnimationFrame(rotate);
    };
    raf = requestAnimationFrame(rotate);
    return () => cancelAnimationFrame(raf);
  }, []);

  const countryOutageMap = useMemo(() => {
    if (!outagesData || !outagesData.features) return {};
    const map: Record<string, Record<string, unknown>> = {};
    outagesData.features.forEach((f) => {
      const props = f.properties as Record<string, unknown> | null;
      const countryCode = props?.country_code as string | undefined;
      if (countryCode) {
        const current = map[countryCode];
        if (
          !current ||
          ((props?.severity as number) || 0) >
            ((current.severity as number) || 0)
        ) {
          map[countryCode] = props ?? {};
        }
      }
    });
    return map;
  }, [outagesData]);

  // Imperative Layer Update to avoid reading refs in render
  useEffect(() => {
    if (now === 0 || !overlayRef.current) return;
    const cache = layerCacheRef.current!;

    const dt = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;

    // Pulse-driven layers tick at 10Hz instead of every frame (matches the
    // pulseNow convention in layers/composition.ts) so they stay cache hits
    // for ~6 consecutive frames instead of recomputing color attributes at 60fps.
    const pulseNow = now - (now % 100);

    // 1. Interpolate Satellites for smooth motion on the globe.
    // Positions genuinely change every frame, so this (and the orbital
    // layers it feeds) intentionally stays outside the layer cache.
    const filteredSats: CoTEntity[] = [];
    satellitesRef.current.forEach((sat, uid) => {
      // Filter for Intel/Surveillance assets specifically as requested
      const cat = (sat.detail?.category as string)?.toLowerCase() || "";
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

    // 2. Build Infrastructure Layers — cached; cables/stations/outages/country
    // data change on a second-to-minute cadence, not every frame.
    const infra = cache.get(
      "infra",
      [cablesData, stationsData, outagesData, worldCountriesData, countryOutageMap, ixpData, facilityData, dnsRootData],
      () => {
        const built = buildInfraLayers(
          cablesData,
          stationsData,
          outagesData,
          {
            showCables: true,
            showLandingStations: false,
            showOutages: false,  // replaced by GDELT conflict zones as primary geographic layer
            showIXPs: false,     // too dense alongside conflict dots
            showFacilities: false,
            cableOpacity: 0.35,  // subtle — cables as background geography only
          },
          () => {}, // No-op hover
          () => {}, // No-op click
          null,
          true, // globeMode
          worldCountriesData,
          countryOutageMap,
          ixpData ?? null,
          facilityData ?? null,
          dnsRootData ?? [],
        );
        return [...built.outages, ...built.assets];
      },
    );

    // 3. Build Orbital Layers — intentionally uncached; satellite positions
    // animate continuously.
    const orbital = getOrbitalLayers({
      satellites: filteredSats,
      selectedEntity: null,
      hoveredEntity: null,
      now,
      showHistoryTails: false,
      projectionMode: "globe",
      zoom: viewState.zoom,
      onEntitySelect: () => {},
      onHover: () => {},
    });

    // 4. Build Mission Area / AO Ring — cached on mission
    const missionLayers = cache.get(
      "aot",
      [mission],
      () =>
        buildAOTLayers(
          null,
          { showRepeaters: true } as any,
          true, // globeMode
          null, // observer
          mission
            ? {
                lat: mission.lat,
                lon: mission.lon,
                radiusKm: mission.radius_nm * 1.852,
              }
            : null,
        ),
    );

    overlayRef.current.setProps({
      layers: [
        ...cache.get("aurora", [auroraData, pulseNow], () =>
          buildAuroraLayer(auroraData, true, true, pulseNow),
        ),
        // Country conflict heat — fills countries by GDELT threat level (below cables/dots)
        ...cache.get("country-heat", [worldCountriesData, actors], () =>
          buildCountryHeatLayer(worldCountriesData as any, actors, true, true, 0),
        ),
        // Night-side overlay — rendered after country heat so the shadow tints over it;
        // globe mode depth-tests against the globe mask so the far-side night
        // hemisphere doesn't bleed through the planet.
        // Terminator geometry only changes once per minute.
        ...cache.get("terminator", [showTerminator, Math.floor(now / 60_000)], () => [
          getTerminatorLayer(!!showTerminator, true),
        ]),
        ...infra,
        // GDELT conflict + tension only (tone ≤ -2) — same as OrbitalMap
        ...cache.get("gdelt", [gdeltData, onHover, onGdeltClick], () =>
          buildGdeltLayer(
            gdeltData,
            true,
            true,
            -2,
            true,
            onHover || (() => {}),
            onGdeltClick,
          ),
        ),
        ...missionLayers,
        ...orbital,
      ],
    });
  }, [
    now,
    satellitesRef,
    drStateRef,
    cablesData,
    stationsData,
    outagesData,
    worldCountriesData,
    countryOutageMap,
    ixpData,
    facilityData,
    dnsRootData,
    viewState.zoom,
    showTerminator,
    mission,
    auroraData,
    gdeltData,
    actors,
    onHover,
    onGdeltClick,
  ]);

  return (
    <div className="w-full h-full bg-black relative overflow-hidden">
      <StarField active={true} contained={true} />
      <div className="relative z-[1] w-full h-full">
        <Suspense
          fallback={
            <div className="flex items-center justify-center w-full h-full text-[10px] text-white/20 uppercase tracking-widest">
              Initialising Global View...
            </div>
          }
        >
          <MapLibreAdapter
            ref={mapRef}
            viewState={viewState}
            onMove={(evt: any) => {
              const next = evt.viewState;
              if (!next) return;
              lngRef.current = next.longitude;
              setViewState((prev) => ({
                latitude: next.latitude ?? prev.latitude,
                longitude: next.longitude ?? prev.longitude,
                zoom: next.zoom ?? prev.zoom,
                pitch: next.pitch ?? prev.pitch,
                bearing: next.bearing ?? prev.bearing,
              }));
            }}
            onLoad={(evt: any) => {
              const map = evt.target;
              const style = map.getStyle();
              if (style && style.layers) {
                style.layers.forEach((layer: any) => {
                  if (
                    layer.type === "symbol" ||
                    layer.id.includes("label") ||
                    layer.id.includes("place")
                  ) {
                    if (map.getLayer(layer.id)) {
                      map.removeLayer(layer.id);
                    }
                  }
                });
              }
            }}
            mapStyle={DARK_MAP_STYLE}
            style={{ width: "100%", height: "100%" }}
            globeMode={true}
            showAttribution={false}
            deckProps={{
              id: "situation-globe-overlay",
              onOverlayLoaded: (ov) => {
                overlayRef.current = ov;
              },
            }}
          />
        </Suspense>
      </div>
      <div className="absolute top-2 right-2 text-[8px] text-purple-400/50 bg-black/70 px-1.5 py-0.5 rounded tracking-widest pointer-events-none select-none border border-purple-500/20">
        GLOBAL SITUATION
      </div>
    </div>
  );
};

import { MapboxOverlay } from "@deck.gl/mapbox";
import type { FeatureCollection } from "geojson";
import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { MapRef } from "react-map-gl/maplibre";
import { buildAOTLayers } from "../../layers/buildAOTLayers";
import { buildAuroraLayer } from "../../layers/buildAuroraLayer";
import { buildGdeltLayer } from "../../layers/buildGdeltLayer";
import { buildInfraLayers } from "../../layers/buildInfraLayers";
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
}) => {
  const mapRef = useRef<MapRef>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);

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
    const fetchGdelt = async () => {
      try {
        const r = await fetch("/api/gdelt/events");
        if (r.ok && !cancelled) setGdeltData(await r.json());
      } catch {
        /* silent fail */
      }
    };
    fetchGdelt();
    const id = setInterval(fetchGdelt, 15 * 60_000);
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
      setViewState((prev) => ({
        ...prev,
        longitude: (prev.longitude + 0.08) % 360,
      }));
      setNow(Date.now());
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

    const dt = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;

    // 1. Interpolate Satellites for smooth motion on the globe
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

    // 2. Build Infrastructure Layers
    const infra = buildInfraLayers(
      cablesData,
      stationsData,
      outagesData,
      {
        showCables: true,
        showLandingStations: false,
        showOutages: true,
        cableOpacity: 0.5,
      },
      () => {}, // No-op hover
      () => {}, // No-op click
      null,
      true, // globeMode
      worldCountriesData,
      countryOutageMap,
    );

    // 3. Build Orbital Layers
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

    // 4. Build Mission Area / AO Ring
    const missionLayers = buildAOTLayers(
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
    );

    overlayRef.current.setProps({
      layers: [
        getTerminatorLayer(!!showTerminator),
        ...buildAuroraLayer(auroraData, true, true, now),
        ...infra,
        // GDELT conflict + tension only (tone ≤ -2) — same as OrbitalMap
        ...buildGdeltLayer(
          gdeltData,
          true,
          true,
          -2,
          true,
          onHover || (() => {}),
          onGdeltClick,
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
    viewState.zoom,
    showTerminator,
    mission,
    auroraData,
    gdeltData,
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
            onMove={(evt: unknown) => {
              const next = (evt as { viewState?: Partial<typeof viewState> })
                .viewState;
              if (!next) return;
              setViewState((prev) => ({
                latitude: next.latitude ?? prev.latitude,
                longitude: next.longitude ?? prev.longitude,
                zoom: next.zoom ?? prev.zoom,
                pitch: next.pitch ?? prev.pitch,
                bearing: next.bearing ?? prev.bearing,
              }));
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

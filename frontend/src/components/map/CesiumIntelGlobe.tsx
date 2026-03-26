/**
 * CesiumIntelGlobe — CesiumJS-based OSINT Globe View
 *
 * Drop-in replacement for IntelGlobe.tsx using CesiumJS native globe
 * instead of deck.gl _GlobeView (experimental).  Same props interface —
 * swap the import in App.tsx to test.
 *
 * Layers:
 *   1. Base tiles via UrlTemplateImageryProvider (CartoDB dark / satellite / etc.)
 *   2. Country heat overlay (GeoJsonDataSource, threat-tinted fills, pulsing)
 *   3. GDELT event dots (PointPrimitiveCollection, tone-coloured)
 *   4. Conflict arc projections (Entity polylines, geodesic-sampled, pulsing)
 */
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useEffect, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
import {
  Viewer,
  Ion,
  UrlTemplateImageryProvider,
  Cartesian3,
  Cartographic,
  Color,
  CallbackProperty,
  ColorMaterialProperty,
  ArcType,
  PointPrimitiveCollection,
  EllipsoidGeodesic,
  GeoJsonDataSource,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Math as CesiumMath,
  JulianDate,
  defined,
} from "cesium";
import type { CoTEntity } from "../../types";
import { type ActorEntry } from "../../layers/buildCountryHeatLayer";
import { buildArcData, getCentroidsCache, type GdeltArc } from "../../layers/buildGdeltArcLayer";
import { type MapStyleKey } from "./intelMapStyles";

// Suppress Ion token warning — we use only our own tile endpoints
Ion.defaultAccessToken = "";

const SPIN_DEG_PER_SEC = 3;
const SPIN_RESUME_DELAY_MS = 1000;
const ARC_STEPS = 48; // geodesic sample count per arc
const ARC_MAX_HEIGHT_M = 500_000; // parabolic peak height in metres

/** URLs for map style tiles, mirroring intelMapStyles.ts */
function tileUrlForStyle(style: MapStyleKey): string | null {
  switch (style) {
    case "satellite":
      return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
    case "positron":
      return "https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png";
    case "toner":
      return "https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}.png";
    case "debug":
      return null;
    default:
      return "https://basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png";
  }
}

/** Sample a parabolic great-circle arc as Cartesian3 positions. */
function buildArcPositions(
  srcLon: number,
  srcLat: number,
  tgtLon: number,
  tgtLat: number,
): Cartesian3[] {
  const start = Cartographic.fromDegrees(srcLon, srcLat);
  const end = Cartographic.fromDegrees(tgtLon, tgtLat);
  const geodesic = new EllipsoidGeodesic(start, end);
  const dist = geodesic.surfaceDistance;
  const positions: Cartesian3[] = [];
  for (let i = 0; i <= ARC_STEPS; i++) {
    const t = i / ARC_STEPS;
    const pt = geodesic.interpolateUsingSurfaceDistance(t * dist);
    const h = ARC_MAX_HEIGHT_M * 4 * t * (1 - t); // parabola peaks at midpoint
    positions.push(Cartesian3.fromRadians(pt.longitude, pt.latitude, h));
  }
  return positions;
}

/** Map threat level to Cesium fill Color with animated alpha. */
function threatFillColor(level: string, pulse: number): Color {
  const a = (55 + 25 * pulse) / 255;
  switch (level) {
    case "CRITICAL":
      return new Color(239 / 255, 68 / 255, 68 / 255, a + 0.08);
    case "ELEVATED":
      return new Color(245 / 255, 158 / 255, 11 / 255, a);
    case "MONITORING":
      return new Color(234 / 255, 179 / 255, 8 / 255, a * 0.7);
    default:
      return Color.TRANSPARENT.clone();
  }
}

/** Match an actor name/code to a Cesium GeoJSON entity using NAME / ISO_A2 / ADM0_A3. */
function matchActorToEntity(actor: string, entity: { properties?: unknown }): boolean {
  if (!entity.properties) return false;
  const now = JulianDate.now();
  const props = entity.properties as Record<string, { getValue: (t: JulianDate) => unknown }>;
  const norm = actor.toLowerCase().trim();
  const get = (key: string) => ((props[key]?.getValue(now) as string) || "").toLowerCase();
  return (
    get("ISO_A2") === norm ||
    get("ADM0_A3") === norm ||
    get("NAME") === norm ||
    get("NAME_EN") === norm
  );
}

export interface IntelGlobeProps {
  gdeltData: FeatureCollection | null;
  worldCountriesData: FeatureCollection | null;
  onEntitySelect: (entity: CoTEntity | null) => void;
  mapStyle?: MapStyleKey;
  spin?: boolean;
}

export function CesiumIntelGlobe({
  gdeltData,
  worldCountriesData,
  onEntitySelect,
  mapStyle = "dark",
  spin = false,
}: IntelGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const animTickRef = useRef(0);
  const spinRef = useRef(spin);
  spinRef.current = spin;
  const lastInteractionRef = useRef(0);

  // Internal actor state (fetched every 5 min, same as IntelGlobe)
  const [actors, setActors] = useState<ActorEntry[]>([]);

  // Refs for Cesium objects that need replacing on data change
  const countryDsRef = useRef<GeoJsonDataSource | null>(null);
  const pointCollRef = useRef<PointPrimitiveCollection | null>(null);
  const arcEntityIdsRef = useRef<string[]>([]);
  const imageryLayerIndexRef = useRef<number>(0);

  // ── Fetch actors ────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchActors = async () => {
      try {
        const res = await fetch("/api/gdelt/actors?limit=40&hours=24");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setActors(data);
        }
      } catch {
        /* silently ignore */
      }
    };
    fetchActors();
    const id = setInterval(fetchActors, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // ── Init Viewer (once) ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const viewer = new Viewer(containerRef.current, {
      baseLayer: false, // we add our own imagery below
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      creditContainer: (() => {
        const el = document.createElement("div");
        el.style.display = "none";
        return el;
      })(),
    });

    // Dark scene background
    viewer.scene.backgroundColor = Color.fromCssColorString("#0a0a0a");
    viewer.scene.globe.baseColor = Color.fromCssColorString("#111827");

    // Initial camera position (centered on Africa/Europe)
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(15, 20, 22_000_000),
    });

    // Add initial base imagery
    const url = tileUrlForStyle("dark");
    if (url) {
      const layer = viewer.imageryLayers.addImageryProvider(
        new UrlTemplateImageryProvider({ url, maximumLevel: 19 }),
      );
      imageryLayerIndexRef.current = viewer.imageryLayers.indexOf(layer);
    }

    // Pause spin on any user interaction
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    const markInteraction = () => {
      lastInteractionRef.current = performance.now();
    };
    handler.setInputAction(markInteraction, ScreenSpaceEventType.LEFT_DOWN);
    handler.setInputAction(markInteraction, ScreenSpaceEventType.RIGHT_DOWN);
    handler.setInputAction(markInteraction, ScreenSpaceEventType.MIDDLE_DOWN);
    handler.setInputAction(markInteraction, ScreenSpaceEventType.WHEEL);
    handler.setInputAction(markInteraction, ScreenSpaceEventType.PINCH_START);

    // Click handler for GDELT point selection
    handler.setInputAction((event: { position: { x: number; y: number } }) => {
      const picked = viewer.scene.pick(event.position as unknown as Cartesian3);
      if (defined(picked) && picked.id && typeof picked.id === "object") {
        const pt = picked.id as {
          event_id?: string;
          name?: string;
          lat?: number;
          lon?: number;
        };
        if (pt.event_id) {
          onEntitySelect({
            uid: `gdelt-${pt.event_id}`,
            type: "gdelt",
            callsign: pt.name ?? "",
            lat: pt.lat ?? 0,
            lon: pt.lon ?? 0,
            altitude: 0,
            course: 0,
            speed: 0,
            lastSeen: Date.now(),
            trail: [],
            uidHash: 0,
            detail: pt as unknown as Record<string, unknown>,
          } as CoTEntity);
        }
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    viewerRef.current = viewer;

    return () => {
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  // ── RAF loop: spin + animTick ────────────────────────────────────────────────
  useEffect(() => {
    let last = performance.now();
    let raf: number;

    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;

      animTickRef.current = (animTickRef.current + dt) % 1;

      if (spinRef.current && viewerRef.current) {
        const idleMs = now - lastInteractionRef.current;
        if (idleMs >= SPIN_RESUME_DELAY_MS) {
          viewerRef.current.camera.rotateRight(
            SPIN_DEG_PER_SEC * dt * CesiumMath.RADIANS_PER_DEGREE,
          );
        }
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── Map style: swap imagery layer ───────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Remove existing base layer
    const existing = viewer.imageryLayers.get(0);
    if (existing) viewer.imageryLayers.remove(existing, true);

    const url = tileUrlForStyle(mapStyle);
    if (url) {
      const layer = viewer.imageryLayers.addImageryProvider(
        new UrlTemplateImageryProvider({ url, maximumLevel: 19 }),
        0,
      );
      imageryLayerIndexRef.current = viewer.imageryLayers.indexOf(layer);
    }
    // debug: no tiles, black background already set on init
  }, [mapStyle]);

  // ── Country heat layer ───────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !worldCountriesData || !actors.length) return;

    // Build actor lookup: normalised name → ActorEntry
    const actorMap = new Map<string, ActorEntry>();
    for (const a of actors) actorMap.set(a.actor.toLowerCase().trim(), a);

    const loadCountries = async () => {
      // Remove previous data source
      if (countryDsRef.current) {
        viewer.dataSources.remove(countryDsRef.current, true);
        countryDsRef.current = null;
      }

      const ds = await GeoJsonDataSource.load(worldCountriesData as unknown as object, {
        stroke: Color.fromCssColorString("#ffffff14"),
        strokeWidth: 0.5,
        fill: Color.TRANSPARENT,
        clampToGround: true,
      });

      if (!viewerRef.current) return; // unmounted during async load

      for (const entity of ds.entities.values) {
        // Find matching actor for this country
        let matched: ActorEntry | null = null;
        for (const [norm, entry] of actorMap) {
          if (matchActorToEntity(norm, entity as unknown as { properties?: unknown })) {
            matched = entry;
            break;
          }
        }

        if (!entity.polygon) continue;

        const level = matched?.threat_level ?? "STABLE";
        if (level === "STABLE") {
          entity.polygon.material = new ColorMaterialProperty(Color.TRANSPARENT);
          entity.polygon.outline = false as unknown as CallbackProperty;
          continue;
        }

        // Pulsing fill via CallbackProperty
        entity.polygon.material = new ColorMaterialProperty(
          new CallbackProperty(() => {
            const pulse = 0.5 + 0.5 * Math.sin(animTickRef.current * Math.PI * 2);
            return threatFillColor(level, pulse);
          }, false),
        );

        // Threat-level outline
        const outlineColors: Record<string, string> = {
          CRITICAL: "#ef444488",
          ELEVATED: "#f59e0b88",
          MONITORING: "#eab30864",
        };
        entity.polygon.outline = new CallbackProperty(() => true, true) as unknown as CallbackProperty;
        entity.polygon.outlineColor = new ColorMaterialProperty(
          Color.fromCssColorString(outlineColors[level] ?? "#ffffff14"),
        );
        entity.polygon.outlineWidth = new CallbackProperty(
          () => (level === "CRITICAL" ? 2 : 1),
          true,
        ) as unknown as CallbackProperty;
      }

      viewer.dataSources.add(ds);
      countryDsRef.current = ds;
    };

    loadCountries();
  }, [worldCountriesData, actors]);

  // ── GDELT point primitives ───────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !gdeltData?.features?.length) return;

    // Remove previous collection
    if (pointCollRef.current) {
      viewer.scene.primitives.remove(pointCollRef.current);
    }

    const coll = new PointPrimitiveCollection();

    for (const f of gdeltData.features) {
      const props = f.properties ?? {};
      const [lon, lat] = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
      if (!lon || !lat) continue;

      const toneColor = (props.toneColor as [number, number, number, number] | undefined) ?? [
        163, 230, 53, 180,
      ];

      // Outer glow
      coll.add({
        position: Cartesian3.fromDegrees(lon, lat),
        color: Color.fromBytes(toneColor[0], toneColor[1], toneColor[2], 60),
        pixelSize: 16,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });

      // Filled dot (pickable — id stores the point data for click handler)
      coll.add({
        position: Cartesian3.fromDegrees(lon, lat),
        color: Color.fromBytes(toneColor[0], toneColor[1], toneColor[2], toneColor[3] ?? 200),
        pixelSize: 7,
        outlineColor: Color.fromBytes(0, 0, 0, 120),
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        id: {
          event_id: props.event_id ?? "",
          name: props.name ?? "",
          lat,
          lon,
          ...props,
        },
      });
    }

    viewer.scene.primitives.add(coll);
    pointCollRef.current = coll;
  }, [gdeltData]);

  // ── Conflict arc entities ────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !gdeltData?.features?.length) return;

    // Remove previous arc entities
    for (const id of arcEntityIdsRef.current) {
      const entity = viewer.entities.getById(id);
      if (entity) viewer.entities.remove(entity);
    }
    arcEntityIdsRef.current = [];

    const centroids = getCentroidsCache();
    const arcs: GdeltArc[] = buildArcData(
      gdeltData as unknown as Parameters<typeof buildArcData>[0],
      centroids,
    );

    for (const arc of arcs) {
      const [srcLon, srcLat] = arc.sourcePosition;
      const [tgtLon, tgtLat] = arc.targetPosition;

      // Skip very short arcs (< 2°) — they look like blobs at globe scale
      if (
        Math.abs(srcLat - tgtLat) < 2 &&
        Math.abs(srcLon - tgtLon) < 2
      )
        continue;

      const positions = buildArcPositions(srcLon, srcLat, tgtLon, tgtLat);
      const [r, g, b, a] = arc.sourceColor;

      const entity = viewer.entities.add({
        polyline: {
          positions,
          width: arc.width * 1.5,
          arcType: ArcType.NONE, // positions already geodesic-sampled
          material: new ColorMaterialProperty(
            new CallbackProperty(() => {
              const pulse =
                0.7 + 0.3 * Math.sin(animTickRef.current * Math.PI * 2);
              return Color.fromBytes(r, g, b, Math.round(a * pulse));
            }, false),
          ),
          clampToGround: false,
        },
      });

      arcEntityIdsRef.current.push(entity.id);
    }
  }, [gdeltData]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

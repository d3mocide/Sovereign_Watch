import type { Layer, PickingInfo } from "@deck.gl/core";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";

export interface GdeltPoint {
  event_id: string;
  lat: number;
  lon: number;
  name: string;
  url: string;
  domain: string; // Extracted from URL hostname
  tone: number;
  goldstein: number;
  toneColor: [number, number, number, number];
  actor1?: string;
  actor2?: string;
  actor1_country?: string;
  actor2_country?: string;
  event_root_code?: string;
  quad_class?: number;
  num_mentions?: number;
  num_sources?: number;
  num_articles?: number;
  timestamp?: string;
}

/**
 * Returns a tone label string for a Goldstein tone score.
 * Used in hover/click tooltips.
 */
export function gdeltToneLabel(tone: number): string {
  if (tone <= -5) return "HIGH CONFLICT";
  if (tone <= -2) return "CONFLICT";
  if (tone < 0) return "NEGATIVE";
  if (tone < 2) return "NEUTRAL";
  return "COOPERATIVE";
}

interface GdeltFeature {
  id?: string;
  geometry: { coordinates: [number, number] };
  properties: {
    event_id?: string;
    name?: string;
    url?: string;
    domain?: string;
    tone?: number;
    goldstein?: number;
    toneColor?: [number, number, number, number];
    dateadded?: string;
    timestamp?: string;
    actor1?: string;
    actor2?: string;
    actor1_country?: string;
    actor2_country?: string;
    event_root_code?: string;
    quad_class?: number;
    num_mentions?: number;
    num_sources?: number;
    num_articles?: number;
  };
}

/**
 * Builds Deck.gl layers for GDELT geolocated news events.
 *
 * Dot color encodes Goldstein tone:
 *   red     → high conflict (tone ≤ -5)
 *   orange  → moderate conflict (-5 < tone ≤ -2)
 *   yellow  → slight negative (-2 < tone < 0)
 *   lime    → neutral/positive (0 ≤ tone < 2)
 *   green   → cooperative (tone ≥ 2)
 *
 * Clicking a dot opens the source article in a new tab.
 *
 * @param toneThreshold  Only render events with tone ≤ this value.
 *                       Default -Infinity shows all events.
 *                       Pass -2 for conflict+tension only (orbital view).
 */
export function buildGdeltLayer(
  gdeltData: { type: string; features: GdeltFeature[] } | null,
  visible: boolean,
  globeMode: boolean,
  toneThreshold: number = -Infinity,
  showDomainLabels: boolean = true,
  onHover: (entity: any | null, pos: { x: number; y: number } | null) => void,
  onClick?: (event: GdeltPoint) => void,
): Layer[] {
  const isReadableDomain = (value: string): boolean => {
    const domain = (value || "").trim();
    if (!domain) return false;
    // Prevent numeric-only artifacts (e.g. lon values) from rendering as labels.
    if (domain.replace(/\./g, "").replace(/-/g, "").match(/^\d+$/))
      return false;
    return true;
  };

  const threshold =
    toneThreshold === undefined || toneThreshold === null
      ? -Infinity
      : toneThreshold;
  if (!visible || !gdeltData?.features?.length) return [];

  const features =
    threshold === -Infinity
      ? gdeltData.features
      : gdeltData.features.filter(
          (f) => (f.properties.goldstein ?? 0) <= threshold,
        );

  if (!features.length) return [];

  const data: GdeltPoint[] = features.map((f) => ({
    event_id: f.properties.event_id || f.id || "",
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    name: f.properties.name || "",
    url: f.properties.url || "",
    domain: f.properties.domain || "",
    tone: f.properties.tone ?? 0,
    goldstein: f.properties.goldstein ?? 0,
    toneColor: f.properties.toneColor || [163, 230, 53, 180],
    actor1: f.properties.actor1,
    actor2: f.properties.actor2,
    actor1_country: f.properties.actor1_country,
    actor2_country: f.properties.actor2_country,
    event_root_code: f.properties.event_root_code,
    quad_class: f.properties.quad_class,
    num_mentions: f.properties.num_mentions,
    num_sources: f.properties.num_sources,
    num_articles: f.properties.num_articles,
    timestamp: f.properties.timestamp,
  }));

  const formatDomainLabel = (value: string): string => {
    const raw = (value || "").trim().toLowerCase();
    const noWww = raw.startsWith("www.") ? raw.slice(4) : raw;
    return noWww.length > 28 ? `${noWww.slice(0, 28)}...` : noWww;
  };

  return [
    // Outer glow ring
    new ScatterplotLayer<GdeltPoint>({
      id: `gdelt-glow-${globeMode ? "globe" : "merc"}`,
      data,
      pickable: false,
      stroked: true,
      filled: false,
      getPosition: (d) => [d.lon, d.lat, 0],
      getRadius: 18000,
      radiusUnits: "meters",
      getLineColor: (d) => {
        const c = d.toneColor as [number, number, number, number];
        return [c[0], c[1], c[2], 60];
      },
      getLineWidth: 4000,
      lineWidthUnits: "meters",
      wrapLongitude: !globeMode,
      parameters: {
        depthTest: !!globeMode,
        depthBias: globeMode ? -100.0 : 0,
      } as any,
    }),

    // Filled dot
    new ScatterplotLayer<GdeltPoint>({
      id: `gdelt-dots-${globeMode ? "globe" : "merc"}`,
      data,
      pickable: true,
      stroked: true,
      filled: true,
      getPosition: (d) => [d.lon, d.lat, 0],
      getRadius: 7000,
      radiusUnits: "meters",
      radiusMinPixels: 3,
      radiusMaxPixels: 10,
      getFillColor: (d) => d.toneColor as [number, number, number, number],
      getLineColor: [0, 0, 0, 120],
      getLineWidth: 1,
      lineWidthUnits: "pixels",
      wrapLongitude: !globeMode,
      parameters: {
        depthTest: !!globeMode,
        depthBias: globeMode ? -100.0 : 0,
      } as any,
      onHover: (info: PickingInfo<GdeltPoint>) => {
        if (info.object) {
          const d = info.object;
          // Transform internal GdeltPoint into a virtual CoTEntity for the tooltip HUD
          const entity = {
            uid: `gdelt-${d.event_id}`,
            type: "gdelt",
            callsign: d.name,
            lat: d.lat,
            lon: d.lon,
            altitude: 0,
            course: 0,
            speed: 0,
            lastSeen: Date.now(),
            detail: d, // Includes event_id, url, tone, domain, enriched fields
          };
          onHover(entity, { x: info.x, y: info.y });
        } else {
          onHover(null, null);
        }
      },
      onClick: (info: PickingInfo<GdeltPoint>) => {
        if (info.object && onClick) {
          onClick(info.object);
        }
      },
    }),

    // Domain label (only shown when zoomed in enough — controlled by TextLayer size)
    // Filtered to skip events with empty domains to avoid empty label boxes
    new TextLayer<GdeltPoint>({
      id: `gdelt-labels-${globeMode ? "globe" : "merc"}`,
      data: showDomainLabels
        ? data.filter((d) => isReadableDomain(d.domain))
        : [],
      pickable: false,
      getPosition: (d) => [d.lon, d.lat, 0],
      getText: (d) => formatDomainLabel(d.domain),
      getSize: 10,
      getColor: [245, 247, 250, 230],
      getPixelOffset: [0, -18],
      fontFamily: "monospace",
      fontWeight: 700,
      background: true,
      getBackgroundColor: () => [10, 14, 22, 220],
      backgroundPadding: [5, 2],
      getBorderColor: (d) => {
        const c = d.toneColor as [number, number, number, number];
        return [c[0], c[1], c[2], 210];
      },
      getBorderWidth: 1,
      billboard: true,
      sizeScale: 1,
      wrapLongitude: !globeMode,
      parameters: {
        depthTest: !!globeMode,
        depthBias: globeMode ? -99.0 : 0,
      } as any,
    }),
  ];
}

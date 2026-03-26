import type { Layer } from "@deck.gl/core";
import { GeoJsonLayer } from "@deck.gl/layers";

export interface ActorEntry {
  actor: string;
  actor_type: string;
  event_count: number;
  avg_goldstein: number;
  threat_level: "CRITICAL" | "ELEVATED" | "MONITORING" | "STABLE";
  centroid_lat: number;
  centroid_lon: number;
  verbal_conflict: number;
  material_conflict: number;
  verbal_coop: number;
  material_coop: number;
}

/** Map ISO 3166-1 alpha-2 / GDELT country codes to rough display names for matching. */
const COUNTRY_ALIAS: Record<string, string[]> = {
  US: ["united states", "usa", "united states of america"],
  RU: ["russia", "russian federation"],
  CN: ["china", "people's republic of china", "prc"],
  IR: ["iran", "iran (islamic republic of)"],
  KP: ["north korea", "democratic people's republic of korea", "dprk"],
  UA: ["ukraine"],
  IL: ["israel"],
  PS: ["palestine", "palestinian territory"],
  SY: ["syria"],
  YE: ["yemen"],
  SD: ["sudan"],
  ET: ["ethiopia"],
  AF: ["afghanistan"],
  MM: ["myanmar", "burma"],
  ML: ["mali"],
  SO: ["somalia"],
  LY: ["libya"],
  IQ: ["iraq"],
  PK: ["pakistan"],
  IN: ["india"],
  FR: ["france"],
  GB: ["united kingdom", "uk"],
  DE: ["germany"],
  JP: ["japan"],
  BR: ["brazil"],
  TR: ["turkey", "türkiye"],
  SA: ["saudi arabia"],
  VE: ["venezuela"],
};

/**
 * Match a GDELT actor country string to a GeoJSON feature.
 * GeoJSON features use NAME / ISO_A2 / ADM0_A3 properties (Natural Earth).
 */
function matchActorToFeature(
  actor: string,
  featureProps: Record<string, unknown>,
): boolean {
  const norm = actor.toLowerCase().trim();
  const name = ((featureProps.NAME as string) || "").toLowerCase();
  const iso2 = ((featureProps.ISO_A2 as string) || "").toLowerCase();
  const iso3 = ((featureProps.ADM0_A3 as string) || "").toLowerCase();
  const nameEn = ((featureProps.NAME_EN as string) || "").toLowerCase();

  if (name === norm || iso2 === norm || iso3 === norm || nameEn === norm)
    return true;

  // Check aliases
  for (const [, aliases] of Object.entries(COUNTRY_ALIAS)) {
    if (aliases.includes(norm)) {
      // See if this feature matches any alias
      return aliases.some(
        (a) => name === a || nameEn === a || iso2 === a || iso3 === a,
      );
    }
  }
  return false;
}

/**
 * Tone-to-RGBA fill colour.
 * Returns [r, g, b, a] — alpha is intentionally low (surface tint not opaque).
 */
function threatToFillColor(
  threatLevel: string,
  pulse: number,
): [number, number, number, number] {
  const alpha = Math.round(55 + 25 * pulse); // 55–80 range
  switch (threatLevel) {
    case "CRITICAL":
      return [239, 68, 68, alpha + 20];   // red
    case "ELEVATED":
      return [245, 158, 11, alpha];        // amber
    case "MONITORING":
      return [234, 179, 8, Math.round(alpha * 0.7)]; // yellow, dimmer
    default:
      return [0, 0, 0, 0];               // transparent for STABLE
  }
}

function threatToLineColor(
  threatLevel: string,
): [number, number, number, number] {
  switch (threatLevel) {
    case "CRITICAL":
      return [239, 68, 68, 200];
    case "ELEVATED":
      return [245, 158, 11, 160];
    case "MONITORING":
      return [234, 179, 8, 100];
    default:
      return [0, 0, 0, 0];
  }
}

/**
 * Builds a GeoJsonLayer that shades country polygons by GDELT threat level.
 *
 * Countries with CRITICAL or ELEVATED actor records are tinted red/amber.
 * The fill pulses gently using animTick.
 *
 * @param countriesGeoJson  Natural Earth 110m (or world-countries.json) FeatureCollection
 * @param actors            Output from /api/gdelt/actors
 * @param animTick          Normalised animation time (0–1, one cycle per second)
 */
export function buildCountryHeatLayer(
  countriesGeoJson: { type: string; features: any[] } | null,
  actors: ActorEntry[],
  visible: boolean,
  globeMode: boolean,
  animTick: number,
  debugMode?: boolean,
): Layer[] {
  if (!visible || !countriesGeoJson?.features?.length || !actors.length)
    return [];

  // Build a quick lookup: normalised actor name → ActorEntry
  const actorMap = new Map<string, ActorEntry>();
  for (const a of actors) {
    actorMap.set(a.actor.toLowerCase().trim(), a);
  }

  // OPTIMIZATION: Cache the matched actor for each feature so we don't re-scan 
  // the actorMap every frame during the animation pulse.
  const featureMatchedMap = new Map<any, ActorEntry | null>();

  const pulse = 0.5 + 0.5 * Math.sin(animTick * Math.PI * 2);

  const getMatchedActor = (feature: any): ActorEntry | null => {
    if (featureMatchedMap.has(feature)) return featureMatchedMap.get(feature)!;
    
    let matched: ActorEntry | null = null;
    const props = feature.properties || {};
    for (const [norm, entry] of actorMap) {
      if (matchActorToFeature(norm, props)) {
        matched = entry;
        break;
      }
    }
    featureMatchedMap.set(feature, matched);
    return matched;
  };

  return [
    new GeoJsonLayer({
      id: `country-heat-${globeMode ? "globe" : "merc"}`,
      data: countriesGeoJson as any,
      pickable: false,
      stroked: true,
      filled: true,
      getFillColor: (feature: any) => {
        const matched = getMatchedActor(feature);
        if (!matched || matched.threat_level === "STABLE") return [0, 0, 0, 0];
        return threatToFillColor(matched.threat_level, pulse);
      },
      getLineColor: (feature: any) => {
        const matched = getMatchedActor(feature);
        if (!matched || matched.threat_level === "STABLE")
          return [255, 255, 255, 8];
        return threatToLineColor(matched.threat_level);
      },
      getLineWidth: (feature: any) => {
        const matched = getMatchedActor(feature);
        if (matched) {
          return matched.threat_level === "CRITICAL" ? 2 : 1;
        }
        return 0.5;
      },
      lineWidthUnits: "pixels",
      lineWidthMinPixels: 0.5,
      wrapLongitude: !globeMode,
      updateTriggers: {
        getFillColor: animTick,
      },
      parameters: {
        depthTest: debugMode ? false : !!globeMode,
        depthBias: (globeMode && !debugMode) ? -200.0 : 0,
      } as any,
    }),
  ];
}

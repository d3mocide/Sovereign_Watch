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
  const read = (...keys: string[]) => {
    for (const key of keys) {
      const value = featureProps[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.toLowerCase().trim();
      }
    }
    return "";
  };

  // Support both Natural Earth key variants used across our assets.
  const name = read("NAME", "name", "ADMIN", "admin");
  const iso2 = read("ISO_A2", "ISO3166-1-Alpha-2", "iso_a2", "iso2");
  const iso3 = read("ADM0_A3", "ISO3166-1-Alpha-3", "iso_a3", "iso3");
  const nameEn = read("NAME_EN", "name_en");

  if (name === norm || iso2 === norm || iso3 === norm || nameEn === norm)
    return true;

  // Check aliases/code mapping (e.g., actor "US" maps to feature iso2 "td").
  for (const [iso2Code, aliases] of Object.entries(COUNTRY_ALIAS)) {
    const iso2Norm = iso2Code.toLowerCase();
    if (norm === iso2Norm || aliases.includes(norm)) {
      return (
        iso2 === iso2Norm || aliases.includes(name) || aliases.includes(nameEn)
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
): [number, number, number, number] {
  switch (threatLevel) {
    case "CRITICAL":
      return [239, 68, 68, 95]; // red
    case "ELEVATED":
      return [245, 158, 11, 72]; // amber
    case "MONITORING":
      return [234, 179, 8, 52]; // yellow, dimmer
    default:
      return [0, 0, 0, 0]; // transparent for STABLE
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
 * Countries with CRITICAL or ELEVATED actor records are tinted with static fills.
 *
 * @param countriesGeoJson  Natural Earth 110m (or world-countries.json) FeatureCollection
 * @param actors            Output from /api/gdelt/actors
 * @param animTick          Unused animation tick kept for call-site compatibility
 */
export function buildCountryHeatLayer(
  countriesGeoJson: { type: string; features: any[] } | null,
  actors: ActorEntry[],
  visible: boolean,
  globeMode: boolean,
  animTick: number,
): Layer[] {
  void animTick;

  if (!visible || !countriesGeoJson?.features?.length || !actors.length)
    return [];

  // Build a quick lookup: normalised actor name → ActorEntry
  const actorMap = new Map<string, ActorEntry>();
  for (const a of actors) {
    actorMap.set(a.actor.toLowerCase().trim(), a);
  }

  // OPTIMIZATION: Cache the matched actor for each feature so we don't re-scan
  // the actorMap for every accessor invocation.
  const featureMatchedMap = new Map<any, ActorEntry | null>();

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
        return threatToFillColor(matched.threat_level);
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
      parameters: {
        depthTest: !!globeMode,
        // Keep country tint behind GDELT icon/text layers on globe mode.
        depthBias: globeMode ? 140.0 : 0,
      } as any,
    }),
  ];
}

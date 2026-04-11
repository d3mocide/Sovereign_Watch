/**
 * Builds Deck.gl layers for rendering clausal chain narratives.
 *
 * Visual design intent:
 *  - Only chains that contain at least one state-change event are rendered.
 *    Chains with no state_change_reason are silent movement logs — they add
 *    clutter without any analytical signal, so they are filtered out entirely.
 *  - Paths are trimmed to a ±2-point window around each state-change clause
 *    so you see the "approach → event → departure" segment, not a 24-hour trail.
 *  - Two ScatterplotLayer rings (solid + translucent halo) replace the icon
 *    atlas so state-change moments pulse on the map without cluttering the
 *    existing entity icon space.
 *  - A thin dashed PathLayer in the entity's type color connects consecutive
 *    state-change segments visually.
 */

import type { Layer, PickingInfo } from "@deck.gl/core";
import { CollisionFilterExtension } from "@deck.gl/extensions";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { CoTEntity } from "../types";

/**
 * State-change reasons that fire too frequently to be meaningful on the map.
 * LOCATION_TRANSITION fires every time an entity crosses an H3-res-9 cell
 * boundary (~174 m) — i.e. every few seconds for any moving aircraft.
 * COURSE_CHANGE fires at >30° heading delta which is also very common in
 * normal flight patterns (turns, approach, departure).
 * Suppress both from dots and labels; only elevate if no other events exist.
 */
const SUPPRESSED_EVENTS = new Set([
  "LOCATION_TRANSITION",
  "COURSE_CHANGE",
]);

/** True when a state-change reason warrants a visible marker. */
function isInteresting(reason: string): boolean {
  return !SUPPRESSED_EVENTS.has(reason);
}

export interface ClausalChain {
  uid: string;
  source: string; // 'TAK_ADSB', 'TAK_AIS', 'GDELT'
  time?: string;
  predicate_type: string;
  narrative_summary?: string;
  context_scope?: Record<string, unknown>;
  outage_context?: Record<string, unknown>[];
  space_weather_context?: Record<string, unknown> | null;
  satnogs_context?: Record<string, unknown>[];
  clauses: MedialClause[];
}

export interface MedialClause {
  time: string;
  locative_lat: number;
  locative_lon: number;
  locative_hae: number;
  state_change_reason?: string;
  adverbial_context: {
    speed?: number;
    course?: number;
    altitude?: number;
    battery_pct?: number;
    confidence?: number;
  };
}

// ── Internal shape types ────────────────────────────────────────────────────

interface PathDatum {
  path: [number, number][];
  color: [number, number, number, number];
  uid: string;
}

interface EventDatum {
  position: [number, number];
  uid: string;
  reason: string;
  predicate_type: string;
  confidence: number;
  /** Outer halo radius — scaled by anomaly type + confidence */
  radius: number;
  // Enriched fields for tooltip
  eventTime: string;
  speed_ms: number;     // m/s from adverbial_context
  altitude_m: number;  // metres HAE
  course: number;       // degrees
  narrative?: string;  // chain narrative_summary if present
  context_scope?: Record<string, unknown>;
  space_weather_context?: Record<string, unknown> | null;
}

interface TextDatum {
  position: [number, number];
  uid: string;
  text: string;
}

// ── Color palette ────────────────────────────────────────────────────────────

function getColorForType(
  predicate_type: string,
): [number, number, number, number] {
  const t = (predicate_type || "").toLowerCase();

  if (t.startsWith("a-f-a-c")) return [56, 189, 248, 200];   // Fixed-wing — sky blue
  if (t.startsWith("a-f-a-h")) return [99, 179, 237, 200];   // Rotary — lighter blue
  if (t.startsWith("a-f-a-u")) return [167, 139, 250, 200];  // Unmanned — violet
  if (t.startsWith("a-f-s-w")) return [52, 211, 153, 200];   // Warship — teal
  if (t.startsWith("a-f-s-m")) return [34, 197, 94, 200];    // Merchant — green
  if (t.startsWith("a-f-s"))  return [16, 185, 129, 200];    // Maritime general
  if (t.startsWith("protest")) return [251, 146, 60, 200];   // Orange
  if (t.startsWith("armed"))  return [239, 68, 68, 200];     // Red
  if (t.includes("police"))   return [148, 163, 184, 200];   // Slate

  return [148, 163, 184, 180]; // Default — cool gray
}

// ── Anomaly-keyed color palette ──────────────────────────────────────────────
// Color is determined by WHAT HAPPENED, not what entity type triggered it.
// TYPE_CHANGE (red) > ALTITUDE_CHANGE (orange) > SPEED_TRANSITION (amber)
// so severity reads at a glance across entity categories.

/** Solid fill color for anomaly dot — keyed on state-change reason. */
function getAnomalyColor(reason: string): [number, number, number, number] {
  switch (reason) {
    case "EMERGENCY":
    case "SQUAWK_EMERGENCY":    return [255,  50,  50, 255];
    case "TYPE_CHANGE":         return [239,  68,  68, 255];
    case "ALTITUDE_CHANGE":     return [251, 146,  60, 255];
    case "SPEED_TRANSITION":    return [245, 158,  11, 255];
    case "LOITER_DETECTED":     return [234, 179,   8, 255];
    case "ZONE_ENTRY":
    case "AIRSPACE_ENTRY":      return [  6, 182, 212, 255];
    case "COURSE_CHANGE":
    case "LOCATION_TRANSITION": return [ 99, 102, 241, 160];
    default:                    return [ 99, 102, 241, 220];
  }
}

/** Translucent outer halo — same hue, alpha scaled by confidence (0–1). */
function getAnomalyHalo(
  reason: string,
  confidence: number,
): [number, number, number, number] {
  const c = getAnomalyColor(reason);
  return [c[0], c[1], c[2], Math.round(65 * Math.max(0.3, confidence))];
}

/** Halo radius in metres — larger for higher-severity anomalies, scaled by confidence. */
function getAnomalyRadius(reason: string, confidence: number): number {
  const base =
    reason === "EMERGENCY" || reason === "SQUAWK_EMERGENCY" ? 900 :
    reason === "TYPE_CHANGE"                                ? 700 :
    reason === "ALTITUDE_CHANGE"                            ? 600 :
    reason === "SPEED_TRANSITION"                           ? 500 :
    reason === "LOITER_DETECTED"                            ? 550 :
    reason === "ZONE_ENTRY" || reason === "AIRSPACE_ENTRY"  ? 480 :
    450;
  return Math.max(300, Math.round(base * Math.max(0.3, confidence)));
}

// ── Path segment extraction ──────────────────────────────────────────────────

/**
 * Extracts path segments from a chain's clauses, each segment spanning a
 * state-change clause plus its ±WINDOW nearest neighbors.
 * Adjacent windows are merged so overlapping segments don't double-draw.
 */
const WINDOW = 2; // clauses before/after a state change to include

function extractEventSegments(
  clauses: MedialClause[],
): [number, number][][] {
  if (clauses.length === 0) return [];

  // Find indices of clauses with a state_change_reason
  const eventIndices = clauses
    .map((c, i) => (c.state_change_reason ? i : -1))
    .filter((i) => i >= 0);

  if (eventIndices.length === 0) return [];

  // Build merged index ranges [start, end] inclusive
  const ranges: [number, number][] = [];
  for (const idx of eventIndices) {
    const lo = Math.max(0, idx - WINDOW);
    const hi = Math.min(clauses.length - 1, idx + WINDOW);
    if (
      ranges.length > 0 &&
      lo <= ranges[ranges.length - 1][1] + 1
    ) {
      // Merge with previous range
      ranges[ranges.length - 1][1] = Math.max(
        ranges[ranges.length - 1][1],
        hi,
      );
    } else {
      ranges.push([lo, hi]);
    }
  }

  return ranges.map(([lo, hi]) =>
    clauses
      .slice(lo, hi + 1)
      .map((c): [number, number] => [c.locative_lon, c.locative_lat]),
  );
}

// ── Main builder ─────────────────────────────────────────────────────────────

/**
 * Builds Deck.gl layers for clausal chain narratives.
 *
 * Only chains with ≥1 state-change clause are rendered. Chains that contain
 * only position updates (no state_change_reason) are filtered out entirely —
 * they add visual noise without analytical value.
 *
 * Layer stack (bottom → top):
 *  1. PathLayer  — dashed event-segment trails (connects state-change windows)
 *  2. ScatterplotLayer (halo)  — large translucent ring at each state-change point
 *  3. ScatterplotLayer (core)  — bright solid dot at each state-change point
 *  4. TextLayer  — narrative label at the final state-change position
 */
export function buildClausalChainLayer(
  clausalChains: ClausalChain[] | null,
  visible: boolean,
  globeMode: boolean,
  onHover?: (entity: any | null, pos: { x: number; y: number } | null) => void,
  onEntitySelect?: (entity: CoTEntity) => void,
): Layer[] {
  if (!visible || !Array.isArray(clausalChains) || clausalChains.length === 0) {
    return [];
  }

  // ── 1. Filter to chains that actually have state-change events ─────────────
  const activeChains = clausalChains.filter((chain) =>
    chain.clauses.some((c) => c.state_change_reason),
  );

  if (activeChains.length === 0) return [];

  // ── 2. Build path segments ──────────────────────────────────────────────────
  const pathData: PathDatum[] = [];
  for (const chain of activeChains) {
    const segments = extractEventSegments(chain.clauses);
    const color = getColorForType(chain.predicate_type);
    // Reduce segment opacity further so they read as "trace" not "track"
    const dimColor: [number, number, number, number] = [
      color[0],
      color[1],
      color[2],
      120,
    ];
    for (const seg of segments) {
      if (seg.length >= 2) {
        pathData.push({ path: seg, color: dimColor, uid: chain.uid });
      }
    }
  }

  // ── 3. Build event point data (interesting events only) ───────────────────
  // LOCATION_TRANSITION and COURSE_CHANGE are suppressed — they fire on every
  // H3-res-9 boundary cross (~174 m) and every >30° heading delta, making them
  // far too frequent to be useful as individual map markers.
  const eventData: EventDatum[] = [];
  for (const chain of activeChains) {
    // Does this chain have ANY interesting (non-suppressed) events?
    const hasInteresting = chain.clauses.some(
      (c) => c.state_change_reason && isInteresting(c.state_change_reason),
    );

    for (const clause of chain.clauses) {
      if (!clause.state_change_reason) continue;
      // Skip suppressed events unless this chain has NO interesting ones
      if (SUPPRESSED_EVENTS.has(clause.state_change_reason) && hasInteresting) {
        continue;
      }
      const rawConf = clause.adverbial_context.confidence ?? 0.8;
      const confidence = Math.max(0.3, Math.min(1, rawConf));
      eventData.push({
        position: [clause.locative_lon, clause.locative_lat],
        uid: chain.uid,
        reason: clause.state_change_reason,
        predicate_type: chain.predicate_type,
        confidence,
        radius: getAnomalyRadius(clause.state_change_reason, confidence),
        eventTime: clause.time,
        speed_ms: clause.adverbial_context.speed ?? 0,
        altitude_m: clause.locative_hae ?? 0,
        course: clause.adverbial_context.course ?? 0,
        narrative: chain.narrative_summary,
        context_scope: chain.context_scope,
        space_weather_context: chain.space_weather_context,
      });
    }
  }

  // ── 4. Build text labels — one per chain, interesting events only ─────────
  // A label is shown only when the chain contains at least one interesting
  // (non-suppressed) event. Chains whose only events are LOCATION_TRANSITION
  // / COURSE_CHANGE get no label — they're in the dot layer as a dim fallback
  // but don't need to announce themselves textually.
  const textData: TextDatum[] = [];
  for (const chain of activeChains) {
    // Collect the interesting event reasons for this chain
    const interestingReasons = chain.clauses
      .filter((c) => c.state_change_reason && isInteresting(c.state_change_reason))
      .map((c) => c.state_change_reason as string);

    if (interestingReasons.length === 0) continue; // suppress label

    // Anchor the label at the last *interesting* clause position
    const lastInterestingClause = [...chain.clauses]
      .reverse()
      .find((c) => c.state_change_reason && isInteresting(c.state_change_reason));
    if (!lastInterestingClause) continue;

    const label = chain.narrative_summary
      ? chain.narrative_summary.substring(0, 52)
      : [...new Set(interestingReasons)] // dedupe
          .slice(0, 2)
          .map((r) => r.replace(/_/g, " "))
          .join(" · ");

    if (label) {
      textData.push({
        position: [lastInterestingClause.locative_lon, lastInterestingClause.locative_lat],
        uid: chain.uid,
        text: label,
      });
    }
  }

  const glParams = {
    depthTest: !!globeMode,
    depthBias: globeMode ? -50.0 : 0,
  } as any;

  return [
    // ── ScatterplotLayer: outer halo ring ─────────────────────────────────
    // Color keyed on anomaly TYPE, not entity type — so red rings = TYPE_CHANGE,
    // orange = ALTITUDE_CHANGE, amber = SPEED_TRANSITION at a glance.
    new ScatterplotLayer<EventDatum>({
      id: `clausal-chain-halo-${globeMode ? "globe" : "merc"}`,
      data: eventData,
      pickable: false,
      getPosition: (d) => [d.position[0], d.position[1], 0],
      getRadius: (d) => d.radius,
      radiusUnits: "meters",
      getFillColor: (d) => getAnomalyHalo(d.reason, d.confidence),
      getLineColor: (d) => {
        const c = getAnomalyColor(d.reason);
        return [c[0], c[1], c[2], Math.round(160 * d.confidence)];
      },
      stroked: true,
      filled: true,
      getLineWidth: 1.5,
      lineWidthUnits: "pixels",
      wrapLongitude: !globeMode,
      parameters: { ...glParams, depthBias: globeMode ? -49.5 : 0 },
    }),

    // ── ScatterplotLayer: solid anomaly dot ────────────────────────────────
    new ScatterplotLayer<EventDatum>({
      id: `clausal-chain-dot-${globeMode ? "globe" : "merc"}`,
      data: eventData,
      pickable: true,
      getPosition: (d) => [d.position[0], d.position[1], 0],
      getRadius: 140,
      radiusUnits: "meters",
      getFillColor: (d) => getAnomalyColor(d.reason),
      getLineColor: [255, 255, 255, 180],
      stroked: true,
      filled: true,
      getLineWidth: 1,
      lineWidthUnits: "pixels",
      wrapLongitude: !globeMode,
      parameters: { ...glParams, depthBias: globeMode ? -49.0 : 0 },
      onHover: (info: PickingInfo<EventDatum>) => {
        if (!onHover) return;
        if (info.object) {
          const d = info.object;
          const speedKts = (d.speed_ms ?? 0) * 1.94384;
          onHover(
            {
              uid: d.uid,
              type: "clausal-state-change",
              callsign: d.reason.replace(/_/g, " "),
              lat: d.position[1],
              lon: d.position[0],
              altitude: d.altitude_m ?? 0,
              course: d.course ?? 0,
              speed: speedKts,
              lastSeen: d.eventTime ? new Date(d.eventTime).getTime() : Date.now(),
              detail: {
                state_change_reason: d.reason,
                confidence: d.confidence,
                predicate_type: d.predicate_type,
                event_time: d.eventTime,
                speed_kts: speedKts.toFixed(1),
                altitude_ft: Math.round((d.altitude_m ?? 0) * 3.28084),
                course_deg: Math.round(d.course ?? 0),
                narrative: d.narrative ?? null,
                context_scope: d.context_scope,
                space_weather_context: d.space_weather_context,
              },
            },
            { x: info.x, y: info.y },
          );
        } else {
          onHover(null, null);
        }
      },
      onClick: (info: PickingInfo<EventDatum>) => {
        if (!onEntitySelect || !info.object) return;
        const d = info.object;
        const speedKts = (d.speed_ms ?? 0) * 1.94384;
        onEntitySelect({
          uid: d.uid,
          type: "clausal-state-change",
          callsign: d.reason.replace(/_/g, " "),
          lat: d.position[1],
          lon: d.position[0],
          altitude: d.altitude_m ?? 0,
          course: d.course ?? 0,
          speed: speedKts,
          lastSeen: d.eventTime ? new Date(d.eventTime).getTime() : Date.now(),
          detail: {
            state_change_reason: d.reason,
            confidence: d.confidence,
            predicate_type: d.predicate_type,
            event_time: d.eventTime,
            speed_kts: speedKts.toFixed(1),
            altitude_ft: Math.round((d.altitude_m ?? 0) * 3.28084),
            course_deg: Math.round(d.course ?? 0),
            narrative: d.narrative ?? null,
            context_scope: d.context_scope,
            space_weather_context: d.space_weather_context,
          },
          trail: [],
          uidHash: 0,
        });
      },
    }),

    // ── TextLayer: one label per chain at last interesting event ──────────
    // CollisionFilterExtension suppresses overlapping labels automatically —
    // higher-priority entries (more interesting event types) win.
    new TextLayer<TextDatum>({
      id: `clausal-chain-labels-${globeMode ? "globe" : "merc"}`,
      data: textData,
      pickable: false,
      getPosition: (d) => [d.position[0], d.position[1], 0],
      getText: (d) => d.text,
      getSize: 11,
      getColor: [226, 232, 240, 230],
      getPixelOffset: [10, -14],
      fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
      fontWeight: 600,
      background: true,
      getBackgroundColor: () => [10, 14, 22, 210],
      backgroundPadding: [5, 2],
      getBorderColor: (d: TextDatum) => {
        const chain = activeChains.find((c) => c.uid === d.uid);
        const col = chain
          ? getColorForType(chain.predicate_type)
          : ([99, 102, 241, 180] as [number, number, number, number]);
        return [col[0], col[1], col[2], 200] as [number, number, number, number];
      },
      getBorderWidth: 1,
      billboard: true,
      sizeScale: 1,
      wrapLongitude: !globeMode,
      parameters: { ...glParams, depthBias: globeMode ? -48.0 : 0 },
      // Collision detection: suppress labels that overlap at current zoom
      ...({
        extensions: [new CollisionFilterExtension()],
        collisionEnabled: true,
        collisionGroup: "clausal-labels",
        // Chains with AI narrative summaries win over raw reason strings
        getCollisionPriority: (d: TextDatum) =>
          activeChains.find((c) => c.uid === d.uid)?.narrative_summary ? 1 : 0,
      } as object),
    }),
  ];
}

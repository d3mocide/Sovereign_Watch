/**
 * Builds Deck.gl layers for rendering clausal chain narratives.
 * Combines PathLayer (historical movement), IconLayer (state-changes), and TextLayer (narrative).
 */

import type { Layer, PickingInfo } from "@deck.gl/core";
import { IconLayer, PathLayer, TextLayer } from "@deck.gl/layers";

export interface ClausalChain {
  uid: string;
  source: string; // 'TAK_ADSB', 'TAK_AIS', 'GDELT'
  time: string;
  predicate_type: string;
  narrative_summary?: string;
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

interface PathDatum {
  path: [number, number][];
  predicate_type: string;
  uid: string;
  color: [number, number, number, number];
}

interface IconDatum {
  position: [number, number];
  uid: string;
  reason: string;
  predicate_type: string;
  confidence: number;
}

interface TextDatum {
  position: [number, number];
  uid: string;
  text: string;
  narrative: string;
}

/**
 * Maps TAK type code to color for path visualization.
 */
function getColorForType(
  predicate_type: string,
): [number, number, number, number] {
  const type = (predicate_type || "").toLowerCase();

  // Aviation types (a-f-A-*)
  if (type.startsWith("a-f-a-c")) return [56, 189, 248, 180]; // Fixed wing blue
  if (type.startsWith("a-f-a-h")) return [59, 130, 246, 180]; // Helicopter dark blue
  if (type.startsWith("a-f-a-u")) return [139, 92, 246, 180]; // Unmanned purple

  // Maritime types (a-f-S-*)
  if (type.startsWith("a-f-s-w")) return [52, 211, 153, 180]; // Warship green
  if (type.startsWith("a-f-s-m")) return [34, 197, 94, 180]; // Merchant green
  if (type.startsWith("a-f-s")) return [16, 185, 129, 180]; // General maritime

  // GDELT event types
  if (type.startsWith("protest")) return [251, 146, 60, 180]; // Orange
  if (type.startsWith("armed")) return [239, 68, 68, 180]; // Red
  if (type.startsWith("police") || type.startsWith("armed_police"))
    return [107, 114, 128, 180]; // Gray

  return [156, 163, 175, 180]; // Default gray
}

/**
 * Gets icon name based on predicate type.
 */
function getIconName(predicate_type: string): string {
  const type = (predicate_type || "").toLowerCase();

  if (type.startsWith("a-f-a-c")) return "aircraft-filled";
  if (type.startsWith("a-f-a-h")) return "helicopter";
  if (type.startsWith("a-f-a-u")) return "drone";
  if (type.startsWith("a-f-s")) return "ship";
  if (type.includes("protest")) return "people";
  if (type.includes("armed") || type.includes("conflict")) return "alert";
  if (type.includes("police")) return "shield";

  return "marker";
}

/**
 * Builds Deck.gl layers for clausal chain narratives.
 *
 * Sublayers:
 * 1. PathLayer: Historical movement (colored by predicate_type)
 * 2. IconLayer: State-change markers at vertices
 * 3. TextLayer: Narrative summary at final position
 *
 * @param clausalChains Array of ClausalChain objects
 * @param visible Toggle layer visibility
 * @param globeMode Enable 3D globe mode
 * @param onHover Callback when hovering entities
 */
export function buildClausalChainLayer(
  clausalChains: ClausalChain[] | null,
  visible: boolean,
  globeMode: boolean,
  onHover?: (entity: any | null, pos: { x: number; y: number } | null) => void,
): Layer[] {
  if (!visible || !clausalChains || clausalChains.length === 0) {
    return [];
  }

  // Build path data (one path per chain)
  const pathData: PathDatum[] = clausalChains.map((chain) => ({
    path: chain.clauses.map((c) => [c.locative_lon, c.locative_lat]),
    predicate_type: chain.predicate_type,
    uid: chain.uid,
    color: getColorForType(chain.predicate_type),
  }));

  // Build icon data (one icon per state-change)
  const iconData: IconDatum[] = [];
  for (const chain of clausalChains) {
    for (const clause of chain.clauses) {
      if (clause.state_change_reason) {
        iconData.push({
          position: [clause.locative_lon, clause.locative_lat],
          uid: chain.uid,
          reason: clause.state_change_reason,
          predicate_type: chain.predicate_type,
          confidence: clause.adverbial_context.confidence || 0.8,
        });
      }
    }
  }

  // Build text data (one label per chain, at final position)
  const textData: TextDatum[] = clausalChains
    .filter((chain) => chain.narrative_summary && chain.clauses.length > 0)
    .map((chain) => {
      const lastClause = chain.clauses[chain.clauses.length - 1];
      return {
        position: [lastClause.locative_lon, lastClause.locative_lat],
        uid: chain.uid,
        text: chain.narrative_summary?.substring(0, 50) || "",
        narrative: chain.narrative_summary || "",
      };
    });

  return [
    // PathLayer: Historical movement traces
    new PathLayer<PathDatum>({
      id: `clausal-chain-paths-${globeMode ? "globe" : "merc"}`,
      data: pathData,
      pickable: false,
      getPath: (d) => d.path,
      getColor: (d) => d.color,
      getWidth: 3,
      widthUnits: "pixels",
      wrapLongitude: !globeMode,
      parameters: {
        depthTest: !!globeMode,
        depthBias: globeMode ? -50.0 : 0,
      } as any,
    }),

    // IconLayer: State-change markers
    new IconLayer<IconDatum>({
      id: `clausal-chain-icons-${globeMode ? "globe" : "merc"}`,
      data: iconData,
      pickable: true,
      getPosition: (d) => [d.position[0], d.position[1], 0],
      getIcon: (d) => getIconName(d.predicate_type),
      getSize: 32,
      sizeUnits: "pixels",
      getColor: (d) => {
        const base = getColorForType(d.predicate_type);
        // Opacity based on confidence
        return [base[0], base[1], base[2], Math.round(base[3] * d.confidence)];
      },
      wrapLongitude: !globeMode,
      parameters: {
        depthTest: !!globeMode,
        depthBias: globeMode ? -49.0 : 0,
      } as any,
      onHover: (info: PickingInfo<IconDatum>) => {
        if (info.object && onHover) {
          const d = info.object;
          const entity = {
            uid: d.uid,
            type: "clausal-state-change",
            callsign: d.reason,
            lat: d.position[1],
            lon: d.position[0],
            altitude: 0,
            course: 0,
            speed: 0,
            lastSeen: Date.now(),
            detail: {
              state_change_reason: d.reason,
              confidence: d.confidence,
            },
          };
          onHover(entity, { x: info.x, y: info.y });
        } else if (onHover) {
          onHover(null, null);
        }
      },
    }),

    // TextLayer: Narrative summary labels
    new TextLayer<TextDatum>({
      id: `clausal-chain-narratives-${globeMode ? "globe" : "merc"}`,
      data: textData,
      pickable: false,
      getPosition: (d) => [d.position[0], d.position[1], 0],
      getText: (d) => d.text,
      getSize: 12,
      getColor: [245, 247, 250, 230],
      getPixelOffset: [8, -8],
      fontFamily: "monospace",
      fontWeight: 400,
      background: true,
      getBackgroundColor: () => [10, 14, 22, 220],
      backgroundPadding: [4, 2],
      getBorderColor: () => [59, 130, 246, 210],
      getBorderWidth: 1,
      billboard: true,
      sizeScale: 1,
      wrapLongitude: !globeMode,
      parameters: {
        depthTest: !!globeMode,
        depthBias: globeMode ? -48.0 : 0,
      } as any,
    }),
  ];
}

import { CoTEntity, DRState, MapFilters, VisualState } from "../types";
import { filterEntity } from "../utils/filters";
import { interpolatePVB } from "../utils/interpolation";

export const STALE_THRESHOLD_AIR_MS = 120_000;
export const STALE_THRESHOLD_SEA_MS = 300_000;

export interface EntityFrameResult {
  interpolated: CoTEntity[];
  staleUids: string[];
  airCount: number;
  seaCount: number;
}

/**
 * Processes all live entities for one animation frame:
 * stale check → filter → interpolate position.
 * Mutates visualState in place (updates VisualState per entity).
 */
export function processEntityFrame(
  entities: Map<string, CoTEntity>,
  drState: Map<string, DRState>,
  visualState: Map<string, VisualState>,
  filters: MapFilters | undefined,
  now: number,
  dt: number,
): EntityFrameResult {
  const staleUids: string[] = [];
  const interpolated: CoTEntity[] = [];
  let airCount = 0;
  let seaCount = 0;

  for (const [uid, entity] of entities) {
    const isShip = entity.type?.includes("S");
    const threshold = isShip
      ? STALE_THRESHOLD_SEA_MS
      : STALE_THRESHOLD_AIR_MS;

    if (now - entity.lastSeen > threshold) {
      staleUids.push(uid);
      continue;
    }

    const entityType = filterEntity(entity, filters);
    if (!entityType) continue;

    if (entityType === "sea") seaCount++;
    else airCount++;

    const dr = drState.get(uid);
    const visual = visualState.get(uid);
    const { visual: newVisual, interpolatedEntity } = interpolatePVB(
      entity,
      dr,
      visual,
      now,
      dt,
    );
    visualState.set(uid, newVisual);
    interpolated.push(interpolatedEntity);
  }

  return { interpolated, staleUids, airCount, seaCount };
}

/**
 * Processes replay entities for one animation frame:
 * filter only (no interpolation — replay uses static snapshots).
 */
export function processReplayFrame(
  replayEntities: Map<string, CoTEntity>,
  filters: MapFilters | undefined,
): Pick<EntityFrameResult, "interpolated" | "airCount" | "seaCount"> {
  const interpolated: CoTEntity[] = [];
  let airCount = 0;
  let seaCount = 0;

  for (const [, entity] of replayEntities) {
    const entityType = filterEntity(entity, filters);
    if (!entityType) continue;
    if (entityType === "sea") seaCount++;
    else airCount++;
    interpolated.push(entity);
  }

  return { interpolated, airCount, seaCount };
}

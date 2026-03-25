import { CoTEntity, DRState, MapFilters, VisualState } from "../types";
import { filterSatellite } from "../utils/filters";
import { interpolatePVB } from "../utils/interpolation";

/**
 * Interpolates all visible satellites for one animation frame.
 * Mutates visualState in place (updates VisualState per satellite).
 * Returns the interpolated satellite entities that passed the filter.
 */
export function processSatelliteFrame(
  satellites: Map<string, CoTEntity>,
  drState: Map<string, DRState>,
  visualState: Map<string, VisualState>,
  filters: MapFilters | undefined,
  now: number,
  dt: number,
): CoTEntity[] {
  const filteredSatellites: CoTEntity[] = [];

  for (const [uid, sat] of satellites) {
    if (!filterSatellite(sat, filters)) continue;

    const dr = drState.get(uid);
    const visual = visualState.get(uid);
    const { visual: newVisual, interpolatedEntity } = interpolatePVB(
      sat,
      dr,
      visual,
      now,
      dt,
    );
    visualState.set(uid, newVisual);
    filteredSatellites.push(interpolatedEntity);
  }

  return filteredSatellites;
}

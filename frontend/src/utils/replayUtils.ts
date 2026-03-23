import { CoTEntity } from "../types";

/**
 * Processes raw replay data into a map of entities, each containing a time-sorted list of snapshots.
 *
 * @param data The raw array of track points from the API.
 * @returns A Map where the key is the entity UID and the value is an array of CoTEntity snapshots sorted by time.
 */
interface ReplayPoint {
  uid?: string;
  entity_id?: string;
  lat: number;
  lon: number;
  hae?: number;
  alt?: number;
  type?: string;
  course?: number;
  heading?: number;
  speed?: number;
  callsign?: string;
  time?: number | string;
  meta?: string | Record<string, unknown>;
}

export function processReplayData(
  data: ReplayPoint[],
): Map<string, CoTEntity[]> {
  const cache = new Map<string, CoTEntity[]>();

  data.forEach((pt: ReplayPoint) => {
    // Convert DB row to CoTEntity partial
    // Note: DB returns snake_case, CoTEntity is strict.
    // We need manual mapping.

    // Parse meta safely
    let meta: Record<string, unknown> = {};
    try {
      meta = typeof pt.meta === "string" ? JSON.parse(pt.meta) : pt.meta || {};
    } catch {
      /* ignore */
    }

    const cls = (meta.classification ?? {}) as Record<string, unknown>;
    // Ships: CoT type contains 'S'; classification lives in vesselClassification.
    // Aircraft: CoT type contains 'A' (and not 'S'); classification lives in classification.
    const resolvedUid = pt.uid || pt.entity_id;
    if (!resolvedUid) return;

    const resolvedType = pt.type || "a-f-G";
    const isShip = resolvedType.includes("S");
    const resolvedTime =
      typeof pt.time === "number"
        ? pt.time
        : typeof pt.time === "string"
          ? Date.parse(pt.time)
          : Date.now();

    const entity: CoTEntity = {
      uid: resolvedUid,
      type: resolvedType,
      lat: pt.lat,
      lon: pt.lon,
      altitude: pt.alt ?? pt.hae ?? 0,
      speed: pt.speed ?? 0,
      course: pt.heading ?? pt.course ?? 0,
      callsign: (meta.callsign as string) || pt.callsign || resolvedUid,
      time: resolvedTime,
      lastSeen: resolvedTime,
      trail: [], // Replay doesn't need trails yet or we can generate them
      uidHash: 0, // Will be computed by map
      // Map meta.classification into the correct top-level field so that
      // filterEntity() in useAnimationLoop can apply category filters in replay.
      vesselClassification:
        isShip && typeof cls.category === "string"
          ? { category: cls.category }
          : undefined,
      classification: !isShip && Object.keys(cls).length > 0 ? cls : undefined,
    };

    if (!cache.has(entity.uid)) cache.set(entity.uid, []);
    cache.get(entity.uid)?.push(entity);
  });

  // The backend now returns rows ORDER BY time DESC (newest first) so that the
  // LIMIT always preserves the most recent data rather than the oldest.  Each
  // entity list must be sorted ascending here so that the binary search in
  // updateReplayFrame finds the correct snapshot for a given playback time.
  for (const history of cache.values()) {
    history.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  }

  return cache;
}

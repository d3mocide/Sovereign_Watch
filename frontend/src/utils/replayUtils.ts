import { CoTEntity } from '../types';

/**
 * Processes raw replay data into a map of entities, each containing a time-sorted list of snapshots.
 *
 * @param data The raw array of track points from the API.
 * @returns A Map where the key is the entity UID and the value is an array of CoTEntity snapshots sorted by time.
 */
export function processReplayData(data: any[]): Map<string, CoTEntity[]> {
  const cache = new Map<string, CoTEntity[]>();

  data.forEach((pt: any) => {
    // Convert DB row to CoTEntity partial
    // Note: DB returns snake_case, CoTEntity is strict.
    // We need manual mapping.

    // Parse meta safely
    let meta: any = {};
    try {
      meta = typeof pt.meta === 'string' ? JSON.parse(pt.meta) : pt.meta || {};
    } catch { /* ignore */ }

    const cls = meta.classification || {};
    // Ships: CoT type contains 'S'; classification lives in vesselClassification.
    // Aircraft: CoT type contains 'A' (and not 'S'); classification lives in classification.
    const isShip = (pt.type as string)?.includes('S');

    const entity: CoTEntity = {
      uid: pt.entity_id,
      type: pt.type,
      lat: pt.lat,
      lon: pt.lon,
      altitude: pt.alt,
      speed: pt.speed,
      course: pt.heading,
      callsign: meta.callsign || pt.entity_id,
      time: Date.parse(pt.time),
      lastSeen: Date.parse(pt.time),
      trail: [], // Replay doesn't need trails yet or we can generate them
      uidHash: 0, // Will be computed by map
      // Map meta.classification into the correct top-level field so that
      // filterEntity() in useAnimationLoop can apply category filters in replay.
      vesselClassification: isShip && cls.category ? { category: cls.category } : undefined,
      classification: !isShip && Object.keys(cls).length > 0 ? cls : undefined,
    };

    if (!cache.has(entity.uid)) cache.set(entity.uid, []);
    cache.get(entity.uid)?.push(entity);
  });

  // Note: Data from backend is already sorted by time (ORDER BY time ASC).
  // Since we push to entity lists in order, each entity list is naturally sorted.
  // No need for client-side sorting.

  return cache;
}

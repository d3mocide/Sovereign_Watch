export type TrailPoint = [number, number, number, number]; // [lon, lat, altitude, speed]

export type CoTEntity = {
    uid: string;
    lat: number;
    lon: number;
    altitude: number; // Height Above Ellipsoid in meters (0 for ships)
    type: string;
    course: number;
    speed: number;
    callsign: string;
    time?: number; // Source Timestamp
    lastSeen: number; // Timestamp for staleness check
    trail: TrailPoint[]; // Position history for trail lines
    uidHash: number; // Pre-computed phase offset for glow animation (avoids per-frame string ops)
    detail?: Record<string, unknown>; // For extra properties that might be passed from the worker
    lastSourceTime?: number; // Latest timestamp from source (for ordering)
};

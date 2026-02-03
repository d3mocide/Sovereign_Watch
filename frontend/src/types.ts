export type TrailPoint = [number, number]; // [lon, lat]

export type CoTEntity = {
    uid: string;
    lat: number;
    lon: number;
    type: string;
    course: number;
    speed: number;
    callsign: string;
    lastSeen: number; // Timestamp for staleness check
    trail: TrailPoint[]; // Position history for trail lines
    detail?: any; // For extra properties that might be passed from the worker
};

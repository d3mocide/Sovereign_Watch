export type TrailPoint = [number, number, number, number, number?]; // [lon, lat, altitude, speed, timestamp?]

export type CoTEntity = {
    uid: string;
    lat: number;
    lon: number;
    altitude: number; // Height Above Ellipsoid in meters (0 for ships)
    type: string;
    course: number;
    speed: number;
    vspeed?: number;
    callsign: string;
    time?: number; // Source Timestamp
    lastSeen: number; // Timestamp for staleness check
    trail: TrailPoint[]; // Position history for trail lines
    uidHash: number; // Pre-computed phase offset for glow animation (avoids per-frame string ops)
    detail?: Record<string, unknown>; // For extra properties that might be passed from the worker
    lastSourceTime?: number; // Latest timestamp from source (for ordering)
    classification?: EntityClassification;
    vesselClassification?: VesselClassification;
};

export interface VesselClassification {
    category?: string;
    shipType?: number;
    navStatus?: number;
    hazardous?: boolean;
    stationType?: string;
    flagMid?: number;
    imo?: number;
    callsign?: string;
    destination?: string;
    draught?: number;
    length?: number;
    beam?: number;
}

export interface EntityClassification {
    affiliation?: string;
    platform?: string;
    sizeClass?: string;
    icaoType?: string;
    category?: string;
    dbFlags?: number;
    operator?: string;
    registration?: string;
    description?: string;
    squawk?: string;
    emergency?: string;
}

export interface IntelEvent {
    id: string;
    time: Date;
    type: 'new' | 'lost' | 'alert';
    message: string;
    entityType?: 'air' | 'sea' | 'orbital';
    classification?: EntityClassification;
}

export interface MissionLocation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radius_nm: number;
  created_at: string;
}

export interface MissionProps {
    savedMissions: MissionLocation[];
    currentMission: { lat: number; lon: number; radius_nm: number; } | null;
    onSwitchMission: (mission: MissionLocation) => void;
    onDeleteMission: (id: string) => void;
    onPresetSelect: (radius: number) => void;
}

export interface MapActions {
    flyTo: (lat: number, lon: number, zoom?: number) => void;
    fitBounds: (bounds: [[number, number], [number, number]]) => void;
    searchLocal: (query: string) => CoTEntity[];
    onEntityLiveUpdate?: (entity: CoTEntity) => void;
}

export interface MapFilters {
    showAir: boolean;
    showSea: boolean;
    showHelicopter: boolean;
    showMilitary: boolean;
    showGovernment: boolean;
    showCommercial: boolean;
    showPrivate: boolean;
    [key: string]: boolean | undefined;
}

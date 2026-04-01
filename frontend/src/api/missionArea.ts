export interface MissionAreaConfig {
  lat: number;
  lon: number;
  radius_nm: number;
}

export interface MissionAreaResponse extends MissionAreaConfig {
  updated_at: string | null;
}

const MISSION_CACHE_TTL_MS = 5000;
const MISSION_PERSISTED_CACHE_TTL_MS = 60000;
const MISSION_CACHE_STORAGE_KEY = "sw_mission_area_cache";
let missionCache: MissionAreaResponse | null = null;
let missionCacheTs = 0;
let missionRequestInFlight: Promise<MissionAreaResponse> | null = null;

function hydrateMissionCacheFromStorage(): void {
  try {
    const raw = window.localStorage.getItem(MISSION_CACHE_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw) as {
      mission: MissionAreaResponse;
      ts: number;
    };

    if (!parsed?.mission || typeof parsed.ts !== "number") {
      return;
    }

    const ageMs = Date.now() - parsed.ts;
    if (ageMs <= MISSION_PERSISTED_CACHE_TTL_MS) {
      missionCache = parsed.mission;
      missionCacheTs = parsed.ts;
    }
  } catch {
    // Ignore malformed cache payloads.
  }
}

function persistMissionCache(mission: MissionAreaResponse): void {
  try {
    window.localStorage.setItem(
      MISSION_CACHE_STORAGE_KEY,
      JSON.stringify({ mission, ts: Date.now() }),
    );
  } catch {
    // Ignore storage quota or private-mode errors.
  }
}

/**
 * Update the active surveillance area.
 * Triggers real-time poller pivot via Redis pub/sub.
 */
export async function setMissionArea(config: MissionAreaConfig): Promise<MissionAreaResponse> {
  const response = await fetch('/api/config/location', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to update mission area' }));
    throw new Error(error.detail || 'Failed to update mission area');
  }

  const data = await response.json();
  missionCache = data.active_mission;
  missionCacheTs = Date.now();
  persistMissionCache(data.active_mission);
  return data.active_mission;
}

/**
 * Retrieve the current active surveillance area.
 */
export async function getMissionArea(): Promise<MissionAreaResponse> {
  if (!missionCache) {
    hydrateMissionCacheFromStorage();
  }

  const now = Date.now();
  if (missionCache && now - missionCacheTs < MISSION_CACHE_TTL_MS) {
    return missionCache;
  }

  if (missionRequestInFlight) {
    return missionRequestInFlight;
  }

  missionRequestInFlight = fetch('/api/config/location')
    .then(async (response) => {
      if (!response.ok) {
        throw new Error('Failed to fetch mission area');
      }

      const mission = (await response.json()) as MissionAreaResponse;
      missionCache = mission;
      missionCacheTs = Date.now();
      persistMissionCache(mission);
      return mission;
    })
    .finally(() => {
      missionRequestInFlight = null;
    });

  return missionRequestInFlight;
}

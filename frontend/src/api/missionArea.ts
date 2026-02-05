const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface MissionAreaConfig {
  lat: number;
  lon: number;
  radius_nm: number;
}

export interface MissionAreaResponse extends MissionAreaConfig {
  updated_at: string | null;
}

/**
 * Update the active surveillance area.
 * Triggers real-time poller pivot via Redis pub/sub.
 */
export async function setMissionArea(config: MissionAreaConfig): Promise<MissionAreaResponse> {
  const response = await fetch(`${API_BASE}/api/config/location`, {
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
  return data.active_mission;
}

/**
 * Retrieve the current active surveillance area.
 */
export async function getMissionArea(): Promise<MissionAreaResponse> {
  const response = await fetch(`${API_BASE}/api/config/location`);

  if (!response.ok) {
    throw new Error('Failed to fetch mission area');
  }

  return response.json();
}

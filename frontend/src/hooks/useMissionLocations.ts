import { useState, useEffect } from 'react';

export interface MissionLocation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radius_nm: number;
  created_at: string;
}

const STORAGE_KEY = 'sovereign_mission_locations';
const MAX_SAVED_MISSIONS = 50;

export const useMissionLocations = () => {
  const [savedMissions, setSavedMissions] = useState<MissionLocation[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSavedMissions(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load saved missions:', error);
    }
  }, []);

  // Persist to localStorage whenever missions change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedMissions));
    } catch (error) {
      console.error('Failed to save missions:', error);
    }
  }, [savedMissions]);

  const saveMission = (mission: Omit<MissionLocation, 'id' | 'created_at'>) => {
    const newMission: MissionLocation = {
      ...mission,
      id: `mission-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      created_at: new Date().toISOString(),
    };

    setSavedMissions((prev) => {
      const updated = [newMission, ...prev];
      // Enforce limit
      return updated.slice(0, MAX_SAVED_MISSIONS);
    });

    return newMission;
  };

  const deleteMission = (id: string) => {
    setSavedMissions((prev) => prev.filter((m) => m.id !== id));
  };

  const updateMission = (id: string, updates: Partial<Omit<MissionLocation, 'id' | 'created_at'>>) => {
    setSavedMissions((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
  };

  return {
    savedMissions,
    saveMission,
    deleteMission,
    updateMission,
  };
};

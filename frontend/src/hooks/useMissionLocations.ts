import { useState, useEffect, useCallback } from 'react';
import { MissionLocation } from '../types';

const STORAGE_KEY = 'sovereign_mission_locations';
const MAX_SAVED_MISSIONS = 50;

export const useMissionLocations = () => {
  const [savedMissions, setSavedMissions] = useState<MissionLocation[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load saved missions:', error);
      return [];
    }
  });

  // Persist to localStorage whenever missions change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedMissions));
    } catch (error) {
      console.error('Failed to save missions:', error);
    }
  }, [savedMissions]);

  const saveMission = useCallback((mission: Omit<MissionLocation, 'id' | 'created_at'>) => {
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
  }, []);

  const deleteMission = useCallback((id: string) => {
    setSavedMissions((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const updateMission = useCallback((id: string, updates: Partial<Omit<MissionLocation, 'id' | 'created_at'>>) => {
    setSavedMissions((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
  }, []);

  return {
    savedMissions,
    saveMission,
    deleteMission,
    updateMission,
  };
};

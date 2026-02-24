import { useState, useEffect, useCallback } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { CoTEntity, MissionProps } from "../types";
import { useMissionLocations } from "./useMissionLocations";
import { setMissionArea, getMissionArea } from "../api/missionArea";
import { calculateZoom } from "../utils/map/geoUtils";

interface UseMissionAreaOptions {
  mapRef: React.RefObject<MapRef>;
  currentMissionRef: React.MutableRefObject<{
    lat: number;
    lon: number;
    radius_nm: number;
  } | null>;
  entitiesRef: React.MutableRefObject<Map<string, CoTEntity>>;
  knownUidsRef: React.MutableRefObject<Set<string>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prevCourseRef: React.MutableRefObject<Map<string, any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drStateRef: React.MutableRefObject<Map<string, any>>;
  visualStateRef: React.MutableRefObject<
    Map<string, { lon: number; lat: number; alt: number }>
  >;
  countsRef: React.MutableRefObject<{ air: number; sea: number; orbital: number }>;
  onCountsUpdate: ((counts: { air: number; sea: number; orbital: number }) => void) | undefined;
  onEntitySelect: (entity: CoTEntity | null) => void;
  onMissionPropsReady: ((props: MissionProps) => void) | undefined;
  initialLat: number;
  initialLon: number;
}

export function useMissionArea({
  mapRef,
  currentMissionRef,
  entitiesRef,
  knownUidsRef,
  prevCourseRef,
  drStateRef,
  visualStateRef,
  countsRef,
  onCountsUpdate,
  onEntitySelect,
  onMissionPropsReady,
  initialLat,
  initialLon,
}: UseMissionAreaOptions) {
  const { savedMissions, saveMission, deleteMission } = useMissionLocations();

  const [currentMission, setCurrentMission] = useState<{
    lat: number;
    lon: number;
    radius_nm: number;
  } | null>(null);

  // AOT Area States (for Deck.gl layers)
  const [aotShapes, setAotShapes] = useState<{
    maritime: number[][];
    aviation: number[][];
  } | null>(null);

  // Save form state
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveFormCoords, setSaveFormCoords] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

  // Update AOT Geometry when mission changes
  useEffect(() => {
    const targetLat = currentMission?.lat ?? initialLat;
    const targetLon = currentMission?.lon ?? initialLon;
    const radiusNm =
      currentMission?.radius_nm ??
      parseInt(import.meta.env.VITE_COVERAGE_RADIUS_NM || "150");

    const NM_TO_DEG = 1 / 60;
    const cosLat = Math.cos(targetLat * (Math.PI / 180));
    const safeCosLat = Math.max(Math.abs(cosLat), 0.0001);

    // Maritime Box (only if actual mission exists)
    const maritime = currentMission
      ? [
          [
            targetLon - (radiusNm * NM_TO_DEG) / safeCosLat,
            targetLat - radiusNm * NM_TO_DEG,
          ],
          [
            targetLon + (radiusNm * NM_TO_DEG) / safeCosLat,
            targetLat - radiusNm * NM_TO_DEG,
          ],
          [
            targetLon + (radiusNm * NM_TO_DEG) / safeCosLat,
            targetLat + radiusNm * NM_TO_DEG,
          ],
          [
            targetLon - (radiusNm * NM_TO_DEG) / safeCosLat,
            targetLat + radiusNm * NM_TO_DEG,
          ],
          [
            targetLon - (radiusNm * NM_TO_DEG) / safeCosLat,
            targetLat - radiusNm * NM_TO_DEG,
          ],
        ]
      : [];

    // Aviation Circle
    const aviation: number[][] = [];
    for (let i = 0; i <= 64; i++) {
      const angle = (i / 64) * 2 * Math.PI;
      const dLat = radiusNm * NM_TO_DEG * Math.cos(angle);
      const dLon = ((radiusNm * NM_TO_DEG) / safeCosLat) * Math.sin(angle);
      aviation.push([targetLon + dLon, targetLat + dLat]);
    }

    setAotShapes({ maritime, aviation });
  }, [currentMission, initialLat, initialLon]);

  const handleSetFocus = useCallback(
    async (lat: number, lon: number, radius?: number) => {
      try {
        // Use provided radius, or fallback to current/default
        const targetRadius =
          radius ||
          currentMissionRef.current?.radius_nm ||
          parseInt(import.meta.env.VITE_COVERAGE_RADIUS_NM || "150");
        await setMissionArea({ lat, lon, radius_nm: targetRadius });
        setCurrentMission({ lat, lon, radius_nm: targetRadius });

        // Clear old entities when changing mission area
        entitiesRef.current.clear();
        console.log("🗑️ Cleared old entities for new mission area");

        // Fly map to new location
        if (mapRef.current) {
          mapRef.current.flyTo({
            center: [lon, lat],
            zoom: calculateZoom(targetRadius),
            duration: 2000,
            easing: (t: number) => 1 - Math.pow(1 - t, 3),
          });
        }

        console.log(
          `📍 Mission area pivoted to: ${lat.toFixed(4)}, ${lon.toFixed(4)} @ ${targetRadius}nm`,
        );
      } catch (error) {
        console.error("Failed to set mission focus:", error);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handlePresetSelect = useCallback(
    async (radius: number) => {
      const mission = currentMissionRef.current;
      if (!mission) return;

      await handleSetFocus(mission.lat, mission.lon, radius);
    },
    [handleSetFocus],
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSwitchMission = useCallback(
    async (mission: any) => {
      await handleSetFocus(mission.lat, mission.lon, mission.radius_nm);
      // setCurrentMission is now handled inside handleSetFocus to ensure sync
    },
    [handleSetFocus],
  );

  // Expose mission management to parent
  useEffect(() => {
    if (onMissionPropsReady) {
      onMissionPropsReady({
        savedMissions,
        currentMission,
        onSwitchMission: handleSwitchMission,
        onDeleteMission: deleteMission,
        onPresetSelect: handlePresetSelect,
      });
    }
  }, [
    savedMissions,
    currentMission,
    onMissionPropsReady,
    handleSwitchMission,
    deleteMission,
    handlePresetSelect,
  ]);

  // Load active mission state on mount and poll for updates
  useEffect(() => {
    const loadActiveMission = async () => {
      try {
        const mission = await getMissionArea();
        if (mission && mission.lat && mission.lon) {
          // Only update if mission has actually changed to prevent map resets/clears
          const prev = currentMissionRef.current;
          // Add tolerance for floating point drift to prevent constant clearing
          const isDiff =
            !prev ||
            Math.abs(prev.lat - mission.lat) > 0.0001 ||
            Math.abs(prev.lon - mission.lon) > 0.0001 ||
            Math.abs(prev.radius_nm - mission.radius_nm) > 0.1;

          if (isDiff) {
            console.log("🔄 Syncing with active mission:", mission);
            // Update state (this will trigger the clear effect below)
            setCurrentMission({
              lat: mission.lat,
              lon: mission.lon,
              radius_nm: mission.radius_nm,
            });

            // Sync map view to active mission (Only on actual change)
            if (mapRef.current) {
              mapRef.current.flyTo({
                center: [mission.lon, mission.lat],
                zoom: calculateZoom(mission.radius_nm),
                duration: 2000,
                easing: (t: number) => 1 - Math.pow(1 - t, 3),
              });
            }
          }
        }
      } catch (err) {
        console.warn("Failed to load active mission:", err);
      }
    };
    loadActiveMission();
    // Poll every 2 seconds for external updates
    const timer = setInterval(loadActiveMission, 2000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear entities when mission area changes (New Selection, Preset, or External Update)
  useEffect(() => {
    if (currentMission) {
      // Update ref for polling comparison
      currentMissionRef.current = currentMission;

      console.log("🧹 Clearing map entities for new mission parameters...");
      entitiesRef.current.clear();
      knownUidsRef.current.clear();
      prevCourseRef.current.clear();
      drStateRef.current.clear();
      visualStateRef.current.clear();
      countsRef.current = { air: 0, sea: 0, orbital: 0 };
      onCountsUpdate?.({ air: 0, sea: 0, orbital: 0 });

      // Clear selection to avoid ghost trails
      onEntitySelect(null);
    }
  }, [currentMission, onCountsUpdate, onEntitySelect]);

  const handleReturnHome = useCallback(async () => {
    const defaultLat = parseFloat(import.meta.env.VITE_CENTER_LAT || "45.5152");
    const defaultLon = parseFloat(
      import.meta.env.VITE_CENTER_LON || "-122.6784",
    );
    const defaultRadius = parseInt(
      import.meta.env.VITE_COVERAGE_RADIUS_NM || "150",
    );

    await handleSetFocus(defaultLat, defaultLon, defaultRadius);
  }, [handleSetFocus]);

  const handleSaveFormSubmit = useCallback(
    (name: string, radius: number) => {
      if (!saveFormCoords) return;
      saveMission({
        name,
        lat: saveFormCoords.lat,
        lon: saveFormCoords.lon,
        radius_nm: radius,
      });
      setShowSaveForm(false);
      setSaveFormCoords(null);
    },
    [saveFormCoords, saveMission],
  );

  const handleSaveFormCancel = useCallback(() => {
    setShowSaveForm(false);
    setSaveFormCoords(null);
  }, []);

  return {
    currentMission,
    aotShapes,
    savedMissions,
    saveMission,
    deleteMission,
    handleSetFocus,
    handleSwitchMission,
    handlePresetSelect,
    handleReturnHome,
    showSaveForm,
    setShowSaveForm,
    saveFormCoords,
    setSaveFormCoords,
    handleSaveFormSubmit,
    handleSaveFormCancel,
  };
}

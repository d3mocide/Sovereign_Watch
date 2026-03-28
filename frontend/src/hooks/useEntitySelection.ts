import { useCallback, useRef, useState } from "react";
import type { CoTEntity, HistorySegment, IntelEvent } from "../types";

export function useEntitySelection(
  addEvent: (e: Omit<IntelEvent, "id" | "time">) => void,
) {
  const [selectedEntity, setSelectedEntity] = useState<CoTEntity | null>(null);
  const [historySegments, setHistorySegments] = useState<HistorySegment[]>([]);
  const [followMode, setFollowMode] = useState(false);

  // Live satellite entity map exposed from OrbitalMap's entity worker.
  // Keyed as "SAT-<NORAD_ID>" — same as the CoT UID used by the backend.
  const orbitalSatellitesRef = useRef<
    | import("react").MutableRefObject<Map<string, CoTEntity>>
    | null
  >(null);

  const selectedSatNorad = selectedEntity?.uid
    ? parseInt(selectedEntity.uid.replace(/\D/g, ""), 10) || null
    : null;

  const handleSetSelectedSatNorad = useCallback(
    (noradId: number | null) => {
      if (noradId) {
        const liveKey = `SAT-${noradId}`;
        const liveEntity = orbitalSatellitesRef.current?.current.get(liveKey);

        if (liveEntity) {
          setSelectedEntity(liveEntity);
        } else {
          // Entity not yet in the live map — use a minimal stub so the sidebar
          // can still show NORAD ID + pass geometry before the first CoT tick.
          setSelectedEntity({
            uid: liveKey,
            type: "a-s-K",
            callsign: `NORAD ${noradId}`,
            lat: 0,
            lon: 0,
            altitude: 0,
            course: 0,
            speed: 0,
            lastSeen: Date.now(),
            trail: [],
            uidHash: 0,
          } as CoTEntity);
        }
      } else {
        setSelectedEntity(null);
      }
    },
    [],
  );

  const handleEntitySelect = useCallback(
    (e: CoTEntity | null) => {
      setSelectedEntity(e);
      setHistorySegments([]);
      setFollowMode(false);

      if (e && (e.type === "a-s-K" || e.detail?.category)) {
        addEvent({
          type: "new",
          message: `${(e.callsign || e.uid).replace(/\s*\(.*?\)/g, "")}`,
          entityType: "orbital",
          classification: {
            ...e.classification,
            category: String(e.detail?.category || "Orbital Asset"),
          },
        });
      }
    },
    [addEvent],
  );

  const handleEntityLiveUpdate = useCallback((e: CoTEntity) => {
    setSelectedEntity(e);
  }, []);

  return {
    selectedEntity,
    setSelectedEntity,
    historySegments,
    setHistorySegments,
    followMode,
    setFollowMode,
    orbitalSatellitesRef,
    selectedSatNorad,
    handleEntitySelect,
    handleEntityLiveUpdate,
    handleSetSelectedSatNorad,
  };
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { parseMissionHash, updateMissionHash } from "./useMissionHash";
import type { IntelEvent, MapFilters, RFMode } from "../types";

const DEFAULT_FILTERS: MapFilters = {
  showAir: true,
  showSea: true,
  showHelicopter: true,
  showCommercial: true,
  showPrivate: true,
  showMilitary: true,
  showGovernment: true,
  showCargo: true,
  showTanker: true,
  showPassenger: true,
  showFishing: true,
  showSeaMilitary: true,
  showLawEnforcement: true,
  showSar: true,
  showTug: true,
  showPleasure: true,
  showHsc: true,
  showPilot: true,
  showSpecial: true,
  showDrone: true,
  showSatellites: false,
  showSatGPS: true,
  showSatWeather: false,
  showSatComms: false,
  showSatSurveillance: true,
  showSatOther: true,
  showSatNOGS: false,
  showRepeaters: false,
  showHam: true,
  showNoaa: true,
  showPublicSafety: true,
  rfRadius: 300,
  rfEmcommOnly: false,
  showCables: false,
  showLandingStations: false,
  showOutages: true,
  showTowers: false,
  showIXPs: false,
  showFacilities: false,
  showISS: true,
  cableOpacity: 0.6,
  showConstellation_Starlink: false,
  showH3Coverage: false,
  showH3Risk: false,
  showAurora: false,
  showJamming: true,
  showGdelt: false,
  showGdeltLabels: false,
  showTerminator: true,
  showHoldingPatterns: true,
};

const DEFAULT_ORBITAL_SAT_FILTERS = {
  showSatGPS: true,
  showSatWeather: false,
  showSatComms: true,
  showSatSurveillance: true,
  showSatOther: true,
  showSatNOGS: true,
  showAurora: true,
  showJamming: true,
  showConstellation_Starlink: false,
};

function initFilters(): MapFilters {
  const hashState = parseMissionHash();
  if (hashState.activeLayers.length > 0) {
    const hashFilters = { ...DEFAULT_FILTERS };
    hashFilters.showAir = false;
    hashFilters.showSea = false;
    hashFilters.showSatellites = false;
    hashFilters.showRepeaters = false;
    hashFilters.showCables = false;
    hashState.activeLayers.forEach((layer) => {
      if (layer in hashFilters) {
        (hashFilters as Record<string, unknown>)[layer] = true;
      }
    });
    return hashFilters;
  }
  const saved = localStorage.getItem("mapFilters");
  if (saved) {
    try {
      return { ...DEFAULT_FILTERS, ...JSON.parse(saved) };
    } catch {
      // fall through to default
    }
  }
  return DEFAULT_FILTERS;
}

function initOrbitalSatFilters(): typeof DEFAULT_ORBITAL_SAT_FILTERS {
  const saved = localStorage.getItem("orbitalSatFilters");
  if (saved) {
    try {
      return { ...DEFAULT_ORBITAL_SAT_FILTERS, ...JSON.parse(saved) };
    } catch {
      // fall through to default
    }
  }
  return DEFAULT_ORBITAL_SAT_FILTERS;
}

export function useAppFilters(
  addEvent: (e: Omit<IntelEvent, "id" | "time">) => void,
) {
  const [filters, setFilters] = useState<MapFilters>(initFilters);
  const [orbitalSatFilters, setOrbitalSatFilters] =
    useState(initOrbitalSatFilters);

  const [showVelocityVectors, setShowVelocityVectors] = useState(() => {
    const saved = localStorage.getItem("showVelocityVectors");
    return saved !== null ? JSON.parse(saved) : false;
  });

  const [showHistoryTails, setShowHistoryTails] = useState(() => {
    const saved = localStorage.getItem("showHistoryTails");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [globeMode, setGlobeMode] = useState(() => {
    const saved = localStorage.getItem("globeMode");
    return saved !== null ? JSON.parse(saved) : false;
  });

  const [showTerminator, setShowTerminator] = useState(() => {
    const saved = localStorage.getItem("showTerminator");
    return saved !== null ? JSON.parse(saved) : true;
  });

  // Sync filters to hash on change
  useEffect(() => {
    updateMissionHash(undefined, filters);
  }, [filters]);

  const handleFilterChange = useCallback(
    (key: string, value: boolean) => {
      setFilters((prev: MapFilters) => {
        const next = { ...prev, [key]: value };
        localStorage.setItem("mapFilters", JSON.stringify(next));

        if (prev[key] !== value) {
          if (key === "showAir") {
            addEvent({
              message: value
                ? "Aviation Tracking Uplink Established"
                : "Aviation Tracking Offline",
              type: value ? "new" : "lost",
              entityType: "air",
            });
          } else if (key === "showSea") {
            addEvent({
              message: value
                ? "Maritime AIS Ingestion Subsystem Active"
                : "Maritime AIS Ingestion Offline",
              type: value ? "new" : "lost",
              entityType: "sea",
            });
          } else if (key === "showSatellites") {
            addEvent({
              message: value
                ? "Orbital Surveillance Network Synchronized"
                : "Orbital Surveillance Network Offline",
              type: value ? "new" : "lost",
              entityType: "orbital",
            });
          }
        }

        return next;
      });
    },
    [addEvent],
  );

  const handleOrbitalFilterChange = useCallback(
    (key: string, value: unknown) => {
      setOrbitalSatFilters((prev: Record<string, unknown>) => {
        const next = { ...prev, [key]: value };
        localStorage.setItem("orbitalSatFilters", JSON.stringify(next));
        return next as typeof DEFAULT_ORBITAL_SAT_FILTERS;
      });
    },
    [],
  );

  const handleVelocityVectorToggle = useCallback(() => {
    setShowVelocityVectors((prev: boolean) => {
      const next = !prev;
      localStorage.setItem("showVelocityVectors", JSON.stringify(next));
      return next;
    });
  }, []);

  const handleHistoryTailsToggle = useCallback(() => {
    setShowHistoryTails((prev: boolean) => {
      const next = !prev;
      localStorage.setItem("showHistoryTails", JSON.stringify(next));
      return next;
    });
  }, []);

  const handleGlobeModeToggle = useCallback(() => {
    setGlobeMode((prev: boolean) => {
      const next = !prev;
      localStorage.setItem("globeMode", JSON.stringify(next));
      return next;
    });
  }, []);

  const handleTerminatorToggle = useCallback(() => {
    setShowTerminator((prev: boolean) => {
      const next = !prev;
      localStorage.setItem("showTerminator", JSON.stringify(next));
      return next;
    });
  }, []);

  const orbitalFilters: MapFilters = useMemo(
    () => ({
      ...filters,
      ...orbitalSatFilters,
      showAir: false,
      showSea: false,
      showHelicopter: false,
      showMilitary: false,
      showGovernment: false,
      showCommercial: false,
      showPrivate: false,
      showCargo: false,
      showTanker: false,
      showPassenger: false,
      showFishing: false,
      showSeaMilitary: false,
      showLawEnforcement: false,
      showSar: false,
      showTug: false,
      showPleasure: false,
      showHsc: false,
      showPilot: false,
      showSpecial: false,
      showDrone: false,
      showSatellites: true,
      showRepeaters: false,
      showTerminator: showTerminator,
      showCables: false,
      showLandingStations: false,
      showOutages: false,
    }),
    [filters, orbitalSatFilters, showTerminator],
  );

  const tacticalFilters = useMemo(
    () => ({ ...filters, showTerminator }),
    [filters, showTerminator],
  );

  const activeServices = useMemo(() => {
    const list: string[] = [];
    if (filters.showHam !== false) list.push("ham");
    if (filters.showNoaa !== false) list.push("noaa_nwr");
    if (filters.showPublicSafety !== false) list.push("public_safety");
    return list;
  }, [filters.showHam, filters.showNoaa, filters.showPublicSafety]);

  const rfParams = useMemo(
    () => ({
      enabled: filters.showRepeaters === true,
      rfRadius: (filters.rfRadius as unknown as number) || 300,
      rfEmcommOnly: filters.rfEmcommOnly === true,
      modes: filters.modes as unknown as RFMode[] | undefined,
    }),
    [filters.showRepeaters, filters.rfRadius, filters.rfEmcommOnly, filters.modes],
  );

  return {
    filters,
    handleFilterChange,
    orbitalSatFilters,
    handleOrbitalFilterChange,
    showVelocityVectors,
    handleVelocityVectorToggle,
    showHistoryTails,
    handleHistoryTailsToggle,
    globeMode,
    handleGlobeModeToggle,
    showTerminator,
    handleTerminatorToggle,
    orbitalFilters,
    tacticalFilters,
    activeServices,
    rfParams,
  };
}

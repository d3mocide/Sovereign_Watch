import { useCallback, useState } from "react";

type ViewMode = "TACTICAL" | "ORBITAL" | "RADIO" | "DASHBOARD" | "INTEL";

export function useViewMode() {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    const saved = localStorage.getItem("viewMode");
    if (
      saved === "ORBITAL" ||
      saved === "TACTICAL" ||
      saved === "RADIO" ||
      saved === "DASHBOARD" ||
      saved === "INTEL"
    ) {
      return saved as ViewMode;
    }
    return "TACTICAL";
  });

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    localStorage.setItem("viewMode", mode);
  }, []);

  return { viewMode, setViewMode };
}

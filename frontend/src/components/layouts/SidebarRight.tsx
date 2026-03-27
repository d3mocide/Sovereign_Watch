import React from "react";
import { CoTEntity, HistorySegment } from "../../types";
import { AircraftView } from "./sidebar-right/AircraftView";
import { HoldingPatternView } from "./sidebar-right/HoldingPatternView";
import { GdeltView } from "./sidebar-right/GdeltView";
import { InfraView } from "./sidebar-right/InfraView";
import { JammingView } from "./sidebar-right/JammingView";
import { JS8View } from "./sidebar-right/JS8View";
import { RepeaterView } from "./sidebar-right/RepeaterView";
import { SatelliteView } from "./sidebar-right/SatelliteView";
import { ShipView } from "./sidebar-right/ShipView";
import { TowerView } from "./sidebar-right/TowerView";

interface SidebarRightProps {
  entity: CoTEntity | null;
  onClose: () => void;
  onCenterMap?: () => void;
  onOpenAnalystPanel?: () => void;
  onHistoryLoaded?: (segments: HistorySegment[]) => void;
  fetchSatnogsVerification?: (noradId: string) => Promise<any>;
  onPassData?: (
    pass: any,
    nextPassAos?: string,
    nextPassMaxEl?: number,
    satelliteName?: string,
    nextPassDuration?: number,
  ) => void;
}

export const SidebarRight: React.FC<SidebarRightProps> = ({
  entity,
  onClose,
  onCenterMap,
  onOpenAnalystPanel,
  onHistoryLoaded,
  fetchSatnogsVerification,
  onPassData,
}) => {
  if (!entity) return null;

  // Common props shared by all domain views
  const baseProps = { entity, onClose, onCenterMap, onOpenAnalystPanel };

  // Domain-specific early-return routes
  if (entity.type === "sitrep") {
    return null;
  }
  if (entity.type === "hold") {
    return (
      <HoldingPatternView
        key={entity.uid}
        {...baseProps}
        onHistoryLoaded={onHistoryLoaded}
      />
    );
  }
  if (entity.type === "js8") {
    return <JS8View key={entity.uid} {...baseProps} />;
  }
  if (entity.type === "repeater") {
    return <RepeaterView key={entity.uid} {...baseProps} />;
  }
  if (entity.type === "tower") {
    return <TowerView key={entity.uid} {...baseProps} />;
  }
  if (entity.type === "infra") {
    return <InfraView key={entity.uid} {...baseProps} />;
  }
  if (entity.type === "gdelt") {
    return <GdeltView key={entity.uid} {...baseProps} />;
  }
  if (entity.type === "jamming") {
    return <JammingView key={entity.uid} {...baseProps} />;
  }

  // Trackable domain: satellite / ship / aircraft
  const isSat = entity.type === "a-s-K" || entity.type.indexOf("K") === 4;
  const isShip = entity.type.includes("S");

  if (isSat) {
    return (
      <SatelliteView
        key={entity.uid}
        {...baseProps}
        fetchSatnogsVerification={fetchSatnogsVerification}
        onPassData={onPassData}
      />
    );
  }
  if (isShip) {
    return <ShipView key={entity.uid} {...baseProps} />;
  }

  return (
    <AircraftView
      key={entity.uid}
      {...baseProps}
      onHistoryLoaded={onHistoryLoaded}
    />
  );
};

export default SidebarRight;

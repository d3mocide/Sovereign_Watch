import { ScatterplotLayer, PathLayer, IconLayer, LineLayer } from "@deck.gl/layers";
import { CoTEntity } from "../types";
import { entityColor } from "../utils/map/colorUtils";
import { ICON_ATLAS } from "../utils/map/iconAtlas";

export function buildEntityLayers(
  interpolated: CoTEntity[],
  currentSelected: CoTEntity | null,
  globeMode: boolean | undefined,
  enable3d: boolean,
  velocityVectorsEnabled: boolean,
  now: number,
  onEntitySelect: (entity: CoTEntity | null) => void,
  setHoveredEntity: (entity: CoTEntity | null) => void,
  setHoverPosition: (pos: { x: number; y: number } | null) => void,
  selectedEntity: CoTEntity | null,
): any[] {
  const layers: any[] = [];

  // 3. Altitude Stems (leader lines to ground) - 3D Mode only
  if (enable3d) {
    layers.push(
      new LineLayer({
        id: `altitude-stems-${globeMode ? "globe" : "merc"}`,
        data: interpolated.filter((e) => e.altitude > 10), // Only for airborne
        getSourcePosition: (d: CoTEntity) => [d.lon, d.lat, 0],
        getTargetPosition: (d: CoTEntity) => [d.lon, d.lat, d.altitude],
        getColor: (d: CoTEntity) => entityColor(d, 80), // Faint line
        getWidth: 1.5,
        widthMinPixels: 1.5,
        pickable: false,
        parameters: { depthTest: true, depthBias: -1.0 },
      }),
      new ScatterplotLayer({
        id: `ground-shadows-${globeMode ? "globe" : "merc"}`,
        data: interpolated.filter((e) => e.altitude > 10),
        getPosition: (d: CoTEntity) => [d.lon, d.lat, 0],
        getRadius: 3,
        radiusUnits: "pixels" as const,
        getFillColor: (d: CoTEntity) => entityColor(d, 120),
        pickable: false,
        wrapLongitude: true,
        parameters: { depthTest: !!globeMode, depthBias: globeMode ? -195.0 : 0 },
      }),
    );
  }

  // Special Entities Outline/Glow
  layers.push(
    new IconLayer({
      id: `entity-tactical-halo-${globeMode ? "globe" : "merc"}`,
      data: interpolated.filter((d) => {
        const isVessel = d.type.includes("S");
        if (isVessel) {
          return ["sar", "military", "law_enforcement"].includes(
            d.vesselClassification?.category || "",
          );
        } else {
          return (
            ["helicopter", "drone"].includes(d.classification?.platform || "") ||
            ["military", "government"].includes(d.classification?.affiliation || "")
          );
        }
      }),
      getIcon: () => "halo",
      iconAtlas: ICON_ATLAS.url,
      iconMapping: ICON_ATLAS.mapping,
      // Offset removed to prevent near-plane frustum clipping at high zoom in pitch=0 2D mode
      getPosition: (d: CoTEntity) => [d.lon, d.lat, d.altitude || 0],
      getSize: (d: any) => {
        const isSelected = currentSelected?.uid === d.uid;
        const baseSize = 32; // Reduced from 64 to 32 (50% reduction)
        return isSelected ? baseSize * 1.3 : baseSize;
      },
      sizeUnits: "pixels" as const,
      billboard: !!globeMode,
      getColor: [255, 136, 0, 140], // Softer alpha for the redesigned glow
      pickable: false,
      // Wrap longitude breaks billboarding in Globe View
      wrapLongitude: !globeMode,
      // Use depthTest: false to stay on top regardless of terrain/zoom in 2D/3D.
      parameters: { depthTest: false, depthBias: globeMode ? -210.0 : 0 },
      updateTriggers: {
        getSize: [currentSelected?.uid],
        getColor: [now],
      },
    }),
  );

  layers.push(
    new IconLayer({
      id: `heading-arrows-${globeMode ? "globe" : "merc"}`,
      data: interpolated,
      getIcon: (d: CoTEntity) => {
        const isVessel = d.type.includes("S");
        return isVessel ? "vessel" : "aircraft";
      },
      iconAtlas: ICON_ATLAS.url,
      iconMapping: ICON_ATLAS.mapping,
      // removed +2m offset since depthTest=false prevents ground clipping anyway; +2m causes near-plane frustum clipping at High Zoom in 2D
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getPosition: (d: any) => [d.lon, d.lat, d.altitude || 0],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getSize: (d: any) => {
        const isSelected = currentSelected?.uid === d.uid;
        // Bumping marine size to match aircraft prominence
        const baseSize = 32;
        return isSelected ? baseSize * 1.3 : baseSize;
      },
      sizeUnits: "pixels" as const,
      sizeMinPixels: 18, // Slightly larger minimum for tactical awareness
      billboard: !!globeMode,
      // Smoothly interpolate course for rotation (CCW -> CW conversion)
      getAngle: (d: any) => {
        const course = d.course || 0;
        return -course;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getColor: (d: any) => entityColor(d as CoTEntity),
      pickable: true,
      // Wrap longitude breaks billboarding in Globe View
      wrapLongitude: !globeMode,
      // Always disable depthTest for icons to ensure visibility atop terrain/buildings
      parameters: { depthTest: false, depthBias: globeMode ? -210.0 : 0 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onHover: (info: { object?: any; x: number; y: number }) => {
        if (info.object) {
          setHoveredEntity(info.object as CoTEntity);
          setHoverPosition({ x: info.x, y: info.y });
        } else {
          setHoveredEntity(null);
          setHoverPosition(null);
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onClick: (info: { object?: any }) => {
        if (info.object) {
          const entity = info.object as CoTEntity;
          const newSelection =
            selectedEntity?.uid === entity.uid ? null : entity;
          onEntitySelect(newSelection);
        } else {
          onEntitySelect(null);
        }
      },
      updateTriggers: {
        getSize: [currentSelected?.uid],
        getAngle: [now], // Only update on data change, not view bearing
      },
    }),
  );

  layers.push(
    new ScatterplotLayer({
      id: `entity-glow-${globeMode ? "globe" : "merc"}`,
      data: currentSelected
        ? interpolated.filter((e) => e.uid === currentSelected.uid)
        : [],
      getPosition: (d: CoTEntity) => [d.lon, d.lat, d.altitude || 0],
      getRadius: (d: CoTEntity) => {
        const pulse = (Math.sin((now + d.uidHash) / 600) + 1) / 2;
        return 20 * (1 + pulse * 0.1);
      },
      radiusUnits: "pixels" as const,
      getFillColor: (d: CoTEntity) => {
        const pulse = (Math.sin((now + d.uidHash) / 600) + 1) / 2;
        const baseAlpha = 80;
        const a = baseAlpha * (0.7 + pulse * 0.3);
        return entityColor(d, a);
      },
      pickable: false,
      wrapLongitude: true,
      parameters: { depthTest: !!globeMode, depthBias: globeMode ? -210.0 : 0 },
      updateTriggers: { getRadius: [now], getFillColor: [now] },
    }),
  );

  if (currentSelected) {
    layers.push(
      new ScatterplotLayer({
        id: `selection-ring-${currentSelected.uid}-${globeMode ? "globe" : "merc"}`,
        data: interpolated.filter((e) => e.uid === currentSelected.uid),
        getPosition: (d: CoTEntity) => [d.lon, d.lat, d.altitude || 0],
        getRadius: () => {
          const cycle = (now % 2000) / 2000; // Faster pulse (2s)
          return 30 + cycle * 40; // Start larger (30px) to clear icon
        },
        radiusUnits: "pixels" as const,
        getFillColor: [0, 0, 0, 0],
        getLineColor: () => {
          const cycle = (now % 2000) / 2000;
          const alpha = Math.round(255 * (1 - Math.pow(cycle, 2))); // Brighter start
          return entityColor(currentSelected, alpha);
        },
        getLineWidth: 3, // Thicker line
        stroked: true,
        filled: false,
        pickable: false,
        wrapLongitude: true,
        parameters: { depthTest: !!globeMode, depthBias: globeMode ? -210.0 : 0 },
        updateTriggers: { getRadius: [now], getLineColor: [now] },
      }),
    );
  }

  if (velocityVectorsEnabled) {
    layers.push(
      new PathLayer({
        id: `velocity-vectors-${globeMode ? "globe" : "merc"}`,
        data: interpolated
          .filter((e) => e.speed > 0.1)
          .map((d) => {
            const projectionSeconds = 45;
            const distMeters = d.speed * projectionSeconds;
            const courseRad = ((d.course || 0) * Math.PI) / 180;
            const R = 6371000;
            const latRad = (d.lat * Math.PI) / 180;
            const dLat = (distMeters * Math.cos(courseRad)) / R;
            const dLon =
              (distMeters * Math.sin(courseRad)) / (R * Math.cos(latRad));
            const target = [
              d.lon + dLon * (180 / Math.PI),
              d.lat + dLat * (180 / Math.PI),
              d.altitude || 0,
            ];
            return {
              path: [[d.lon, d.lat, d.altitude || 0], target],
              entity: d,
            };
          }),
        getPath: (d: any) => d.path,
        getColor: (d: any) => entityColor(d.entity, 120),
        getWidth: 2.2,
        widthMinPixels: 1.5,
        jointRounded: true,
        capRounded: true,
        pickable: false,
        wrapLongitude: true,
        parameters: { depthTest: false },
      }),
    );
  }

  return layers;
}

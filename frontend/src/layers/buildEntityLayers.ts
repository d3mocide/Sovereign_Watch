import { ScatterplotLayer, PathLayer, IconLayer, LineLayer, PolygonLayer } from "@deck.gl/layers";
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
      billboard: false, // Ensure halos lie flat on the terrain to rotate with map bearing
      getColor: [255, 136, 0, 140], // Softer alpha for the redesigned glow
      pickable: false,
      // wrapLongitude off in globe mode: billboard + wrapLongitude causes rendering artifacts in Deck.gl _full3d overlay
      wrapLongitude: !globeMode,
      // For MapLibre Globe, we need depthTest enabled to prevent bleeding through the Earth.
      parameters: { depthTest: true, depthBias: 0 },
      // Enable globe occlusion for MapLibre since it lacks Mapbox's built-in hiding
      extensions: [], // In DeckGL v9, globe occlusion is applied automatically if projection is globe, unless interleaved

      updateTriggers: {
        getSize: [currentSelected?.uid],
        getColor: [now],
      },
    }),
  );

  // MapLibre Globe Mode has extreme bugs with billboarding and depth testing on standard IconLayers.
  // To completely bypass this, we render native geographic polygons (triangles) when in Globe mode.
  // These are mathematically converted points that drape naturally across the 3D surface.
  if (globeMode) {
    layers.push(
      new PolygonLayer({
        id: `heading-arrows-globe`,
        data: interpolated,
        getPolygon: (d: CoTEntity) => {
          // Base size calculation based on zoom/selection could be complex in pure degrees,
          // so we use a fixed geographic size that roughly maps to tactical scale.
          const isSelected = currentSelected?.uid === d.uid;
          const sizeDeg = isSelected ? 0.04 : 0.025; // Roughly 2-4km

          const course = d.course || 0;
          const courseRad = (course * Math.PI) / 180;
          const latRad = (d.lat * Math.PI) / 180;

          // Longitude lines compress as they move away from the equator.
          // To keep the geometric triangle properly proportioned (not stretched),
          // we scale the X (longitude) offsets by Secant(latitude).
          const lonScale = 1 / Math.cos(latRad);

          const alt = d.altitude || 10;

          // Basic Triangle (Point up)
          // Rotate it based on course
          const pt1 = [
            d.lon + (sizeDeg * Math.sin(courseRad) * lonScale),
            d.lat + (sizeDeg * Math.cos(courseRad)),
            alt
          ];
          const pt2 = [
            d.lon + ((sizeDeg * 0.8) * Math.sin(courseRad + 2.5) * lonScale),
            d.lat + ((sizeDeg * 0.8) * Math.cos(courseRad + 2.5)),
            alt
          ];
          const pt3 = [
            d.lon,
            d.lat, // indent for chevron
            alt
          ];
          const pt4 = [
            d.lon + ((sizeDeg * 0.8) * Math.sin(courseRad - 2.5) * lonScale),
            d.lat + ((sizeDeg * 0.8) * Math.cos(courseRad - 2.5)),
            alt
          ];

          return [pt1, pt2, pt3, pt4, pt1] as any;
        },
        getFillColor: (d: CoTEntity) => entityColor(d, 200),
        getLineColor: (d: CoTEntity) => entityColor(d, 255),
        wireframe: true,
        pickable: true,
        // wrapLongitude off in globe mode: native geographic polygons don't need it and it causes culling
        wrapLongitude: false,
        parameters: { depthTest: true },
        onHover: (info: { object?: any; x: number; y: number }) => {
          if (info.object) {
            setHoveredEntity(info.object as CoTEntity);
            setHoverPosition({ x: info.x, y: info.y });
          } else {
            setHoveredEntity(null);
            setHoverPosition(null);
          }
        },
        onClick: (info: { object?: any }) => {
          if (info.object) {
            const entity = info.object as CoTEntity;
            const newSelection = selectedEntity?.uid === entity.uid ? null : entity;
            onEntitySelect(newSelection);
          } else {
            onEntitySelect(null);
          }
        },
        updateTriggers: {
          getPolygon: [currentSelected?.uid, now],
        }
      })
    );
  } else {
    // Standard 2D / 3D Pitch Map Mode uses heavily optimized sprites
    layers.push(
      new IconLayer({
        id: `heading-arrows-merc`,
        data: interpolated,
        getIcon: (d: CoTEntity) => {
          const isVessel = d.type.includes("S");
          return isVessel ? "vessel" : "aircraft";
        },
        iconAtlas: ICON_ATLAS.url,
        iconMapping: ICON_ATLAS.mapping,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getPosition: (d: any) => [d.lon, d.lat, d.altitude || 0],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getSize: (d: any) => {
          const isSelected = currentSelected?.uid === d.uid;
          const baseSize = 32;
          return isSelected ? baseSize * 1.3 : baseSize;
        },
        sizeUnits: "pixels" as const,
        sizeMinPixels: 18,
        billboard: false,
        getAngle: (d: any) => {
          const course = d.course || 0;
          return -course;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getColor: (d: any) => entityColor(d as CoTEntity),
        pickable: true,
        wrapLongitude: true,
        parameters: { depthTest: true, depthBias: 0 },
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
          getAngle: [now],
        },
      })
    );
  }

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

import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { RFSite, CoTEntity } from "../types";

/** Colour by service type and digital mode availability */
/** Colour by service type and digital mode availability */
function rfSiteColor(r: RFSite, alpha: number): [number, number, number, number] {
  if (r.service === "noaa_nwr") {
    return [14, 165, 233, alpha]; // sky-500 — NOAA NWR
  }
  if (r.service === "public_safety") {
    return [245, 158, 11, alpha]; // amber-500 — Public Safety
  }

  // Ham / GMRS
  const modes = (r.modes || []).map((m) => (m || "").toLowerCase());
  if (modes.some((m) => m.includes("d-star") || m.includes("fusion") || m.includes("dmr") || m.includes("p25"))) {
    return [139, 92, 246, alpha]; // violet-500 — digital
  }
  if (r.status?.toLowerCase().includes("off")) {
    return [100, 116, 139, alpha]; // slate-500 — off-air
  }
  return [16, 185, 129, alpha]; // emerald-500 — standard FM open
}

/** Determines outline colour based on emcomm flags */
function rfSiteOutlineColor(r: RFSite): [number, number, number, number] | null {
  if (r.emcomm_flags && r.emcomm_flags.length > 0) {
    return [239, 68, 68, 255]; // red-500 outline for EMCOMM flagged
  }
  return null;
}

/** Wrap an RF site as a CoTEntity so it works with the existing hover/tooltip pipeline. */
export function rfSiteToEntity(r: RFSite): CoTEntity {
  const modesStr = (r.modes || []).length ? r.modes.join(", ") : "FM";
  const name = r.name || r.callsign || r.site_id;

  return {
    uid: `rf-${r.source}-${r.site_id}`,
    type: "repeater", // keep type repeater to reuse existing tooltip styles or update as needed
    lat: r.lat,
    lon: r.lon,
    altitude: 0,
    course: 0,
    speed: 0,
    callsign: name,
    lastSeen: Date.now(),
    trail: [],
    uidHash: 0,
    detail: {
      service: r.service,
      frequency: r.output_freq ? r.output_freq.toString() : "N/A",
      input_freq: r.input_freq ? r.input_freq.toString() : "N/A",
      ctcss: r.tone_ctcss !== null ? r.tone_ctcss.toString() : "none",
      dcs: r.tone_dcs || "none",
      use: r.use_access,
      status: r.status,
      city: r.city,
      state: r.state,
      modes: modesStr,
      emcomm: r.emcomm_flags ? r.emcomm_flags.join(", ") : "none"
    },
  };
}

/** Group RF sites into clusters for cleaner overview at low zoom levels. */
function clusterRFSites(sites: RFSite[], zoom: number) {
  // Only cluster when zoomed out
  if (zoom >= 7.5) return { clusters: [], individuals: sites };

  // Grid size decreases as zoom increases.
  const gridSize = 120 / Math.pow(2, Math.max(1, zoom));
  const clusterMap = new Map<string, { lat: number; lon: number; count: number; representative: RFSite }>();

  for (const r of sites) {
    const gx = Math.floor(r.lon / gridSize);
    const gy = Math.floor(r.lat / gridSize);
    const key = `${gx},${gy},${r.service}`;

    const existing = clusterMap.get(key);
    if (existing) {
      existing.count++;
      existing.lat = (existing.lat * (existing.count - 1) + r.lat) / existing.count;
      existing.lon = (existing.lon * (existing.count - 1) + r.lon) / existing.count;
    } else {
      clusterMap.set(key, { lat: r.lat, lon: r.lon, count: 1, representative: r });
    }
  }

  const clusters: any[] = [];
  const individuals: RFSite[] = [];

  for (const c of clusterMap.values()) {
    if (c.count > 1) {
      clusters.push({
        lat: c.lat,
        lon: c.lon,
        count: c.count,
        representative: c.representative
      });
    } else {
      individuals.push(c.representative);
    }
  }

  // Sort clusters descending by count so smaller sub-clusters render on top
  clusters.sort((a, b) => b.count - a.count);

  return { clusters, individuals };
}

export function buildRFLayers(
  sites: RFSite[],
  globeMode: boolean | undefined,
  onEntitySelect: (entity: CoTEntity | null) => void,
  setHoveredEntity: (entity: CoTEntity | null) => void,
  setHoverPosition: (pos: { x: number; y: number } | null) => void,
  zoom: number,
): any[] {
  if (!sites || sites.length === 0) return [];

  const modeKey = globeMode ? "globe" : "merc";
  // ScatterplotLayer at z=0 requires depthTest:false in Mercator/2D to avoid being
  // occluded by Mapbox's tile depth buffer at the same z-plane. Globe mode needs
  // depthTest:true to prevent geometry bleeding through the Earth.
  // (See buildEntityLayers ground-shadows for the same pattern.)
  const depthParams = { depthTest: !!globeMode, depthBias: globeMode ? -100.0 : 0 };
  const layers: any[] = [];

  const { clusters, individuals } = clusterRFSites(sites, zoom);

  // 1. Clusters (only if they exist)
  if (clusters.length > 0) {
    layers.push(
      new ScatterplotLayer({
        id: `rf-clusters-${modeKey}`,
        data: clusters,
        getPosition: (d: any) => [d.lon, d.lat, 0],
        getRadius: (d: any) => 8 + Math.min(d.count / 5, 5),
        radiusUnits: "pixels" as const,
        getFillColor: (d: any) => rfSiteColor(d.representative, 255),
        stroked: true,
        getLineColor: [10, 10, 10, 180],
        getLineWidth: 1.5,
        lineWidthUnits: "pixels" as const,
        filled: true,
        pickable: true,
        wrapLongitude: !globeMode,
        billboard: true,
        parameters: depthParams,
      }),
      // Cluster Number Text (centered inside the icon)
      new TextLayer({
        id: `rf-cluster-labels-${modeKey}`,
        data: clusters,
        getPosition: (d: any) => [d.lon, d.lat, 0],
        getText: (d: any) => `${d.count}`,
        getSize: 10,
        getColor: [255, 255, 255, 255],
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        fontFamily: "monospace",
        fontWeight: 600,
        billboard: true,
        pickable: false,
        wrapLongitude: !globeMode,
        parameters: { ...depthParams, depthBias: -200.0 }, // Ensure it's on top of the circle
      })
    );
  }

  // 2. Individuals (Non-clustered points)
  if (individuals.length > 0) {
    // Core dot (pickable — hover tooltip + click to select)
    layers.push(
      new ScatterplotLayer({
        id: `rf-dots-${modeKey}`,
        data: individuals,
        getPosition: (d: RFSite) => [d.lon, d.lat, 0],
        getRadius: 6,
        radiusUnits: "pixels" as const,
        radiusMinPixels: 5,
        getFillColor: (d: RFSite) => rfSiteColor(d, 255),
        getLineColor: (d: RFSite) => rfSiteOutlineColor(d) || [10, 10, 10, 180],
        stroked: true,
        getLineWidth: 1.5,
        lineWidthUnits: "pixels" as const,
        filled: true,
        pickable: true,
        wrapLongitude: !globeMode,
        billboard: true,
        parameters: depthParams,
        onHover: (info: any) => {
          if (info.object) {
            setHoveredEntity(rfSiteToEntity(info.object as RFSite));
            setHoverPosition({ x: info.x, y: info.y });
          } else {
            setHoveredEntity(null);
            setHoverPosition(null);
          }
        },
        onClick: (info: any) => {
          if (info.object) {
            onEntitySelect(rfSiteToEntity(info.object as RFSite));
          }
        },
      }),
    );
  }

  return layers;
}

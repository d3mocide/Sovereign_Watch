import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { RFSite, CoTEntity } from "../types";

/** Colour by service type and digital mode availability */
function rfSiteColor(r: RFSite, alpha: number): [number, number, number, number] {
  if (r.service === "noaa_nwr") {
    return [14, 165, 233, alpha]; // sky-500 — NOAA NWR
  }
  if (r.service === "public_safety") {
    return [245, 158, 11, alpha]; // amber-500 — Public Safety
  }

  // Ham / GMRS
  const modes = r.modes.map((m) => m.toLowerCase());
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
  const modesStr = r.modes.length ? r.modes.join(", ") : "FM";
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
  if (sites.length === 0) return [];

  const modeKey = globeMode ? "globe" : "merc";
  const depthParams = { depthTest: !!globeMode, depthBias: globeMode ? -100.0 : 0 };
  const layers: any[] = [];

  const { clusters, individuals } = clusterRFSites(sites, zoom);

  // 1. Clusters (only if they exist)
  if (clusters.length > 0) {
    layers.push(
      // Cluster Glow/Halo
      new ScatterplotLayer({
        id: `rf-cluster-halo-${modeKey}`,
        data: clusters,
        getPosition: (d: any) => [d.lon, d.lat, 0],
        getRadius: (d: any) => 10 + Math.min(d.count / 3, 6),
        radiusUnits: "pixels" as const,
        getFillColor: (d: any) => rfSiteColor(d.representative, 40),
        stroked: false,
        filled: true,
        pickable: false,
        wrapLongitude: !globeMode,
        billboard: true,
        parameters: depthParams,
      }),
      // Cluster Core
      new ScatterplotLayer({
        id: `rf-clusters-${modeKey}`,
        data: clusters,
        getPosition: (d: any) => [d.lon, d.lat, 0],
        getRadius: (d: any) => 7 + Math.min(d.count / 5, 4),
        radiusUnits: "pixels" as const,
        getFillColor: (d: any) => rfSiteColor(d.representative, 255),
        stroked: true,
        getLineColor: [255, 255, 255, 220],
        getLineWidth: 1,
        lineWidthUnits: "pixels" as const,
        filled: true,
        pickable: true,
        wrapLongitude: !globeMode,
        billboard: true,
        parameters: depthParams,
      }),
      // Cluster Number Text
      new TextLayer({
        id: `rf-cluster-labels-${modeKey}`,
        data: clusters,
        getPosition: (d: any) => [d.lon, d.lat, 0],
        getText: (d: any) => `${d.count}`,
        getSize: 12,
        getColor: [255, 255, 255, 255],
        getPixelOffset: [0, 0], // centre correction
        fontFamily: "monospace",
        fontWeight: "bold",
        billboard: true,
        pickable: false,
        wrapLongitude: !globeMode,
        parameters: depthParams,
      })
    );
  }

  // 2. Individuals (Non-clustered points)
  if (individuals.length > 0) {
    // Outer halo (non-pickable, decorative) - Skip in globe mode to reduce "bubble" clutter
    if (!globeMode) {
      layers.push(
        new ScatterplotLayer({
          id: `rf-halo-${modeKey}`,
          data: individuals,
          getPosition: (d: RFSite) => [d.lon, d.lat, 0],
          getRadius: 9,
          radiusUnits: "pixels" as const,
          radiusMinPixels: 5,
          getFillColor: (d: RFSite) => rfSiteColor(d, 40),
          stroked: false,
          filled: true,
          pickable: false,
          wrapLongitude: !globeMode,
          parameters: depthParams,
        }),
      );
    }

    // Core dot (pickable — hover tooltip + click to select)
    layers.push(
      new ScatterplotLayer({
        id: `rf-dots-${modeKey}`,
        data: individuals,
        getPosition: (d: RFSite) => [d.lon, d.lat, 0],
        getRadius: 5,
        radiusUnits: "pixels" as const,
        radiusMinPixels: 3,
        getFillColor: (d: RFSite) => rfSiteColor(d, 220),
        getLineColor: (d: RFSite) => rfSiteOutlineColor(d) || [0, 0, 0, 0],
        stroked: true,
        getLineWidth: (d: RFSite) => rfSiteOutlineColor(d) ? 2 : 0,
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

    // Callsign + freq labels (only at zoom >= 9)
    if (zoom >= 9) {
      layers.push(
        new TextLayer({
          id: `rf-labels-${modeKey}`,
          data: individuals,
          getPosition: (d: RFSite) => [d.lon, d.lat, 0],
          getText: (d: RFSite) => `${d.name || d.callsign}\n${d.output_freq || ""}`,
          getSize: 10,
          getColor: (d: RFSite) => rfSiteColor(d, 200),
          getPixelOffset: [0, -16],
          fontFamily: "monospace",
          fontWeight: "bold",
          billboard: true,
          pickable: false,
          wrapLongitude: !globeMode,
          parameters: { depthTest: true, depthBias: -100.0 },
          lineHeight: 1.3,
        }),
      );
    }
  }

  return layers;
}

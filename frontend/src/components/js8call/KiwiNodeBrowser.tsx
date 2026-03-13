/**
 * KiwiNodeBrowser
 * ================
 * Floating panel that opens when the operator clicks the SDR status button.
 * Fetches the sorted, filtered node list from GET /api/kiwi/nodes, shows each
 * node with a distance badge + channel-load bar, and dispatches SET_KIWI on
 * one-click connect.  Manual entry for private/unlisted nodes is tucked in a
 * collapsible section at the bottom.
 *
 * The panel supports two views:
 *  - List view (default): scrollable node list sorted by proximity
 *  - Map view: interactive mini-map showing node locations with click-to-connect
 *
 * A radius filter (in km) can optionally restrict results to nodes within a
 * given distance of the operator's location.
 */

import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  List,
  Loader2,
  Map as MapIcon,
  RefreshCw,
  Server,
  X,
} from "lucide-react";
import { Map, Marker, Popup, Source, Layer, NavigationControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { KiwiNode } from "../../types";
import { useKiwiNodes } from "../../hooks/useKiwiNodes";
import { maidenheadToLatLon } from "../../utils/map/geoUtils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DARK_MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ManualConfig {
  host: string;
  port: number;
  freq: number;
  mode: string;
  password: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Ref to the container div that owns the trigger button — used for
   *  click-outside detection so clicks on the button itself don't
   *  immediately re-close the panel. */
  containerRef: React.RefObject<HTMLDivElement>;
  currentFreqKhz: number;
  activeConfig: ManualConfig | null;
  kiwiConnected: boolean;
  kiwiConnecting: boolean;
  bridgeConnected: boolean;
  onConnect: (node: KiwiNode) => void;
  onDisconnect: () => void;
  manualConfig: ManualConfig;
  onManualConfigChange: (patch: Partial<ManualConfig>) => void;
  onManualConnect: () => void;
  /** Operator's Maidenhead grid square (e.g. "CN85") for map centering */
  operatorGrid: string;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function distanceCls(km: number): string {
  if (km < 500)
    return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (km < 2000)
    return "text-yellow-400  bg-yellow-500/10  border-yellow-500/20";
  return "text-red-400    bg-red-500/10     border-red-500/20";
}

function markerColor(km: number): string {
  if (km < 500) return "#34d399"; // emerald-400
  if (km < 2000) return "#facc15"; // yellow-400
  return "#f87171"; // red-400
}

function fmtDistance(km: number): string {
  return km < 1000 ? `${Math.round(km)} km` : `${(km / 1000).toFixed(1)}k km`;
}

function LoadBar({ users, numCh }: { users: number; numCh: number }) {
  const pct = numCh > 0 ? Math.min(100, (users / numCh) * 100) : 0;
  const barCls =
    pct < 50 ? "bg-emerald-500" : pct < 80 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1 text-[10px] text-slate-500">
      <div className="w-10 h-1 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barCls}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span>
        {users}/{numCh}
      </span>
    </div>
  );
}

/** Build a GeoJSON polygon approximating a geodesic circle. */
function buildCircleGeoJSON(
  lat: number,
  lon: number,
  radiusKm: number,
  steps = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coordinates: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dx = radiusKm * Math.cos(angle);
    const dy = radiusKm * Math.sin(angle);
    const dLat = dy / 111.32;
    const dLon = dx / (111.32 * Math.cos((lat * Math.PI) / 180));
    coordinates.push([lon + dLon, lat + dLat]);
  }
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [coordinates] },
    properties: {},
  };
}

// ---------------------------------------------------------------------------
// KiwiNodeBrowser
// ---------------------------------------------------------------------------

export default function KiwiNodeBrowser({
  isOpen,
  onClose,
  containerRef,
  currentFreqKhz,
  activeConfig,
  kiwiConnected,
  kiwiConnecting,
  bridgeConnected,
  onConnect,
  onDisconnect,
  manualConfig,
  onManualConfigChange,
  onManualConnect,
  operatorGrid,
}: Props) {
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [radiusMode, setRadiusMode] = useState<"mission" | "regional" | "global">("mission");
  const [showManual, setShowManual] = useState(false);
  const [selectedNode, setSelectedNode] = useState<KiwiNode | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const radiusKm = useMemo(() => {
    if (radiusMode === "regional") return 2000;
    return undefined;
  }, [radiusMode]);

  const nodeLimit = useMemo(() => {
    if (radiusMode === "global") return 10000;
    if (radiusMode === "regional") return 500;
    return 50; // mission
  }, [radiusMode]);

  const { nodes, loading, error, refetch } = useKiwiNodes(
    currentFreqKhz,
    isOpen,
    radiusKm,
    nodeLimit
  );

  const [operatorLat, operatorLon] = useMemo(
    () => maidenheadToLatLon(operatorGrid || "AA00"),
    [operatorGrid],
  );

  const isValidOperator = !isNaN(operatorLat) && !isNaN(operatorLon);

  const circleGeoJSON = useMemo(() => {
    if (!radiusKm || !isValidOperator) return null;
    return buildCircleGeoJSON(operatorLat, operatorLon, radiusKm);
  }, [operatorLat, operatorLon, radiusKm, isValidOperator]);

  // Close on click outside (excludes the container that owns the trigger)
  useEffect(() => {
    if (!isOpen) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      const inPanel = panelRef.current?.contains(target);
      const inContainer = containerRef.current?.contains(target);
      if (!inPanel && !inContainer) onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isOpen, onClose, containerRef]);

  // Clear node popup when switching views
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedNode(null);
  }, [viewMode]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[500px] z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl shadow-black/70 overflow-hidden"
    >
      {/* ── Panel header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800">
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <Server className="w-3.5 h-3.5 text-indigo-400" />
          KiwiSDR Node Browser
          {!loading && nodes.length > 0 && (
            <span className="text-slate-600 font-normal normal-case tracking-normal">
              — {nodes.length} nodes nearby
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* List / Map view toggle */}
          <button
            onClick={() => setViewMode("list")}
            title="List view"
            className={`p-1.5 rounded transition-colors focus-visible:ring-1 focus-visible:ring-indigo-400 outline-none ${
              viewMode === "list"
                ? "text-indigo-400 bg-indigo-500/15"
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
            }`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode("map")}
            title="Map view"
            className={`p-1.5 rounded transition-colors focus-visible:ring-1 focus-visible:ring-indigo-400 outline-none ${
              viewMode === "map"
                ? "text-indigo-400 bg-indigo-500/15"
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-slate-800 mx-0.5" />

          <button
            onClick={refetch}
            disabled={loading}
            title="Refresh node list"
            className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-40 focus-visible:ring-1 focus-visible:ring-indigo-400 outline-none"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors focus-visible:ring-1 focus-visible:ring-indigo-400 outline-none"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Radius filter bar ── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-950/60 border-b border-slate-800">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">
          Coverage
        </span>
        <div className="flex bg-slate-900 rounded p-0.5 border border-slate-800">
          <button
            onClick={() => setRadiusMode("mission")}
            className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
              radiusMode === "mission" 
                ? "bg-indigo-500/20 text-indigo-400" 
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
            }`}
          >
            Mission Area
          </button>
          <button
            onClick={() => setRadiusMode("regional")}
            className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
              radiusMode === "regional" 
                ? "bg-indigo-500/20 text-indigo-400" 
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
            }`}
          >
            Regional
          </button>
          <button
            onClick={() => setRadiusMode("global")}
            className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
              radiusMode === "global" 
                ? "bg-indigo-500/20 text-indigo-400" 
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
            }`}
          >
            Global
          </button>
        </div>
      </div>

      {/* ── Active connection status bar ── */}
      {kiwiConnected && activeConfig && (
        <div className="flex items-center justify-between px-4 py-2 bg-indigo-950/30 border-b border-indigo-500/20">
          <div className="flex items-center gap-2 text-xs">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="font-mono text-slate-300">
              {activeConfig.host}:{activeConfig.port}
            </span>
            <span className="text-slate-600">@</span>
            <span className="font-mono text-emerald-400 font-semibold">
              {activeConfig.freq} kHz {activeConfig.mode.toUpperCase()}
            </span>
          </div>
          <button
            onClick={onDisconnect}
            disabled={!bridgeConnected}
            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/25 transition-colors disabled:opacity-40 focus-visible:ring-1 focus-visible:ring-rose-400 outline-none"
          >
            Disconnect
          </button>
        </div>
      )}

      {/* ── Main content: List or Map ── */}
      {viewMode === "list" ? (
        <div className="max-h-72 overflow-y-auto">
          {/* Loading skeleton */}
          {loading && nodes.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-500 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              Fetching nearby nodes…
            </div>
          )}

          {/* Error notice */}
          {error && !loading && (
            <div className="px-4 py-2.5 text-xs text-red-400 bg-red-500/5 border-b border-red-500/10">
              {error} — directory unavailable, use manual entry below.
            </div>
          )}

          {/* Empty */}
          {!loading && !error && nodes.length === 0 && (
            <div className="py-10 text-center text-xs text-slate-600 italic">
              No nodes found covering {currentFreqKhz} kHz
              {radiusKm ? ` within ${radiusKm} km` : ""}
            </div>
          )}

          {/* Node rows */}
          {nodes.map((node, index) => {
            const isActive =
              activeConfig?.host === node.host &&
              activeConfig?.port === node.port;
            return (
              <div
                key={`${node.host}:${node.port}-${index}`}
                className={`
                flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/50 transition-colors
                ${
                  isActive
                    ? "bg-indigo-950/40 border-l-2 border-l-indigo-500"
                    : "hover:bg-slate-800/40"
                }
              `}
              >
                {/* Active dot */}
                <div
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? "bg-indigo-400 animate-pulse" : "bg-slate-700"}`}
                />

                {/* Host + freq range + load */}
                <div className="flex-1 min-w-0">
                  <div
                    className="font-mono text-xs text-slate-200 truncate"
                    title={`${node.host}:${node.port}`}
                  >
                    {node.host}
                    <span className="text-slate-600 ml-1 text-[10px]">
                      :{node.port}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-600 font-mono">
                      {node.freq_min_khz.toFixed(0)}–
                      {node.freq_max_khz.toFixed(0)} kHz
                    </span>
                    <LoadBar users={node.users} numCh={node.num_ch} />
                  </div>
                </div>

                {/* Distance badge */}
                <div
                  className={`px-1.5 py-0.5 rounded border text-[10px] font-mono shrink-0 ${distanceCls(node.distance_km)}`}
                >
                  {fmtDistance(node.distance_km)}
                </div>

                {/* Connect / Active button */}
                <button
                  onClick={() => {
                    onConnect(node);
                    onClose();
                  }}
                  disabled={!bridgeConnected || kiwiConnecting || isActive}
                  className={`
                  px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors shrink-0
                  ${
                    isActive
                      ? "text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 cursor-default"
                      : "text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
                  }
                `}
                >
                  {isActive ? "Active" : kiwiConnecting ? "…" : "Connect"}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Map view ── */
        <div className="relative" style={{ height: 320 }}>
          {loading && nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-slate-500 text-xs bg-slate-950/80 z-10">
              <Loader2 className="w-4 h-4 animate-spin" />
              Fetching nodes…
            </div>
          )}
          <Map
            initialViewState={{
              latitude: isValidOperator ? operatorLat : 0,
              longitude: isValidOperator ? operatorLon : 0,
              zoom: radiusKm
                ? Math.max(1, Math.min(8, 8 - Math.log2(radiusKm / 50)))
                : 3,
            }}
            style={{ width: "100%", height: "100%" }}
            mapStyle={DARK_MAP_STYLE}
            attributionControl={false}
          >
            {/* Radius circle */}
            {circleGeoJSON && (
              <Source id="kiwi-radius" type="geojson" data={circleGeoJSON}>
                <Layer
                  id="kiwi-radius-fill"
                  type="fill"
                  paint={{ "fill-color": "#6366f1", "fill-opacity": 0.1 }}
                />
                <Layer
                  id="kiwi-radius-line"
                  type="line"
                  paint={{
                    "line-color": "#6366f1",
                    "line-width": 1.5,
                    "line-dasharray": [3, 2],
                  }}
                />
              </Source>
            )}

            {/* Operator location marker */}
            {isValidOperator && (
              <Marker
                latitude={operatorLat}
                longitude={operatorLon}
                anchor="center"
              >
                <div
                  title={`Operator: ${operatorGrid}`}
                  className="w-3 h-3 rounded-full border-2 shadow-lg"
                  style={{
                    background: "#818cf8",
                    borderColor: "#c7d2fe",
                    boxShadow: "0 0 6px #6366f180",
                  }}
                />
              </Marker>
            )}

            {/* Node markers */}
            {nodes
              .filter(node => !isNaN(node.lat) && !isNaN(node.lon))
              .map((node, index) => {
                const isActive =
                  activeConfig?.host === node.host &&
                  activeConfig?.port === node.port;
                const color = isActive ? "#818cf8" : markerColor(node.distance_km);
                return (
                  <Marker
                    key={`${node.host}:${node.port}-${index}`}
                    latitude={node.lat}
                    longitude={node.lon}
                    anchor="center"
                    onClick={(e) => {
                      e.originalEvent.stopPropagation();
                      setSelectedNode(
                        selectedNode?.host === node.host &&
                          selectedNode?.port === node.port
                          ? null
                          : node,
                      );
                    }}
                  >
                    <div
                      title={`${node.host}:${node.port} — ${fmtDistance(node.distance_km)}`}
                      className={`w-2.5 h-2.5 rounded-full border-2 cursor-pointer transition-transform hover:scale-125 ${
                        isActive ? "animate-pulse" : ""
                      }`}
                      style={{
                        background: color + "40",
                        borderColor: color,
                      }}
                    />
                  </Marker>
                );
              })}

            {/* Node detail popup */}
            {selectedNode && (
              <Popup
                latitude={selectedNode.lat}
                longitude={selectedNode.lon}
                anchor="bottom"
                offset={12}
                onClose={() => setSelectedNode(null)}
                closeButton={false}
                className="kiwi-node-popup" // Add this class to target in CSS
              >
                <div className="bg-slate-900 border border-slate-700 rounded-md p-2 text-xs min-w-[180px]">
                  <div className="font-mono text-slate-200 truncate mb-1">
                    {selectedNode.host}
                    <span className="text-slate-500 ml-1">
                      :{selectedNode.port}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-slate-600 font-mono text-[10px]">
                      {selectedNode.freq_min_khz.toFixed(0)}–
                      {selectedNode.freq_max_khz.toFixed(0)} kHz
                    </span>
                    <LoadBar
                      users={selectedNode.users}
                      numCh={selectedNode.num_ch}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-1.5 py-0.5 rounded border text-[10px] font-mono ${distanceCls(selectedNode.distance_km)}`}
                    >
                      {fmtDistance(selectedNode.distance_km)}
                    </span>
                    <button
                      onClick={() => {
                        onConnect(selectedNode);
                        setSelectedNode(null);
                        onClose();
                      }}
                      disabled={
                        !bridgeConnected ||
                        kiwiConnecting ||
                        (activeConfig?.host === selectedNode.host &&
                          activeConfig?.port === selectedNode.port)
                      }
                      className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {activeConfig?.host === selectedNode.host &&
                      activeConfig?.port === selectedNode.port
                        ? "Active"
                        : kiwiConnecting
                          ? "…"
                          : "Connect"}
                    </button>
                  </div>
                </div>
              </Popup>
            )}
            <NavigationControl position="bottom-right" />
          </Map>
        </div>
      )}

      {/* ── Manual entry (collapsible) ── */}
      <div className="border-t border-slate-800">
        <button
          onClick={() => setShowManual((v) => !v)}
          className="w-full flex items-center gap-1.5 px-4 py-2 text-[10px] text-slate-500 hover:text-slate-400 uppercase tracking-wider transition-colors focus-visible:ring-1 focus-visible:ring-indigo-400 outline-none"
        >
          {showManual ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          Manual entry — private / unlisted nodes
        </button>

        {showManual && (
          <div className="px-4 pb-3 flex items-center gap-1.5 flex-wrap">
            <input
              type="text"
              value={manualConfig.host}
              onChange={(e) => onManualConfigChange({ host: e.target.value })}
              placeholder="sdr.host.com"
              disabled={!bridgeConnected || kiwiConnecting}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-slate-300 w-36 focus:outline-none focus:border-indigo-500 disabled:opacity-40"
            />
            <span className="text-slate-600 text-xs">:</span>
            <input
              type="number"
              value={manualConfig.port}
              onChange={(e) =>
                onManualConfigChange({ port: Number(e.target.value) || 8073 })
              }
              placeholder="8073"
              disabled={!bridgeConnected || kiwiConnecting}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-slate-300 w-16 focus:outline-none focus:border-indigo-500 disabled:opacity-40"
            />
            <span className="text-slate-600 text-xs">@</span>
            <input
              type="number"
              value={manualConfig.freq}
              onChange={(e) =>
                onManualConfigChange({ freq: Number(e.target.value) || 14074 })
              }
              placeholder="14074"
              disabled={!bridgeConnected || kiwiConnecting}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-slate-300 w-20 focus:outline-none focus:border-indigo-500 disabled:opacity-40"
            />
            <span className="text-slate-600 text-[10px]">kHz</span>
            <select
              value={manualConfig.mode}
              onChange={(e) => onManualConfigChange({ mode: e.target.value })}
              disabled={!bridgeConnected || kiwiConnecting}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-slate-300 focus:outline-none focus:border-indigo-500 disabled:opacity-40"
            >
              <option value="usb">USB</option>
              <option value="lsb">LSB</option>
              <option value="am">AM</option>
              <option value="cw">CW</option>
            </select>
            <input
              type="password"
              value={manualConfig.password}
              onChange={(e) => onManualConfigChange({ password: e.target.value })}
              placeholder="password"
              disabled={!bridgeConnected || kiwiConnecting}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-slate-300 w-24 focus:outline-none focus:border-indigo-500 disabled:opacity-40"
              title="Node password (leave blank for open nodes)"
            />
            <button
              onClick={() => {
                onManualConnect();
                onClose();
              }}
              disabled={
                !bridgeConnected || kiwiConnecting || !manualConfig.host
              }
              className="px-3 py-1 rounded font-mono text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {kiwiConnecting ? "Connecting…" : "Connect"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

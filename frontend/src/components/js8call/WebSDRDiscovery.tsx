/**
 * WebSDRDiscovery
 * ================
 * Specialized component for browsing and connecting to the WebSDR network.
 * Features an interactive map view by default and focused results.
 */

import { useEffect, useRef, useState, useMemo } from "react";
import {
  List,
  Loader2,
  Map as MapIcon,
  Radio,
  RefreshCw,
  X,
} from "lucide-react";
import { Map, Marker, Popup, NavigationControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { WebSDRNode } from "../../types";
import { useWebSDRNodes } from "../../hooks/useWebSDRNodes";
import { maidenheadToLatLon } from "../../utils/map/geoUtils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DARK_MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentFreqKhz: number;
  onOpenWebSDR: (node: WebSDRNode) => void;
  /** Operator's Maidenhead grid square (e.g. "CN85") for map centering */
  operatorGrid: string;
  inlineMode?: boolean;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function webSDRMarkerColor(km: number): string {
  if (km < 500) return "#a78bfa"; // violet-400
  if (km < 2000) return "#c084fc"; // purple-400
  return "#e879f9"; // fuchsia-400
}

function webSDRDistanceCls(km: number): string {
  if (km < 500)
    return "text-violet-400 bg-violet-500/10 border-violet-500/20";
  if (km < 2000)
    return "text-purple-400 bg-purple-500/10 border-purple-500/20";
  return "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20";
}

function fmtDistance(km: number): string {
  if (km === 0) return "Local";
  return km < 1000 ? `${Math.round(km)} km` : `${(km / 1000).toFixed(1)}k km`;
}

// ---------------------------------------------------------------------------
// WebSDRDiscovery
// ---------------------------------------------------------------------------

export default function WebSDRDiscovery({
  isOpen,
  onClose,
  currentFreqKhz,
  onOpenWebSDR,
  operatorGrid,
  inlineMode = false,
}: Props) {
  const [viewMode, setViewMode] = useState<"list" | "map">("map");
  const [selectedWebSDRNode, setSelectedWebSDRNode] = useState<WebSDRNode | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const {
    nodes: webSDRNodes,
    loading: webSDRLoading,
    error: webSDRError,
    refetch: webSDRRefetch,
  } = useWebSDRNodes(
    currentFreqKhz,
    isOpen,
    undefined, // No radius filter - show all nodes
    10000,    // High limit
  );

  const [operatorLat, operatorLon] = useMemo(
    () => maidenheadToLatLon(operatorGrid || "AA00"),
    [operatorGrid],
  );

  const isValidOperator = !isNaN(operatorLat) && !isNaN(operatorLon);

  // Close on click outside (excludes the container that owns the trigger)
  useEffect(() => {
    if (!isOpen || inlineMode) return;
    function onMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isOpen, onClose, inlineMode]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className={
        inlineMode
          ? "w-full h-full flex flex-col bg-slate-900/50"
          : "absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[500px] z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl shadow-black/70 overflow-hidden"
      }
    >
      {/* ── Panel header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800">
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <Radio className="w-3.5 h-3.5 text-violet-400" />
          WebSDR Discovery
          {!webSDRLoading && webSDRNodes.length > 0 && (
            <span className="text-slate-600 font-normal normal-case tracking-normal">
              — {webSDRNodes.length} nodes available
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* List / Map view toggle */}
          <button
            onClick={() => setViewMode("list")}
            title="List view"
            aria-label="List view"
            className={`p-1.5 rounded transition-colors focus-visible:ring-1 focus-visible:ring-violet-400 outline-none ${
              viewMode === "list"
                ? "text-violet-400 bg-violet-500/15"
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
            }`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode("map")}
            title="Map view"
            aria-label="Map view"
            className={`p-1.5 rounded transition-colors focus-visible:ring-1 focus-visible:ring-violet-400 outline-none ${
              viewMode === "map"
                ? "text-violet-400 bg-violet-500/15"
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-slate-800 mx-0.5" />

          <button
            onClick={() => webSDRRefetch()}
            disabled={webSDRLoading}
            title="Refresh node list"
            aria-label="Refresh node list"
            className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-40 focus-visible:ring-1 focus-visible:ring-violet-400 outline-none"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${webSDRLoading ? "animate-spin" : ""}`}
            />
          </button>
          {!inlineMode && (
            <button
              onClick={onClose}
              aria-label="Close WebSDR discovery"
              className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors focus-visible:ring-1 focus-visible:ring-violet-400 outline-none"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Status info bar ── */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-950/60 border-b border-slate-800">
         <span className="text-[9px] text-violet-500/70 italic uppercase tracking-wider font-bold">VHF/UHF + HF Discovery</span>
         <span className="text-[9px] text-slate-600 ml-auto">Showing all WebSDR nodes globally</span>
      </div>

      {/* ── Main content: List or Map ── */}
      {viewMode === "list" ? (
        <div className="flex-1 overflow-y-auto min-h-0 bg-slate-900/10">
          {/* Loading skeleton */}
          {webSDRLoading && webSDRNodes.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-500 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              Fetching WebSDR nodes…
            </div>
          )}

          {/* Error notices */}
          {webSDRError && !webSDRLoading && (
            <div className="px-4 py-2.5 text-xs text-red-400 bg-red-500/5 border-b border-red-500/10 text-center">
              WebSDR: {webSDRError}
            </div>
          )}

          {/* Empty */}
          {!webSDRLoading && webSDRNodes.length === 0 && (
            <div className="py-10 text-center text-xs text-slate-600 italic">
              No WebSDR nodes found covering {currentFreqKhz} kHz
            </div>
          )}

          {/* ── WebSDR node rows ── */}
          {webSDRNodes.map((node, index) => (
            <div
              key={`websdr-${node.url}-${index}`}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/50 hover:bg-slate-800/40 transition-colors"
            >
              {/* Type dot */}
              <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-violet-600" />

              {/* Name + bands + freq range */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="px-1 py-0.5 rounded text-[9px] font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 uppercase shrink-0">
                    WebSDR
                  </span>
                  <div
                    className="font-mono text-xs text-slate-200 truncate"
                    title={node.url}
                  >
                    {node.name || new URL(node.url).hostname}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-slate-600 font-mono">
                    {node.freq_min_khz < 1000
                      ? `${node.freq_min_khz.toFixed(0)}`
                      : `${(node.freq_min_khz / 1000).toFixed(0)}M`}–
                    {node.freq_max_khz >= 1000000
                      ? `${(node.freq_max_khz / 1000).toFixed(0)}M`
                      : node.freq_max_khz >= 1000
                      ? `${(node.freq_max_khz / 1000).toFixed(0)}M`
                      : `${node.freq_max_khz.toFixed(0)}`} kHz
                  </span>
                  {/* Band chips (first 3) */}
                  {node.bands.slice(0, 3).map((b) => (
                    <span key={b} className="text-[9px] text-violet-500/70 font-mono uppercase">
                      {b}
                    </span>
                  ))}
                  {node.bands.length > 3 && (
                    <span className="text-[9px] text-slate-700">+{node.bands.length - 3}</span>
                  )}
                </div>
              </div>

              {/* Distance badge */}
              <div
                className={`px-1.5 py-0.5 rounded border text-[10px] font-mono shrink-0 ${webSDRDistanceCls(node.distance_km)}`}
              >
                {fmtDistance(node.distance_km)}
              </div>

              {/* Open button */}
              <button
                onClick={() => {
                  onOpenWebSDR(node);
                  if (!inlineMode) onClose();
                }}
                className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors shrink-0 text-white bg-violet-600 border border-violet-500/50 hover:bg-violet-500 shadow-sm"
              >
                Open
              </button>
            </div>
          ))}
        </div>
      ) : (
        /* ── Map view ── */
        <div className="relative flex-1 min-h-0 min-w-0 overflow-hidden">
          {webSDRLoading && webSDRNodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-slate-500 text-xs bg-slate-950/80 z-10">
              <Loader2 className="w-4 h-4 animate-spin" />
              Fetching nodes…
            </div>
          )}
          <Map
            initialViewState={{
              latitude: isValidOperator ? operatorLat : 20,
              longitude: isValidOperator ? operatorLon : 0,
              zoom: 2,
            }}
            style={{ width: "100%", height: "100%" }}
            mapStyle={DARK_MAP_STYLE}
            attributionControl={false}
          >
             <NavigationControl position="bottom-right" showCompass={false} />

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
                    background: "#a78bfa",
                    borderColor: "#ddd6fe",
                    boxShadow: "0 0 8px #8b5cf680",
                  }}
                />
              </Marker>
            )}

            {/* WebSDR node markers (diamonds — visually distinct from KiwiSDR circles) */}
            {webSDRNodes
              .filter(node => node.lat !== 0 && node.lon !== 0 && !isNaN(node.lat) && !isNaN(node.lon))
              .map((node, index) => {
                const color = webSDRMarkerColor(node.distance_km);
                return (
                  <Marker
                    key={`websdr-${node.url}-${index}`}
                    latitude={node.lat}
                    longitude={node.lon}
                    anchor="center"
                    onClick={(e) => {
                      e.originalEvent.stopPropagation();
                      setSelectedWebSDRNode(
                        selectedWebSDRNode?.url === node.url ? null : node,
                      );
                    }}
                  >
                    <div
                      title={`WebSDR: ${node.name || node.url} — ${fmtDistance(node.distance_km)}`}
                      className="w-3.5 h-3.5 cursor-pointer transition-transform hover:scale-125"
                      style={{
                        background: color + "40",
                        borderColor: color,
                        border: `2px solid ${color}`,
                        transform: "rotate(45deg)",
                        boxShadow: `0 0 10px ${color}30`,
                      }}
                    />
                  </Marker>
                );
              })}

            {/* Node detail popup */}
            {selectedWebSDRNode && (
              <Popup
                latitude={selectedWebSDRNode.lat}
                longitude={selectedWebSDRNode.lon}
                anchor="bottom"
                offset={14}
                onClose={() => setSelectedWebSDRNode(null)}
                closeButton={false}
                className="kiwi-node-popup"
              >
                <div className="bg-slate-900 border border-slate-700 rounded-md p-2.5 text-xs min-w-[200px] shadow-2xl">
                   <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="px-1 py-0.5 rounded text-[8px] font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 uppercase">
                      WebSDR
                    </span>
                    <div className="font-bold text-slate-200 truncate">
                      {selectedWebSDRNode.name || "WebSDR Node"}
                    </div>
                  </div>
                  
                  <div className="text-[10px] text-slate-400 font-mono truncate mb-2">
                    {new URL(selectedWebSDRNode.url).hostname}
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800">
                    <span
                      className={`px-1.5 py-0.5 rounded border text-[10px] font-mono ${webSDRDistanceCls(selectedWebSDRNode.distance_km)}`}
                    >
                      {fmtDistance(selectedWebSDRNode.distance_km)}
                    </span>
                    <button
                      onClick={() => {
                        onOpenWebSDR(selectedWebSDRNode);
                        setSelectedWebSDRNode(null);
                        if (!inlineMode) onClose();
                      }}
                      className="px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-white bg-violet-600 hover:bg-violet-500 transition-colors"
                    >
                      Open
                    </button>
                  </div>
                </div>
              </Popup>
            )}
          </Map>
        </div>
      )}
    </div>
  );
}

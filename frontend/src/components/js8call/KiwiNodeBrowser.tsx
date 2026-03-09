/**
 * KiwiNodeBrowser
 * ================
 * Floating panel that opens when the operator clicks the SDR status button.
 * Fetches the sorted, filtered node list from GET /api/kiwi/nodes, shows each
 * node with a distance badge + channel-load bar, and dispatches SET_KIWI on
 * one-click connect.  Manual entry for private/unlisted nodes is tucked in a
 * collapsible section at the bottom.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Server,
  X,
} from "lucide-react";
import type { KiwiNode } from "../../types";
import { useKiwiNodes } from "../../hooks/useKiwiNodes";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ManualConfig {
  host: string;
  port: number;
  freq: number;
  mode: string;
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
}: Props) {
  const { nodes, loading, error, refetch } = useKiwiNodes(
    currentFreqKhz,
    isOpen,
  );
  const [showManual, setShowManual] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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

      {/* ── Node list ── */}
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
          </div>
        )}

        {/* Node rows */}
        {nodes.map((node) => {
          const isActive =
            activeConfig?.host === node.host &&
            activeConfig?.port === node.port;
          return (
            <div
              key={`${node.host}:${node.port}`}
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

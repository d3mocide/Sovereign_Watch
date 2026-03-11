import React, { useState, useRef, useEffect } from 'react';
import { Radio, MapPin, ChevronDown, ChevronUp, Send, Terminal, Users, RadioReceiver, CheckCircle2, Activity } from 'lucide-react';
import type { JS8Station, JS8LogEntry, JS8StatusLine, KiwiNode } from '../../types';
import { useKiwiNodes } from '../../hooks/useKiwiNodes';

/**
 * JS8Call decode thresholds:
 *   ≥ −18 dB  all modes decode  → emerald
 *   ≥ −24 dB  Normal/Slow work  → yellow
 *   < −24 dB  Slow-only / none  → red
 */
function snrColor(snr: number): string {
  if (snr >= -18) return 'text-emerald-400';
  if (snr >= -24) return 'text-yellow-400';
  return 'text-red-400';
}

function bearingToCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function formatAge(tsUnix: number): string {
  const age = Math.floor(Date.now() / 1000) - tsUnix;
  if (age < 60) return `${age}s`;
  if (age < 3600) return `${Math.floor(age / 60)}m`;
  return `${Math.floor(age / 3600)}h`;
}

interface JS8WidgetProps {
  stations: JS8Station[];
  logEntries: JS8LogEntry[];
  statusLine: JS8StatusLine;
  connected: boolean;
  js8Connected: boolean;
  kiwiConnecting?: boolean;
  activeKiwiConfig?: any;
  sendMessage: (target: string, message: string) => void;
  sendAction?: (payload: object) => void;
}

export const JS8Widget: React.FC<JS8WidgetProps> = ({
  stations,
  logEntries,
  statusLine,
  connected,
  js8Connected,
  kiwiConnecting,
  activeKiwiConfig,
  sendMessage,
  sendAction = () => { },
}) => {
  const [collapsed, setCollapsed] = useState(true);
  const [activeTab, setActiveTab] = useState<'HEARD' | 'CHAT' | 'SDR'>('HEARD');
  const [msgInput, setMsgInput] = useState('');
  const [msgTarget, setMsgTarget] = useState('@ALLCALL');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Default to 7078 unless we know the current active Kiwi freq
  const sdrFreq = activeKiwiConfig?.freq || 7078;
  const { nodes: rawNodes, loading: sdrLoading } = useKiwiNodes(sdrFreq, activeTab === 'SDR');

  // Deduplicate nodes by host:port
  const nodes = React.useMemo(() => {
    const seen = new Set<string>();
    return rawNodes.filter(n => {
      const key = `${n.host}:${n.port}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rawNodes]);

  const [editingCall, setEditingCall] = useState(false);
  const [editCallVal, setEditCallVal] = useState('');
  
  const [editingGrid, setEditingGrid] = useState(false);
  const [editGridVal, setEditGridVal] = useState('');

  const submitCall = () => {
    setEditingCall(false);
    if (editCallVal && editCallVal.toUpperCase() !== statusLine.callsign) {
      sendAction({ action: 'SET_STATION', callsign: editCallVal.toUpperCase() });
    }
  };

  const submitGrid = () => {
    setEditingGrid(false);
    if (editGridVal && editGridVal.toUpperCase() !== statusLine.grid) {
      sendAction({ action: 'SET_STATION', grid: editGridVal.toUpperCase() });
    }
  };

  useEffect(() => {
    if (activeTab === 'CHAT') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logEntries, activeTab]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!msgInput.trim() || !js8Connected) return;
    sendMessage(msgTarget.trim(), msgInput.trim());
    setMsgInput('');
  };

  return (
    <div className="font-mono overflow-visible widget-panel">
      {/* Header */}
      <div 
        className="flex items-center justify-between px-3 py-2 bg-white/5 border-b border-white/10 cursor-pointer transition-colors group"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-2 transition-opacity">
          <Radio size={14} className={connected ? 'text-purple-400' : 'text-slate-600'} />
          <span className="text-[10px] font-bold tracking-[.3em] text-white/50 uppercase">
            JS8 / HF Radio
          </span>
          <div
            className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-purple-500 animate-pulse' : 'bg-slate-700'
              }`}
          />
        </div>

        {/* Tab Buttons (Always Visible) */}
        <div className="flex bg-black/40 rounded p-0.5 ml-auto mr-2" role="tablist" aria-label="JS8Call View Tabs">
          <button
            role="tab"
            aria-selected={activeTab === 'HEARD'}
            aria-controls="js8-tabpanel-heard"
            id="js8-tab-heard"
            title="Heard Stations"
            aria-label="Heard Stations"
            onClick={(e) => { e.stopPropagation(); setActiveTab('HEARD'); setCollapsed(false); }}
            className={`px-2 py-0.5 rounded-sm transition-all flex items-center gap-1 focus-visible:ring-1 focus-visible:ring-indigo-400 outline-none ${activeTab === 'HEARD' ? 'bg-indigo-500/20 text-indigo-400' : 'text-white/20 hover:text-white/70 hover:bg-white/5'
              }`}
          >
            <Users size={11} aria-hidden="true" />
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'CHAT'}
            aria-controls="js8-tabpanel-chat"
            id="js8-tab-chat"
            title="Radio Terminal"
            aria-label="Radio Terminal"
            onClick={(e) => { e.stopPropagation(); setActiveTab('CHAT'); setCollapsed(false); }}
            className={`px-2 py-0.5 rounded-sm transition-all flex items-center gap-1 focus-visible:ring-1 focus-visible:ring-indigo-400 outline-none ${activeTab === 'CHAT' ? 'bg-indigo-500/20 text-indigo-400' : 'text-white/20 hover:text-white/70 hover:bg-white/5'
              }`}
          >
            <Terminal size={11} aria-hidden="true" />
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'SDR'}
            aria-controls="js8-tabpanel-sdr"
            id="js8-tab-sdr"
            title="KiwiSDR Network"
            aria-label="KiwiSDR Network"
            onClick={(e) => { e.stopPropagation(); setActiveTab('SDR'); setCollapsed(false); }}
            className={`px-2 py-0.5 rounded-sm transition-all flex items-center gap-1 focus-visible:ring-1 focus-visible:ring-indigo-400 outline-none ${activeTab === 'SDR' ? 'bg-indigo-500/20 text-indigo-400' : 'text-white/20 hover:text-white/70 hover:bg-white/5'
              }`}
          >
            <RadioReceiver size={11} aria-hidden="true" />
            {activeKiwiConfig?.host && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />}
          </button>
        </div>

        <div className="text-white/40 group-hover:text-white/70 transition-colors flex items-center justify-center">
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </div>
      </div>

      {/* Own station status (Always visible) */}
      <div className="px-3 py-1.5 flex items-center justify-between text-[9px] border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <span className="text-white/20 uppercase tracking-tighter">Station</span>
          {editingCall ? (
            <input
              autoFocus
              value={editCallVal}
              onChange={e => setEditCallVal(e.target.value)}
              onBlur={submitCall}
              onKeyDown={e => e.key === 'Enter' && submitCall()}
              className="bg-black/50 border border-indigo-500/30 text-indigo-300 font-bold px-1 py-0.5 rounded w-16 outline-none"
            />
          ) : (
            <span 
              className="text-indigo-300 font-bold hover:text-indigo-200 cursor-text transition-colors"
              onClick={() => { setEditCallVal(statusLine.callsign); setEditingCall(true); }}
              title="Edit Callsign"
            >
              {statusLine.callsign}
            </span>
          )}
          <span className="text-white/20 ml-1">/</span>
          {editingGrid ? (
            <input
              autoFocus
              value={editGridVal}
              onChange={e => setEditGridVal(e.target.value)}
              onBlur={submitGrid}
              onKeyDown={e => e.key === 'Enter' && submitGrid()}
              className="bg-black/50 border border-slate-500/30 text-slate-300 px-1 py-0.5 rounded w-12 outline-none uppercase"
              maxLength={6}
            />
          ) : (
            <span 
              className="text-slate-400 hover:text-slate-300 cursor-text transition-colors"
              onClick={() => { setEditGridVal(statusLine.grid); setEditingGrid(true); }}
              title="Edit Grid Square"
            >
              {statusLine.grid}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">
            {activeKiwiConfig?.host ? activeKiwiConfig.host : '--'}
          </span>
          <span className={`font-bold ${js8Connected ? 'text-cyan-400' : 'text-red-500/50'}`}>
            {js8Connected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {!collapsed && (
        <div className="flex flex-col">
          {/* Tab Content */}
          <div className={`flex flex-col transition-all duration-300 ${activeTab === 'CHAT' ? 'h-64' : 'h-48'}`}>
            {activeTab === 'HEARD' ? (
              <div id="js8-tabpanel-heard" role="tabpanel" aria-labelledby="js8-tab-heard" className="flex-1 overflow-y-auto scrollbar-none">
                {stations.length > 0 ? (
                  stations.map((s) => (
                    <div
                      key={s.callsign}
                      className="flex items-center justify-between px-3 py-1.5 hover:bg-white/5 border-b border-white/[0.03] group transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-indigo-300 font-bold text-[10px] shrink-0">
                          {s.callsign}
                        </span>
                        {s.grid && (
                          <div className="flex items-center gap-1 text-[9px] text-slate-500 min-w-0 opacity-60 group-hover:opacity-100">
                            <MapPin size={8} className="shrink-0" />
                            <span>{s.grid}</span>
                            {s.distance_km != null && (
                              <span className="text-blue-500/80 shrink-0">
                                {s.distance_km}km {bearingToCardinal(s.bearing_deg ?? 0)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className={`text-[9px] font-bold ${snrColor(s.snr)}`}>
                          {s.snr > 0 ? '+' : ''}{s.snr}
                        </span>
                        <span className="text-[8px] text-slate-700">{formatAge(s.ts_unix)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-[10px] text-slate-600 italic gap-2 opacity-50">
                    <Radio size={20} className="animate-pulse" />
                    <span>Scanning for signals...</span>
                  </div>
                )}
              </div>
            ) : activeTab === 'SDR' ? (
              <div id="js8-tabpanel-sdr" role="tabpanel" aria-labelledby="js8-tab-sdr" className="flex-1 overflow-y-auto scrollbar-none flex flex-col">
                <div className="px-3 py-1.5 bg-black/40 border-b border-white/5 flex items-center justify-between text-[9px]">
                  <span className="text-white/30 uppercase tracking-widest">KiwiSDR Network</span>
                  <span className="text-indigo-300 font-mono tracking-wider">{sdrFreq} kHz</span>
                </div>
                {sdrLoading && nodes.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-[10px] text-slate-600 italic gap-2 opacity-50">
                    <Activity size={20} className="animate-pulse" />
                    <span>Discovering SDR nodes...</span>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto">
                    {nodes.map(node => {
                      const isActive = activeKiwiConfig?.host === node.host && activeKiwiConfig?.port === node.port;
                      return (
                        <div key={`${node.host}:${node.port}`} className={`px-3 py-2 border-b border-white/5 group transition-colors ${isActive ? 'bg-indigo-500/10' : 'hover:bg-white/5'}`}>
                          <div className="flex items-center justify-between pointer-events-none mb-1">
                            <span className={`font-mono text-[10px] truncate max-w-[120px] ${isActive ? 'text-cyan-400 font-bold' : 'text-indigo-200'}`}>{node.host}</span>
                            <span className="text-[9px] text-slate-400 shrink-0 tabular-nums">
                              {node.distance_km != null ? `${node.distance_km}km` : ''}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {/* Simple signal load bar */}
                              <div className="flex gap-[1px]">
                                {[...Array(Math.max(1, Math.min(5, Math.ceil((node.users || 0) / Math.max(1, node.sq || 1) * 5))))].map((_, i) => (
                                  <div key={i} className={`w-0.5 h-1.5 rounded-full ${node.users && node.sq && node.users >= node.sq ? 'bg-red-500' : 'bg-indigo-500/80'}`} />
                                ))}
                              </div>
                              <span className="text-[8px] text-slate-500">
                                {node.snr != null ? `${node.snr}dB` : ''}
                              </span>
                            </div>
                            {isActive ? (
                              <button
                                onClick={() => sendAction({ action: 'DISCONNECT_KIWI' })}
                                className="px-2 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors pointer-events-auto focus-visible:ring-1 focus-visible:ring-red-400 outline-none"
                              >
                                {kiwiConnecting ? 'Busy...' : 'Disconnect'}
                              </button>
                            ) : (
                              <button
                                onClick={() => sendAction({ action: 'SET_KIWI', host: node.host, port: node.port, freq: sdrFreq, mode: 'usb' })}
                                disabled={kiwiConnecting || (node.users && node.sq && node.users >= node.sq) === true}
                                className="px-2 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 border border-indigo-500/20 transition-colors disabled:opacity-30 disabled:pointer-events-none pointer-events-auto focus-visible:ring-1 focus-visible:ring-indigo-400 outline-none"
                              >
                                Connect
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div id="js8-tabpanel-chat" role="tabpanel" aria-labelledby="js8-tab-chat" className="flex-1 flex flex-col bg-black/20 min-h-0">
                <div className="flex-1 overflow-y-auto scrollbar-none p-3 space-y-2">
                  {logEntries.length > 0 ? (
                    logEntries.map((entry) => (
                      <div key={entry.id} className="text-[10px] font-mono leading-relaxed border-l border-indigo-500/20 pl-2">
                        <div className="flex items-center justify-between mb-0.5 opacity-40">
                          <span className={`${entry.type === 'TX.SENT' ? 'text-amber-400' : 'text-indigo-400'} text-[8px] uppercase font-bold`}>
                            {entry.type === 'TX.SENT' ? 'Transmit' : 'RX Directed'}
                          </span>
                          <span className="text-[8px]">{entry.timestamp}</span>
                        </div>
                        <div className="break-words">
                          <span className="text-indigo-300 font-bold mr-1">{entry.from || 'LOCAL'}</span>
                          {entry.to && <span className="text-slate-600 mr-1">▶ {entry.to}</span>}
                          <span className="text-slate-300">{entry.text}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-[10px] text-slate-600 italic gap-2 opacity-50">
                      <Terminal size={20} />
                      <span>Radio terminal ready...</span>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Message Input */}
                <form onSubmit={handleSend} className="p-2 border-t border-white/5 bg-white/[0.03] shrink-0">
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={msgTarget}
                      onChange={(e) => setMsgTarget(e.target.value)}
                      placeholder="To"
                      className="w-16 bg-black/40 border border-white/10 rounded-sm px-1.5 py-1 text-[10px] text-indigo-300 placeholder:text-white/10 focus:border-indigo-500/50 outline-none"
                    />
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={msgInput}
                        onChange={(e) => setMsgInput(e.target.value)}
                        placeholder={js8Connected ? "Type message..." : "RADIO OFFLINE"}
                        disabled={!js8Connected}
                        className="w-full bg-black/40 border border-white/10 rounded-sm pl-2 pr-7 py-1 text-[10px] text-slate-300 placeholder:text-white/10 focus:border-indigo-500/50 outline-none disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={!msgInput.trim() || !js8Connected}
                        className="absolute right-1 top-1/2 -translate-y-1/2 text-indigo-400 hover:text-indigo-300 disabled:opacity-30 p-0.5 focus-visible:ring-1 focus-visible:ring-indigo-400 outline-none rounded"
                      >
                        <Send size={11} />
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

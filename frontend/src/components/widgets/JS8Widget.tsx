import React, { useState, useRef, useEffect } from 'react';
import { Radio, MapPin, ChevronDown, ChevronUp, Send, Terminal, Users } from 'lucide-react';
import type { JS8Station, JS8LogEntry, JS8StatusLine } from '../../types';

function snrColor(snr: number): string {
  if (snr >= -10) return 'text-emerald-400';
  if (snr >= -18) return 'text-yellow-400';
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
  sendMessage: (target: string, message: string) => void;
}

export const JS8Widget: React.FC<JS8WidgetProps> = ({
  stations,
  logEntries,
  statusLine,
  connected,
  js8Connected,
  sendMessage,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'HEARD' | 'CHAT'>('HEARD');
  const [msgInput, setMsgInput] = useState('');
  const [msgTarget, setMsgTarget] = useState('@ALLCALL');
  const chatEndRef = useRef<HTMLDivElement>(null);

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
    <div className="bg-black/40 border border-tactical-border rounded-sm backdrop-blur-md font-mono overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-white/5">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <Radio size={13} className={connected ? 'text-indigo-400' : 'text-slate-600'} />
          <span className="text-[10px] font-bold tracking-[.3em] text-white/50 uppercase">
            JS8 / HF Radio
          </span>
          <div
            className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-indigo-500 animate-pulse' : 'bg-slate-700'
              }`}
          />
        </button>
        <div className="flex items-center gap-3">
          {!collapsed && (
            <div className="flex bg-black/40 rounded-sm p-0.5 border border-white/5">
              <button
                onClick={() => setActiveTab('HEARD')}
                className={`px-2 py-0.5 rounded-sm transition-all ${activeTab === 'HEARD' ? 'bg-indigo-500/20 text-indigo-400' : 'text-white/20 hover:text-white/40'
                  }`}
              >
                <Users size={11} />
              </button>
              <button
                onClick={() => setActiveTab('CHAT')}
                className={`px-2 py-0.5 rounded-sm transition-all ${activeTab === 'CHAT' ? 'bg-indigo-500/20 text-indigo-400' : 'text-white/20 hover:text-white/40'
                  }`}
              >
                <Terminal size={11} />
              </button>
            </div>
          )}
          <button onClick={() => setCollapsed((v) => !v)} className="text-white/30 hover:text-white/60">
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="flex flex-col">
          {/* Own station status */}
          <div className="px-3 py-1.5 flex items-center justify-between text-[9px] border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <span className="text-white/20 uppercase tracking-tighter">Station</span>
              <span className="text-indigo-300 font-bold">{statusLine.callsign}</span>
              <span className="text-white/20 ml-1">/</span>
              <span className="text-slate-400">{statusLine.grid}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">{statusLine.freq}</span>
              <span className={`font-bold ${js8Connected ? 'text-cyan-400' : 'text-red-500/50'}`}>
                {js8Connected ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
          </div>

          {/* Tab Content */}
          <div className="h-48 flex flex-col">
            {activeTab === 'HEARD' ? (
              <div className="flex-1 overflow-y-auto scrollbar-none">
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
            ) : (
              <div className="flex-1 flex flex-col bg-black/20">
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
                <form onSubmit={handleSend} className="p-2 border-t border-white/5 bg-white/[0.03]">
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
                        className="absolute right-1 top-1/2 -translate-y-1/2 text-indigo-400 hover:text-indigo-300 disabled:opacity-30 p-0.5"
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

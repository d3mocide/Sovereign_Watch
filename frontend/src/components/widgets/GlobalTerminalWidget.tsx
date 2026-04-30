import React, { useState, useEffect, useRef } from 'react';
import { Terminal, X, Play, Pause, Copy, Check, Trash2 } from 'lucide-react';
import { syntaxHighlightJson } from '../../utils/syntaxHighlight';
import { CoTEntity } from '../../types';

interface GlobalTerminalWidgetProps {
  onClose: () => void;
  // A ref to the global stream of entities that we will sample from
  entitiesRef?: React.MutableRefObject<Map<string, CoTEntity>>;
  satellitesRef?: React.MutableRefObject<Map<string, CoTEntity>>;
}

export const GlobalTerminalWidget: React.FC<GlobalTerminalWidgetProps> = ({ onClose, entitiesRef, satellitesRef }) => {
  const [logs, setLogs] = useState<{ id: string; time: number; type: string; raw: string; uid: string }[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 5 | 10>(2); // Default to 2X slower (1000ms)

  const MAX_LOGS = 50;
  const logsRef = useRef(logs);
  logsRef.current = logs;

  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Instead of passing a callback deep into `useEntityWorker`, we'll set up a lightweight polling mechanism
  // on the `entitiesRef` to grab the newest arriving raw payloads.
  // This avoids massive re-renders or prop-drilling into the worker hook.
  useEffect(() => {
    if (!entitiesRef || !satellitesRef) return;

    let lastKnownUids = new Set<string>();

    const pollInterval = setInterval(() => {
        if (isPausedRef.current) return;

        const newLogs: { id: string; time: number; type: string; raw: string; uid: string }[] = [];

        // Scan air/sea
        let addedCount = 0;
        const MAX_PER_TICK = 5;

        // Convert to array and shuffle/sort to pick interesting samples if there are many
        const allEntities = Array.from(entitiesRef.current.values());
        
        for (const entity of allEntities) {
            if (addedCount >= MAX_PER_TICK) break;
            
            if (entity.raw && entity.lastSeen > Date.now() - 3000) {
                const logId = `${entity.uid}-${entity.time || entity.lastSeen}`;
                if (!lastKnownUids.has(logId)) {
                    newLogs.push({
                        id: logId,
                        time: Date.now(),
                        type: entity.type,
                        raw: entity.raw,
                        uid: entity.uid
                    });
                    lastKnownUids.add(logId);
                    addedCount++;
                }
            }
        }

        // Scan sats (only if we have room)
        if (addedCount < MAX_PER_TICK) {
            satellitesRef.current.forEach((entity, uid) => {
                if (addedCount >= MAX_PER_TICK) return;
                if (entity.raw && entity.lastSeen > Date.now() - 3000) {
                    const logId = `${uid}-${entity.time || entity.lastSeen}`;
                    if (!lastKnownUids.has(logId)) {
                        newLogs.push({
                            id: logId,
                            time: Date.now(),
                            type: entity.type,
                            raw: entity.raw,
                            uid: entity.uid
                        });
                        lastKnownUids.add(logId);
                        addedCount++;
                    }
                }
            });
        }

        if (newLogs.length > 0) {
            setLogs(prev => {
                const combined = [...prev, ...newLogs];
                return combined.slice(-MAX_LOGS); 
            });

            setTimeout(() => {
                if (logsEndRef.current) {
                    logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
                }
            }, 100);
        }

        if (lastKnownUids.size > 1000) {
            lastKnownUids = new Set(Array.from(lastKnownUids).slice(-500));
        }

    }, 500 * speed);

    return () => clearInterval(pollInterval);
  }, [entitiesRef, satellitesRef, speed]);


  const handleCopy = () => {
    const textToCopy = logs.map(l => l.raw).join('\n\n');
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
      setLogs([]);
  };

  return (
    <div className="absolute right-4 top-16 w-[800px] h-[600px] z-50 bg-black/90 backdrop-blur-md border border-tactical-border rounded shadow-2xl flex flex-col animate-in fade-in slide-in-from-top-4 duration-200">

      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-white/10 bg-gradient-to-r from-hud-green/10 to-transparent">
        <div className="flex items-center gap-2 text-hud-green">
          <Terminal size={14} />
          <span className="text-xs font-bold tracking-widest">RAW_STREAM_TERMINAL</span>
          <div className={`w-2 h-2 rounded-full ml-2 ${isPaused ? 'bg-amber-500' : 'bg-hud-green animate-pulse'}`} />
        </div>

        <div className="flex items-center gap-1">
           {/* Speed Selectors */}
           <div className="flex bg-white/5 rounded p-0.5 mr-2 border border-white/5">
              {[1, 2, 5, 10].map(s => (
                <button
                  key={s}
                  onClick={() => setSpeed(s as 1 | 2 | 5 | 10)}
                  className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition-all focus-visible:ring-1 focus-visible:ring-hud-green outline-none ${speed === s ? 'bg-hud-green/20 text-hud-green' : 'text-white/30 hover:text-white/60'}`}
                >
                  {s === 1 ? 'REAL' : `${s}X`}
                </button>
              ))}
           </div>

           <button
            onClick={() => setIsPaused(!isPaused)}
            className="p-1.5 hover:bg-white/10 rounded text-white/50 hover:text-white transition-colors focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
            title={isPaused ? "Resume Stream" : "Pause Stream"}
            aria-label="Toggle Stream Playback"
            aria-pressed={isPaused}
          >
            {isPaused ? <Play size={14} className="text-amber-500" /> : <Pause size={14} />}
          </button>
          <button
            onClick={handleCopy}
            className="p-1.5 hover:bg-white/10 rounded text-white/50 hover:text-white transition-colors focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
            title="Copy All"
            aria-label="Copy All stream logs"
          >
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          </button>
           <button
            onClick={handleClear}
            className="p-1.5 hover:bg-white/10 rounded text-white/50 hover:text-white transition-colors focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
            title="Clear Stream"
            aria-label="Clear Stream logs"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-red-500/20 rounded text-white/50 hover:text-red-400 transition-colors ml-1 focus-visible:ring-1 focus-visible:ring-red-400 outline-none"
            title="Close Terminal"
            aria-label="Close Terminal"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Terminal Body */}
      <div
        className="flex-1 overflow-y-auto p-3 custom-scrollbar font-mono text-[10px] space-y-3"
        aria-live="polite"
        aria-busy={logs.length === 0}
      >
        {logs.length === 0 ? (
           <div className="h-full flex flex-col items-center justify-center gap-3 text-white/30 tracking-widest animate-pulse">
               <Terminal size={24} className="text-white/10" aria-hidden="true" />
               <span>AWAITING_PAYLOAD_STREAM...</span>
           </div>
        ) : (
            logs.map((log) => (
            <div key={log.id} className="border border-white/5 rounded bg-black/50 overflow-hidden">
                <div className="flex justify-between items-center px-2 py-1 bg-white/5 border-b border-white/5 text-[9px] text-white/40">
                    <span className="text-cyan-400">UID: {log.uid}</span>
                    <span>{new Date(log.time).toISOString().split('T')[1].slice(0, -1)}</span>
                </div>
                <pre
                    className="p-2 text-white overflow-x-auto select-all whitespace-pre-wrap break-all"
                    dangerouslySetInnerHTML={{ __html: syntaxHighlightJson(log.raw) }}
                />
            </div>
            ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
};

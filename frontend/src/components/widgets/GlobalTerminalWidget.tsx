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
        entitiesRef.current.forEach((entity, uid) => {
            // Find recent ones we haven't logged recently
            if (entity.raw && entity.lastSeen > Date.now() - 2000) {
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
                }
            }
        });

        // Scan sats (sampled, don't overwhelm)
        let satCount = 0;
        satellitesRef.current.forEach((entity, uid) => {
             if (satCount > 5) return; // limit sat updates per tick
             if (entity.raw && entity.lastSeen > Date.now() - 2000) {
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
                    satCount++;
                }
            }
        });

        if (newLogs.length > 0) {
            setLogs(prev => {
                const combined = [...prev, ...newLogs];
                return combined.slice(-MAX_LOGS); // Keep last 50
            });

            // Auto scroll
            setTimeout(() => {
                if (logsEndRef.current) {
                    logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
                }
            }, 100);
        }

        // Cleanup set
        if (lastKnownUids.size > 1000) {
            lastKnownUids = new Set(Array.from(lastKnownUids).slice(-500));
        }

    }, 500);

    return () => clearInterval(pollInterval);
  }, [entitiesRef, satellitesRef]);


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
    <div className="absolute right-4 top-16 w-96 h-[600px] z-50 bg-black/90 backdrop-blur-md border border-tactical-border rounded shadow-2xl flex flex-col animate-in fade-in slide-in-from-top-4 duration-200">

      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-white/10 bg-gradient-to-r from-hud-green/10 to-transparent">
        <div className="flex items-center gap-2 text-hud-green">
          <Terminal size={14} />
          <span className="text-xs font-bold tracking-widest">RAW_STREAM_TERMINAL</span>
          <div className={`w-2 h-2 rounded-full ml-2 ${isPaused ? 'bg-amber-500' : 'bg-hud-green animate-pulse'}`} />
        </div>

        <div className="flex items-center gap-1">
           <button
            onClick={() => setIsPaused(!isPaused)}
            className="p-1.5 hover:bg-white/10 rounded text-white/50 hover:text-white transition-colors"
            title={isPaused ? "Resume Stream" : "Pause Stream"}
          >
            {isPaused ? <Play size={14} className="text-amber-500" /> : <Pause size={14} />}
          </button>
          <button
            onClick={handleCopy}
            className="p-1.5 hover:bg-white/10 rounded text-white/50 hover:text-white transition-colors"
            title="Copy All"
          >
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          </button>
           <button
            onClick={handleClear}
            className="p-1.5 hover:bg-white/10 rounded text-white/50 hover:text-white transition-colors"
            title="Clear Stream"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-red-500/20 rounded text-white/50 hover:text-red-400 transition-colors ml-1"
            title="Close Terminal"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Terminal Body */}
      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar font-mono text-[10px] space-y-3">
        {logs.length === 0 ? (
           <div className="h-full flex items-center justify-center text-white/30 tracking-widest animate-pulse">
               AWAITING_PAYLOAD_STREAM...
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

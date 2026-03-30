import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { LogEntry } from './types';

interface Props {
  logs: LogEntry[];
  nodeCount: number;
  isExpanded: boolean;
  onToggle: () => void;
}

export default function LogBar({ logs, nodeCount, isExpanded, onToggle }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAutoScroll, setIsAutoScroll] = useState(true);

  useEffect(() => {
    if (isAutoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, isAutoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setIsAutoScroll(scrollHeight - scrollTop <= clientHeight + 50);
  };

  return (
    <div
      className={`bg-black border-t border-primary/20 transition-all duration-300 ease-in-out flex flex-col relative z-20 overflow-hidden shrink-0 ${
        isExpanded ? 'h-48' : 'h-10'
      }`}
    >
      <div
        onClick={onToggle}
        className="flex items-center justify-between px-6 h-10 border-b border-primary/5 bg-surface-container-low/50 cursor-pointer hover:bg-surface-container-high/50 transition-all select-none group"
      >
        <div className="flex items-center gap-2 font-headline uppercase">
          <span className={`w-1.5 h-1.5 bg-primary ${isExpanded ? 'animate-pulse' : ''}`}></span>
          <h3 className="text-[10px] font-bold text-primary tracking-[0.2em]">Live Command Logs</h3>
          {isExpanded
            ? <ChevronDown size={14} className="text-primary/40 group-hover:text-primary transition-colors" />
            : <ChevronUp size={14} className="text-primary/40 group-hover:text-primary transition-colors" />}
        </div>
        <div className="flex gap-6 items-center">
          <span className="text-[9px] text-primary/40 font-mono hidden sm:inline uppercase">
            NODES_WATCH :: {nodeCount} ACTIVE
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-on-surface-variant font-mono uppercase">Status:</span>
            <span className="text-[10px] text-primary font-mono animate-pulse uppercase">
              {isAutoScroll ? 'Following' : 'Paused'}
            </span>
          </div>
        </div>
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={`p-4 overflow-y-auto font-mono text-[9px] space-y-1 bg-black/40 custom-scrollbar transition-opacity duration-300 ${
          isExpanded ? 'flex-1 opacity-100' : 'hidden opacity-0 pointer-events-none'
        }`}
      >
        {logs.map((log, idx) => (
          <p
            key={`${log.ts}-${idx}`}
            className={`hover:brightness-125 transition-all cursor-default ${
              log.level === 'ERROR' || log.level === 'CRITICAL'
                ? 'text-red-400/70'
                : log.level === 'WARNING'
                ? 'text-yellow-400/80'
                : 'text-primary/60'
            }`}
          >
            <span className="opacity-30 mr-4">[{new Date(log.ts).toLocaleTimeString()}]</span>
            <span
              className={`mr-2 text-[8px] ${
                log.level === 'ERROR' || log.level === 'CRITICAL'
                  ? 'text-red-400'
                  : log.level === 'WARNING'
                  ? 'text-yellow-400'
                  : 'text-primary/40'
              }`}
            >
              [{log.level}]
            </span>
            {log.msg}
          </p>
        ))}
        {logs.length === 0 && (
          <p className="text-on-surface-variant/40 uppercase text-[9px] animate-pulse">
            Waiting for log entries...
          </p>
        )}
        <p className="animate-pulse text-primary/30">_</p>
      </div>
    </div>
  );
}

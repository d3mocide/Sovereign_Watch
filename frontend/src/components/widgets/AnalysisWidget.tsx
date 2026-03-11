import React, { useEffect, useRef, useState } from 'react';
import { BrainCircuit, ChevronDown, ChevronUp, Copy, Check, Loader2, AlertTriangle, X } from 'lucide-react';
import { useAnalysis } from '../../hooks/useAnalysis';

const LOOKBACK_OPTIONS = [
  { label: '1 h', value: 1 },
  { label: '6 h', value: 6 },
  { label: '12 h', value: 12 },
  { label: '24 h', value: 24 },
  { label: '48 h', value: 48 },
  { label: '72 h', value: 72 },
];

interface AnalysisWidgetProps {
  uid: string;
  accentColor?: string; // e.g. 'text-air-accent' | 'text-sea-accent'
  compactMode?: boolean; // If true, render as a single button until activated
}

export const AnalysisWidget: React.FC<AnalysisWidgetProps> = ({
  uid,
  accentColor = 'text-air-accent',
  compactMode = false,
}) => {
  const { text, isStreaming, error, generatedAt, run, reset } = useAnalysis();
  const [lookback, setLookback] = useState(24);
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll as tokens arrive
  useEffect(() => {
    if (isStreaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text, isStreaming]);

  // Cancel stream on uid change
  useEffect(() => {
    return () => { reset(); };
  }, [uid, reset]);

  const handleRun = () => {
    run(uid, lookback);
    setIsCollapsed(false);
  };

  const handleCopy = () => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    });
  };

  let accentBorder = 'border-air-accent/30';
  let accentBg = 'bg-gradient-to-br from-air-accent/10 to-air-accent/5';

  if (accentColor.includes('sea')) {
    accentBorder = 'border-sea-accent/30';
    accentBg = 'bg-gradient-to-br from-sea-accent/10 to-sea-accent/5';
  } else if (accentColor.includes('purple')) {
    accentBorder = 'border-purple-400/30';
    accentBg = 'bg-gradient-to-br from-purple-400/10 to-purple-400/5';
  } else if (accentColor.includes('indigo')) {
    accentBorder = 'border-indigo-400/30';
    accentBg = 'bg-gradient-to-br from-indigo-400/10 to-indigo-400/5';
  } else if (accentColor.includes('teal')) {
    accentBorder = 'border-teal-400/30';
    accentBg = 'bg-gradient-to-br from-teal-400/10 to-teal-400/5';
  } else if (accentColor.includes('cyan')) {
    accentBorder = 'border-cyan-400/30';
    accentBg = 'bg-gradient-to-br from-cyan-400/10 to-cyan-400/5';
  }

  const isActive = !!(text || isStreaming || error);
  const showCompact = compactMode && (!isActive || isCollapsed);

  if (showCompact) {
    return (
      <button
        onClick={isActive ? () => setIsCollapsed(false) : handleRun}
        className={`flex-1 flex items-center justify-between px-3 py-2 border ${accentBorder} ${accentBg} hover:bg-white/10 rounded-sm group transition-all focus-visible:ring-1 focus-visible:ring-violet-400 outline-none`}
      >
        <div className="flex items-center gap-2">
          <BrainCircuit size={13} className={accentColor} />
          <span className="text-[10px] font-bold tracking-[.3em] text-white/50 group-hover:text-white/80 transition-colors">AI_ANALYST</span>
        </div>
      </button>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${compactMode ? 'col-span-2' : ''}`}>
      {/* Header row */}
      <div className={`flex items-center justify-between px-3 py-2 border ${accentBorder} ${accentBg} rounded-sm backdrop-blur-md`}>
        <div className="flex items-center gap-2">
          <BrainCircuit size={13} className={accentColor} />
          <span className="text-[10px] font-bold tracking-[.3em] text-white/50">AI_ANALYST</span>
        </div>

        {/* Controls: lookback + run */}
        <div className="flex items-center gap-2">
          {/* Lookback selector */}
          <div className="relative flex items-center">
            <select
              value={lookback}
              onChange={e => setLookback(Number(e.target.value))}
              disabled={isStreaming}
              className="appearance-none bg-black/60 border border-white/10 rounded px-2 py-0.5 pr-5 text-[10px] text-white/60 font-mono focus:outline-none focus:border-white/30 disabled:opacity-40 cursor-pointer"
            >
              {LOOKBACK_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown size={10} className="absolute right-1.5 text-white/30 pointer-events-none" />
          </div>

          {isStreaming ? (
            <button
              onClick={reset}
              title="Cancel analysis"
              className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 rounded text-[10px] text-white/40 hover:text-red-400 transition-colors focus-visible:ring-1 focus-visible:ring-red-400 outline-none"
            >
              <X size={10} />
            </button>
          ) : (
            <button
              onClick={handleRun}
              title="Run AI analysis"
              className={`flex items-center gap-1.5 px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[10px] font-bold tracking-widest ${accentColor} hover:opacity-100 opacity-70 transition-all focus-visible:ring-1 focus-visible:ring-violet-400 outline-none`}
            >
              RUN
            </button>
          )}
          {compactMode && (
            <button
              onClick={() => setIsCollapsed(true)}
              title="Collapse"
              className="flex items-center justify-center p-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-white/40 hover:text-white/70 transition-colors ml-1 focus-visible:ring-1 focus-visible:ring-violet-400 outline-none"
            >
              <ChevronUp size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Output area — only shown once analysis has started */}
      {isActive && (
        <div className="flex flex-col border border-white/10 rounded-sm bg-black/60 backdrop-blur-md overflow-hidden">
          {/* Output header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
            <div className="flex items-center gap-2">
              {isStreaming && (
                <Loader2 size={10} className={`${accentColor} animate-spin`} />
              )}
              <span className="text-[9px] font-mono text-white/30 tracking-widest">
                {isStreaming ? 'RECEIVING...' : generatedAt
                  ? `GENERATED ${generatedAt.toLocaleTimeString()}`
                  : 'ASSESSMENT'}
              </span>
            </div>
            {text && !isStreaming && (
              <button
                onClick={handleCopy}
                title="Copy assessment"
                className="p-1 hover:bg-white/10 rounded text-white/30 hover:text-white/70 transition-colors focus-visible:ring-1 focus-visible:ring-violet-400 outline-none"
              >
                {copied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
              </button>
            )}
          </div>

          {/* Scrollable text body */}
          <div
            ref={scrollRef}
            className="max-h-64 overflow-y-auto p-3 custom-scrollbar"
          >
            {error ? (
              <div className="flex items-start gap-2 text-[10px] font-mono text-red-400/80">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            ) : (
              <p className="text-[10px] font-mono text-white/70 leading-relaxed whitespace-pre-wrap">
                {text}
                {isStreaming && (
                  <span className={`inline-block w-1.5 h-3 ml-0.5 ${accentColor.replace('text-', 'bg-')} animate-pulse align-middle`} />
                )}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

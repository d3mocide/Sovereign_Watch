import { useEffect, useRef, useState } from 'react';
import { BrainCircuit, Copy, Check, Loader2, AlertTriangle, X, Settings, Activity, Lock } from 'lucide-react';
import { useAnalysis } from '../../hooks/useAnalysis';
import { useAIConfig } from '../../hooks/useAIConfig';
import { useAuth } from '../../hooks/useAuth';
import { CoTEntity } from '../../types';
import { AnalysisFormatter } from './AnalysisFormatter';
import { copyTextToClipboard, formatAnalysisText } from './aiAnalystFormatting.ts';

interface AIAnalystPanelProps {
  entity: CoTEntity | null;
  onClose: () => void;
  isOpen: boolean;
  // allow injecting an initial trigger to run the analysis immediately when opened
  autoRunTrigger?: number;
  isSidebarClosed?: boolean;
}

type CopyState = 'idle' | 'copied' | 'failed';

const LOOKBACK_OPTIONS = [
  { label: '1 h', value: 1 },
  { label: '6 h', value: 6 },
  { label: '12 h', value: 12 },
  { label: '24 h', value: 24 },
  { label: '48 h', value: 48 },
  { label: '72 h', value: 72 },
  { label: '7 d', value: 168 },
];

const MODE_OPTIONS = [
  { label: 'Tactical', value: 'tactical' },
  { label: 'OSINT', value: 'osint' },
  { label: 'SAR', value: 'sar' },
];

export const AIAnalystPanel: React.FC<AIAnalystPanelProps> = ({ 
  entity, 
  onClose, 
  isOpen, 
  autoRunTrigger,
  isSidebarClosed = false
}) => {
  const { text, isStreaming, error, advisory, generatedAt, run, reset } = useAnalysis();
  const { config: aiConfig, isSaving, selectModel } = useAIConfig();
  const { hasRole } = useAuth();
  const entityUid = entity?.uid;

  const isOperator = hasRole('operator');
  const isAdmin = hasRole('admin');

  const [lookback, setLookback] = useState(1);
  const [mode, setMode] = useState('tactical');
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll as tokens arrive
  useEffect(() => {
    if (isStreaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text, isStreaming]);

  // Cancel stream on uid change or when closing
  useEffect(() => {
    if (!isOpen || !entityUid) {
      reset();
    }
  }, [entityUid, isOpen, reset]);

  // Handle settings drawer reset during render instead of effect to avoid cascading renders
  if (!isOpen && isSettingsOpen) {
    setIsSettingsOpen(false);
  }

  const isSitrep = entityUid?.startsWith('sitrep-');

  // Handle auto-run when triggered from the sidebar
  const lastStateRef = useRef({ entityUid, autoRunTrigger, isOpen });

  useEffect(() => {
    // Sync default mode based on entity type
    if (isSitrep) {
      setMode('osint');
    } else {
      setMode('tactical');
    }
  }, [entityUid, isSitrep]);

  useEffect(() => {
    // If the panel just opened and we have a trigger, or the trigger changed while open
    if (isOpen && entityUid && autoRunTrigger && (autoRunTrigger !== lastStateRef.current.autoRunTrigger || !lastStateRef.current.isOpen)) {
      if (isOperator) {
        const sitrepContext = isSitrep ? entity?.detail?.sitrep_context : undefined;
        run(entityUid, lookback, mode, sitrepContext, isSitrep, entity);
      }
    }
    lastStateRef.current = { entityUid, autoRunTrigger, isOpen };
  }, [autoRunTrigger, isOpen, entityUid, lookback, mode, run, entity, isSitrep, isOperator]);

  const handleRun = () => {
    if (!entity || !isOperator) return;
    const sitrepContext = isSitrep ? entity.detail?.sitrep_context : undefined;
    run(entity.uid, lookback, mode, sitrepContext, isSitrep, entity);
  };

  const handleCopy = async () => {
    if (!text) return;
    const cleanText = formatAnalysisText(text);
    try {
      await copyTextToClipboard(cleanText);
      setCopyState('copied');
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyState('idle'), 2000);
    } catch (error) {
      console.warn('Failed to copy AI analyst output.', error);
      setCopyState('failed');
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyState('idle'), 2500);
    }
  };

  if (!isOpen) return null;

  // Determine accent color based on entity type
  let accentColor = 'text-white/50';
  let accentBorder = 'border-white/20';
  let accentBg = 'bg-black/80';
  let domainLabel = 'Tactical';

  if (entity) {
    if (isSitrep) {
      accentColor = 'text-hud-green';
      accentBorder = 'border-hud-green/30';
      accentBg = 'bg-gradient-to-br from-black/90 to-hud-green/5';
    } else {
      const isShip = entity.type.includes('S');
// ... [keeping existing logic for colors] ...
      const isSat = entity.type === 'a-s-K' || entity.type.indexOf('K') === 4;
      const isTower = entity.type === 'tower';
      const isRepeater = entity.type === 'repeater';
      const isJS8 = entity.type === 'js8';
      const isInfra = entity.type === 'infra';

      let isOutage = false;
      let severity = 0;
      if (isInfra && entity.detail?.properties) {
         const props = entity.detail.properties as Record<string, unknown>;
         isOutage = props.entity_type === 'outage' || (typeof props.id === 'string' && props.id.includes('outage')) || props.severity !== undefined;
         severity = Number(props.severity || 0);
      }

      if (isSat) {
        domainLabel = 'Orbital';
        accentColor = 'text-purple-400';
        accentBorder = 'border-purple-400/30';
        accentBg = 'bg-gradient-to-br from-black/90 to-purple-400/5';
      } else if (isShip) {
        domainLabel = 'Sea';
        accentColor = 'text-sea-accent';
        accentBorder = 'border-sea-accent/30';
        accentBg = 'bg-gradient-to-br from-black/90 to-sea-accent/5';
      } else if (isTower) {
        accentColor = 'text-orange-400';
        accentBorder = 'border-orange-400/30';
        accentBg = 'bg-gradient-to-br from-black/90 to-orange-400/5';
      } else if (isRepeater) {
        accentColor = 'text-teal-400';
        accentBorder = 'border-teal-400/30';
        accentBg = 'bg-gradient-to-br from-black/90 to-teal-400/5';
      } else if (isJS8) {
        accentColor = 'text-indigo-400';
        accentBorder = 'border-indigo-400/30';
        accentBg = 'bg-gradient-to-br from-black/90 to-indigo-400/5';
      } else if (isInfra) {
        if (isOutage) {
          if (severity > 50) {
            accentColor = 'text-red-400';
            accentBorder = 'border-red-400/30';
            accentBg = 'bg-gradient-to-br from-black/90 to-red-400/5';
          } else {
            accentColor = 'text-amber-400';
            accentBorder = 'border-amber-400/30';
            accentBg = 'bg-gradient-to-br from-black/90 to-amber-400/5';
          }
        } else {
          accentColor = 'text-cyan-400';
          accentBorder = 'border-cyan-400/30';
          accentBg = 'bg-gradient-to-br from-black/90 to-cyan-400/5';
        }
      } else {
        domainLabel = 'Air';
        accentColor = 'text-air-accent';
        accentBorder = 'border-air-accent/30';
        accentBg = 'bg-gradient-to-br from-black/90 to-air-accent/5';
      }
    }
  }

  const activeModelLabel = aiConfig?.available_models.find(m => m.id === aiConfig.active_model)?.label ?? aiConfig?.active_model ?? "AI ENGINE";

  return (
    <div className={`absolute top-[80px] z-[2000] w-[450px] animate-in slide-in-from-right fade-in duration-300 ${
      isSidebarClosed ? 'right-4' : 'right-[420px]'
    }`}>
      <div className={`flex flex-col border ${accentBorder} ${accentBg} backdrop-blur-xl rounded shadow-2xl overflow-hidden shadow-black/50`}>

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-black/80 relative overflow-hidden">
          {/* Subtle top gloss */}
          <div className={`absolute top-0 left-0 w-full h-[1px] ${accentColor.replace('text-', 'bg-')} opacity-30`} />
          
          <div className="flex items-center gap-2 relative z-10">
            <div className={`p-1 rounded-sm ${accentColor.replace('text-', 'bg-')}/10`}>
               <BrainCircuit size={14} className={accentColor} />
            </div>
            <span className="text-[10px] font-black tracking-[.4em] text-white/90 uppercase">
               {isSitrep ? 'Strategic Intelligence Report' : 'AI Analyst Panel'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 relative z-10">
            <div className="flex items-center gap-2 mr-2 border border-white/5 bg-white/5 px-2 py-0.5 rounded-sm">
               <span className="text-[7px] font-black text-white/20 tracking-[.2em] uppercase mt-px">Engine</span>
               <span className={`${accentColor} text-[8px] font-black tracking-widest opacity-80 uppercase`}>{activeModelLabel}</span>
            </div>
            {isAdmin && (
              <button
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className={`p-1.5 rounded-sm transition-all ${isSettingsOpen ? 'bg-white/20 text-white shadow-[0_0_10px_rgba(255,255,255,0.2)]' : 'hover:bg-white/10 text-white/40 hover:text-white/80'}`}
                title="AI Engine Settings"
                aria-label="AI Engine Settings"
              >
                <Settings size={13} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-red-500/10 rounded-sm text-white/30 hover:text-red-400 transition-all group"
              title="Close Panel"
              aria-label="Close Panel"
            >
              <X size={14} className="group-hover:rotate-90 transition-transform duration-300" />
            </button>
          </div>
        </div>

        {/* Scanline Overlay Effect */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-[3000] overflow-hidden">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />
        </div>

        {/* Model Selection Drawer (Conditionally rendered) */}
        {isSettingsOpen && (
          <div className="border-b border-white/5 bg-black/90 p-3 space-y-2 animate-in slide-in-from-top-1 fade-in duration-300 relative z-20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-black tracking-[.3em] text-white/40 uppercase">Select Processing Engine</span>
              {!aiConfig && <Loader2 size={10} className="animate-spin text-white/30" />}
            </div>
            <div className="grid grid-cols-1 gap-1">
              {aiConfig?.available_models.map(model => {
                const isActive = model.id === aiConfig.active_model;
                return (
                  <button
                    key={model.id}
                    disabled={isSaving}
                    onClick={() => {
                      selectModel(model.id);
                      setIsSettingsOpen(false);
                    }}
                    className={`flex items-center justify-between px-3 py-2 rounded-sm border transition-all text-left group ${isActive
                      ? 'bg-hud-green/10 border-hud-green/40 shadow-[0_0_15px_rgba(0,255,65,0.05)]'
                      : 'bg-white/[0.02] border-white/5 hover:bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className={`text-[10px] font-black tracking-widest uppercase ${isActive ? 'text-hud-green' : 'text-white/60 group-hover:text-white/90'}`}>
                        {model.label}
                      </span>
                      <span className={`text-[8px] font-mono mt-0.5 ${model.local ? 'text-blue-400/80' : 'text-white/30 group-hover:text-white/50'}`}>
                        {model.local ? 'LOCAL INSTANCE · ' : ''}{model.provider.toUpperCase()}
                      </span>
                    </div>
                    {isActive && (
                        <div className="flex items-center gap-2">
                             <div className="h-1 w-1 rounded-full bg-hud-green animate-pulse shadow-[0_0_8px_#00ff41]" />
                             <span className="text-[8px] font-black text-hud-green tracking-tighter">ACTIVE</span>
                        </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Target Info & Controls */}
        {/* Target Info & Controls */}
        <div className="px-5 py-4 border-b border-white/5 bg-white/[0.03] space-y-4">
          {/* Row 1: Target Entity and Run Button */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col min-w-0 flex-1 pr-4">
              <span className="text-[8px] font-black tracking-[.4em] text-white/30 uppercase mb-1.5 flex items-center gap-1.5">
                 <div className="w-1.5 h-[1px] bg-white/20" />
                 {isSitrep ? 'Mission Intelligence' : 'Target Entity'}
              </span>
              <span className={`text-xl font-black tracking-tighter truncate ${accentColor} drop-shadow-[0_0_12px_currentColor] uppercase`}>
                {entity?.callsign || entity?.uid || 'NONE SELECTED'}
              </span>
            </div>
            
            <div className="shrink-0 flex items-center pt-1">
              {isStreaming ? (
                <button
                  onClick={reset}
                  className="group relative flex items-center justify-center h-10 px-5 bg-red-500/10 border border-red-500/40 rounded-sm text-red-500 hover:bg-red-500/20 transition-all shadow-[0_0_20px_rgba(239,68,68,0.1)]"
                >
                  <div className="absolute top-0 left-0 w-full h-[1px] bg-red-400 group-hover:animate-pulse" />
                  <span className="text-[10px] font-black tracking-[.4em] uppercase">Halt</span>
                </button>
              ) : (
                <button
                  onClick={handleRun}
                  disabled={!entity || !isOperator}
                  className={`group relative flex items-center justify-center h-10 px-5 bg-white/5 border ${accentBorder} rounded-sm ${accentColor} hover:bg-white/10 transition-all shadow-[0_0_20px_rgba(255,255,255,0.05)] disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className={`absolute top-0 left-0 w-full h-[1px] ${accentColor.replace('text-', 'bg-')} group-hover:animate-pulse opacity-50`} />
                  {!isOperator && <Lock size={10} className="mr-2 opacity-50" />}
                  <span className="text-[10px] font-black tracking-[.25em] uppercase whitespace-nowrap">
                    {isOperator ? `Run ${domainLabel} Intel` : 'Locked'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Configuration Options */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1 items-start">
                <span className="text-[7px] font-black text-white/20 tracking-[.2em] uppercase mb-0.5 ml-1">Scan_Window</span>
                <div className="flex items-center bg-black/60 border border-white/5 rounded-sm p-0.5">
                  {LOOKBACK_OPTIONS.map(opt => (
                      <button
                          key={opt.value}
                          onClick={() => setLookback(opt.value)}
                          disabled={isStreaming}
                          className={`px-2 py-0.5 text-[8px] font-black tracking-tighter rounded-sm transition-all ${lookback === opt.value 
                              ? `${accentColor} ${accentColor.replace('text-', 'bg-')}/20 shadow-[0_0_10px_currentColor]/10` 
                              : 'text-white/20 hover:text-white/40'}`}
                      >
                          {opt.label.toUpperCase()}
                      </button>
                  ))}
                </div>
            </div>
            
            <div className="flex flex-col gap-1 items-end">
                <span className="text-[7px] font-black text-white/20 tracking-[.2em] uppercase mb-0.5 mr-1">Maneuver_Mode</span>
                <div className={`flex items-center bg-white/[0.04] border border-white/5 rounded-sm p-0.5 ${isSitrep ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    {MODE_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => !isSitrep && setMode(opt.value)}
                            disabled={isStreaming || isSitrep}
                            className={`px-2 py-0.5 text-[8px] font-black tracking-tighter rounded-sm transition-all ${mode === opt.value 
                                ? `${accentColor} ${accentColor.replace('text-', 'bg-')}/20 shadow-[0_0_10px_currentColor]/10` 
                                : 'text-white/20 hover:text-white/40 disabled:hover:text-white/20'}`}
                        >
                            {opt.label.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>
          </div>

        </div>

        {/* Output Area */}
        <div className="flex flex-col bg-black/40 h-[400px] relative">
          {/* Output header */}
          <div className="flex items-center justify-between px-5 py-2 border-b border-white/5 bg-black/60 relative z-10">
            <div className="flex items-center gap-3">
              <div className="flex gap-0.5">
                  <div className={`w-1 h-3 rounded-t-[1px] ${isStreaming ? 'bg-hud-green animate-[bounce_1s_infinite_0ms]' : 'bg-white/10'}`} />
                  <div className={`w-1 h-3 rounded-t-[1px] ${isStreaming ? 'bg-hud-green animate-[bounce_1s_infinite_200ms]' : 'bg-white/10'}`} />
                  <div className={`w-1 h-3 rounded-t-[1px] ${isStreaming ? 'bg-hud-green animate-[bounce_1s_infinite_400ms]' : 'bg-white/10'}`} />
              </div>
              <span className={`text-[9px] font-black tracking-[.3em] uppercase ${isStreaming ? 'text-hud-green animate-pulse' : 'text-white/30'}`}>
                {isStreaming ? 'Processing Telemetry Stream' : generatedAt
                  ? `Assessment Generated ${generatedAt.toLocaleTimeString()} UTC`
                  : 'Ready for Tasking'}
              </span>
            </div>
            <div className="flex items-center gap-4">
              {text && !isStreaming && (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-2 group ml-1"
                >
                  <div className={`text-[8px] font-black tracking-widest uppercase transition-all ${copyState === 'copied'
                    ? 'text-hud-green'
                    : copyState === 'failed'
                      ? 'text-red-400'
                      : 'text-white/30 group-hover:text-white/60'}`}>
                     {copyState === 'copied' ? 'SYSTEM_COPIED' : copyState === 'failed' ? 'COPY_FAILED' : 'EXPORT_DATA'}
                  </div>
                  {copyState === 'copied'
                    ? <Check size={10} className="text-hud-green" />
                    : <Copy size={10} className={`${copyState === 'failed' ? 'text-red-400' : 'text-white/20 group-hover:text-white/40'} transition-colors`} />}
                </button>
              )}
            </div>
          </div>

          {/* Scrollable text body */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent selection:bg-hud-green/30 relative z-10"
          >
            {advisory && (
              <div className="mb-4 flex flex-col gap-3 p-4 bg-amber-500/5 border border-amber-500/30 rounded-sm">
                <div className="flex items-center gap-2 text-amber-400">
                    <AlertTriangle size={14} />
                    <span className="text-[10px] font-black tracking-[.3em] uppercase">Model Overloaded</span>
                </div>
                <div className="text-[11px] font-mono text-white/70 leading-relaxed border-l border-amber-500/20 pl-3">
                    {advisory}
                </div>
              </div>
            )}
            {error ? (
              <div className="flex flex-col gap-3 p-4 bg-red-500/5 border border-red-500/30 rounded-sm">
                <div className="flex items-center gap-2 text-red-500">
                    <AlertTriangle size={14} />
                    <span className="text-[10px] font-black tracking-[.3em] uppercase">Execution Failure</span>
                </div>
                <div className="text-[11px] font-mono text-white/70 leading-relaxed border-l border-red-500/20 pl-3">
                    {error}
                </div>
              </div>
            ) : !text && !isStreaming ? (
              <div className="h-full flex flex-col items-center justify-center relative opacity-20 group">
                {/* Tactical Radar Animation */}
                <div className="relative w-24 h-24 mb-6">
                    <div className="absolute inset-0 border border-white/20 rounded-full animate-[ping_4s_infinite]" />
                    <div className="absolute inset-0 border border-white/10 rounded-full animate-[ping_4s_infinite_1s]" />
                    <div className="absolute inset-4 border border-white/30 rounded-full" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Activity size={24} className="text-white animate-pulse" />
                    </div>
                </div>
                <span className="text-[10px] font-black tracking-[.6em] text-white uppercase ml-1">Awaiting_Tasking</span>
                <span className="text-[7px] font-medium text-white/40 tracking-[.4em] uppercase mt-2">Standby for operator command</span>
              </div>
            ) : (
              <div className="relative pb-8">
                <AnalysisFormatter text={text} isStreaming={isStreaming} accentColor={accentColor} />
                {isStreaming && (
                  <span className={`inline-block w-2.5 h-4 ml-1 bg-hud-green animate-pulse align-middle shadow-[0_0_8px_#00ff41]`} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { BrainCircuit } from 'lucide-react';

interface AnalysisWidgetProps {
  accentColor?: string; // e.g. 'text-air-accent' | 'text-sea-accent'
  compactMode?: boolean; // Kept for API compatibility, but always renders compact now
  onOpenPanel?: () => void;
}

export const AnalysisWidget: React.FC<AnalysisWidgetProps> = ({
  accentColor = 'text-air-accent',
  onOpenPanel,
}) => {

  let accentBorder = 'border-air-accent/30';
  let accentBg = 'bg-gradient-to-br from-air-accent/10 to-air-accent/5';

  if (accentColor.includes('sea')) {
    accentBorder = 'border-sea-accent/30';
    accentBg = 'bg-gradient-to-br from-sea-accent/10 to-sea-accent/5';
  } else if (accentColor.includes('purple')) {
    accentBorder = 'border-purple-400/30';
    accentBg = 'bg-gradient-to-br from-purple-400/10 to-purple-400/5';
  } else if (accentColor.includes('orange')) {
    accentBorder = 'border-orange-400/30';
    accentBg = 'bg-gradient-to-br from-orange-400/10 to-orange-400/5';
  } else if (accentColor.includes('indigo')) {
    accentBorder = 'border-indigo-400/30';
    accentBg = 'bg-gradient-to-br from-indigo-400/10 to-indigo-400/5';
  } else if (accentColor.includes('teal')) {
    accentBorder = 'border-teal-400/30';
    accentBg = 'bg-gradient-to-br from-teal-400/10 to-teal-400/5';
  } else if (accentColor.includes('cyan')) {
    accentBorder = 'border-cyan-400/30';
    accentBg = 'bg-gradient-to-br from-cyan-400/10 to-cyan-400/5';
  } else if (accentColor.includes('amber')) {
    accentBorder = 'border-amber-400/30';
    accentBg = 'bg-gradient-to-br from-amber-400/10 to-amber-400/5';
  } else if (accentColor.includes('red')) {
    accentBorder = 'border-red-400/30';
    accentBg = 'bg-gradient-to-br from-red-400/10 to-red-400/5';
  } else if (accentColor.includes('yellow')) {
    accentBorder = 'border-yellow-400/30';
    accentBg = 'bg-gradient-to-br from-yellow-400/10 to-yellow-400/5';
  }

  return (
    <button
      onClick={onOpenPanel}
      className={`flex-1 flex items-center justify-between px-3 py-2 border ${accentBorder} ${accentBg} hover:bg-white/10 rounded-sm group transition-all focus-visible:ring-1 focus-visible:ring-violet-400 outline-none`}
      title="Open AI Analyst Panel"
      aria-label="Open AI Analyst Panel"
    >
      <div className="flex items-center gap-2">
        <BrainCircuit size={13} className={accentColor} />
        <span className="text-[10px] font-bold tracking-[.3em] text-white/50 group-hover:text-white/80 transition-colors">AI_ANALYST</span>
      </div>
    </button>
  );
};

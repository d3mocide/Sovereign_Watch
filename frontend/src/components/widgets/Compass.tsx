import React from 'react';

interface CompassProps {
  heading: number;
  size?: number;
}

export const Compass: React.FC<CompassProps> = ({ heading, size = 160 }) => {
  // Normalize heading
  const rotation = heading % 360;

  return (
    <div className="relative flex items-center justify-center p-4">
      <div 
        className="relative flex items-center justify-center rounded-full border border-hud-green/30 bg-black/40 shadow-[inset_0_0_20px_rgba(0,255,100,0.1)]"
        style={{ width: size, height: size }}
      >
        {/* Outer Ring with degree markers */}
        <div className="absolute inset-2 rounded-full border border-hud-green/10" />
        
        {/* Key Direction Labels */}
        <div className="absolute inset-0 flex flex-col items-center justify-between p-2 text-[10px] font-bold text-hud-green/40">
           <span>N</span>
           <div className="flex w-full justify-between px-2">
              <span>W</span>
              <span>E</span>
           </div>
           <span>S</span>
        </div>

        {/* Degree Ticks (Every 30 degrees) */}
        {[...Array(12)].map((_, i) => (
            <div 
              key={i} 
              className="absolute h-full w-[1px] bg-hud-green/20"
              style={{ transform: `rotate(${i * 30}deg)` }}
            >
              <div className="h-2 w-full bg-hud-green/50" />
            </div>
        ))}

        {/* The Needle */}
        <div 
          className="relative z-10 transition-transform duration-1000 ease-out flex items-center justify-center"
          style={{ 
            transform: `rotate(${rotation}deg)`,
            width: size,
            height: size
          }}
        >
          <svg width="24" height={size} viewBox={`0 0 24 ${size}`} className="overflow-visible drop-shadow-[0_0_8px_rgba(0,255,65,0.6)]">
            {/* Pointer Tip */}
            <path 
              d={`M 12 10 L 17 ${size/2} L 7 ${size/2} Z`} 
              fill="#00ff41" 
            />
            {/* Center Pivot */}
            <circle cx="12" cy={size/2} r="5" fill="#00ff41" />
            <circle cx="12" cy={size/2} r="1.5" fill="#050505" />
            {/* Tail */}
            <line 
              x1="12" y1={size/2 + 5} 
              x2="12" y2={size/2 + 45} 
              stroke="#00ff41" 
              strokeWidth="1.5" 
              style={{ opacity: 0.3 }} 
            />
          </svg>
        </div>

        {/* Digital Readout */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-12">
            <div className="bg-black/80 px-2 py-0.5 rounded border border-hud-green/20">
                <span className="text-mono-sm font-bold text-hud-green tabular-nums">
                    {Math.round(rotation).toString().padStart(3, '0')}°
                </span>
            </div>
        </div>
      </div>

      {/* Glass Reflection Effect */}
      <div 
        className="pointer-events-none absolute h-[140px] w-[140px] rounded-full bg-gradient-to-br from-white/10 to-transparent opacity-20"
        style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-45deg)' }}
      />
    </div>
  );
};

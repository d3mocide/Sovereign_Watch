import React from 'react';

interface CompassProps {
  heading: number;
  size?: number;
  accentColor?: string; // Tailwind color class name (e.g., 'sea-accent', 'purple-400')
}

export const Compass: React.FC<CompassProps> = ({ 
  heading, 
  size = 160, 
  accentColor = 'hud-green' 
}) => {
  // Normalize heading
  const rotation = heading % 360;

  // Map tailwind color classes to hex for SVG support
  const colorMap: Record<string, string> = {
    'hud-green': '#00ff41',
    'sea-accent': '#00ffff',
    'purple-400': '#a855f7',
    'air-accent': '#00ff41',
    'alert-red': '#ff3333',
    'alert-amber': '#ffb000'
  };

  const hexColor = colorMap[accentColor] || colorMap['hud-green'];

  return (
    <div className="relative flex flex-col items-center justify-center p-4 gap-3">
      {/* Compass Circular Container - New structural wrap to fix absolute alignment */}
      <div className="relative flex items-center justify-center">
        <div 
          className={`relative flex items-center justify-center rounded-full border border-${accentColor}/40 bg-black/40`}
          style={{ 
            width: size, 
            height: size,
            boxShadow: `inset 0 0 20px ${hexColor}33` 
          }}
        >
          {/* Internal Crosshair Lines (Every 30 degrees) */}
          <div className="absolute inset-0 flex items-center justify-center">
              {[...Array(6)].map((_, i) => (
                  <div 
                     key={i} 
                     className={`absolute w-[0.5px] h-full bg-${accentColor}/10`}
                     style={{ transform: `rotate(${i * 30}deg)` }}
                  />
              ))}
          </div>

          {/* Outer Ring with degree markers */}
          <div className={`absolute inset-[3px] rounded-full border border-${accentColor}/15`} />
          
          {/* Key Direction Labels */}
          <div 
            className="absolute inset-0 flex flex-col items-center justify-between p-3.5 text-[10px] font-black tracking-tighter"
            style={{ color: hexColor }}
          >
             <span className="opacity-80">N</span>
             <div className="flex w-full justify-between px-3.5">
                <span className="opacity-80">W</span>
                <span className="opacity-80">E</span>
             </div>
             <span className="opacity-80">S</span>
          </div>

          {/* Peripheral Degree Ticks (Every 30 degrees) */}
          {[...Array(12)].map((_, i) => (
              <div 
                key={i} 
                className={`absolute h-full w-[1px]`}
                style={{ transform: `rotate(${i * 30}deg)` }}
              >
                <div className={`h-2.5 w-full bg-${accentColor}/60 shadow-[0_0_5px_${hexColor}a0]`} />
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
            <svg width="24" height={size} viewBox={`0 0 24 ${size}`} className="overflow-visible" style={{ filter: `drop-shadow(0 0 10px ${hexColor}b3)` }}>
              {/* Pointer Tip */}
              <path 
                d={`M 12 12 L 18 ${size/2} L 6 ${size/2} Z`} 
                fill={hexColor} 
              />
              {/* Center Pivot */}
              <circle cx="12" cy={size/2} r="4.5" fill={hexColor} />
              <circle cx="12" cy={size/2} r="1.5" fill="#050505" />
              {/* Tail Line */}
              <line 
                x1="12" y1={size/2} 
                x2="12" y2={size/2 + (size * 0.35)} 
                stroke={hexColor} 
                strokeWidth="1" 
                style={{ opacity: 0.4 }} 
              />
            </svg>
          </div>
        </div>

        {/* Surface Glare - Now correctly centered inside the wrap */}
        <div 
          className="pointer-events-none absolute rounded-full bg-gradient-to-tr from-transparent via-white/5 to-white/10 opacity-30"
          style={{ 
            width: size * 0.88, 
            height: size * 0.88, 
            transform: 'rotate(-30deg)' 
          }}
        />
      </div>
      
      {/* Tactical Digital Readout Box - Moved below the ring */}
      <div className="z-20">
          <div className={`bg-black/95 px-2.5 py-1 rounded-sm border border-${accentColor}/30 shadow-[0_0_15px_rgba(0,0,0,0.6)]`}>
              <span className={`text-[12px] font-bold text-${accentColor} tracking-widest tabular-nums`}>
                  {Math.round(rotation).toString().padStart(3, '0')}°
              </span>
          </div>
      </div>
    </div>
  );
};

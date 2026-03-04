import React from 'react';

interface PassPredictorWidgetProps {
  passes: Array<{
    norad_id: number;
    name: string;
    aos: string;
    tca: string;
    los: string;
    max_elevation: number;
    aos_azimuth: number;
    los_azimuth: number;
    duration_seconds: number;
  }>;
  homeLocation: { lat: number; lon: number };
  onPassClick?: (norad: number) => void;
  isLoading?: boolean;
}

export const PassPredictorWidget: React.FC<PassPredictorWidgetProps> = ({ passes, homeLocation, onPassClick, isLoading }) => {
  return (
    <div className="flex flex-col mt-2 bg-black/30 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] rounded border border-white/10 overflow-hidden flex-1">
      <div className="flex justify-between items-center bg-white/5 border-b border-white/10 px-3 py-2">
        <span className="text-[10px] font-bold tracking-[0.2em] text-purple-400/70 uppercase">UPCOMING PASSES</span>
        <span className="text-[8px] text-white/40 font-mono tracking-widest">{homeLocation.lat.toFixed(2)}°, {homeLocation.lon.toFixed(2)}°</span>
      </div>

      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-[150px]">
          <div className="w-6 h-6 rounded-full border border-purple-400/20 border-t-purple-400 animate-spin mb-2"></div>
          <span className="text-[8px] text-purple-400/50 font-mono tracking-widest uppercase">PREDICTING TRAJECTORIES...</span>
        </div>
      ) : passes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <span className="text-[9px] text-white/20 font-mono tracking-widest uppercase">No upcoming passes</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-purple-400/20">
          {passes.map((pass, i) => {
            const aosTime = new Date(pass.aos).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

            return (
              <div
                key={`${pass.norad_id}-${i}`}
                onClick={() => onPassClick?.(pass.norad_id)}
                className="flex items-center justify-between p-1.5 rounded hover:bg-white/5 cursor-pointer transition-colors border-l-2 border-transparent hover:border-purple-400"
              >
                <div className="flex flex-col min-w-[35px]">
                  <span className="text-[10px] text-purple-300 font-mono">{aosTime}</span>
                  <span className="text-[7px] text-white/30 uppercase tracking-widest">AOS Z</span>
                </div>

                <div className="flex-1 px-2 flex flex-col truncate">
                  <span className="text-[10px] text-white font-mono truncate">{pass.name}</span>
                  <div className="flex gap-2">
                    <span className="text-[8px] text-white/40 font-mono tracking-wider">{pass.norad_id}</span>
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-white/80 font-mono">{pass.max_elevation.toFixed(0)}°</span>
                  <span className="text-[7px] text-white/30 uppercase tracking-widest">MAX</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

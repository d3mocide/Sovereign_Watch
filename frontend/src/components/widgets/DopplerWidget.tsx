import React, { useState, useMemo } from 'react';

interface DopplerWidgetProps {
  referenceFreqMhz?: number;   // default 437.0
  passPoints?: Array<{
    time: string;              // ISO datetime
    slant_range_km: number;    // to compute range rate
    elevation: number;
  }>;
}

export const DopplerWidget: React.FC<DopplerWidgetProps> = ({ referenceFreqMhz = 437.0, passPoints = [] }) => {
  const [f0, setF0] = useState(referenceFreqMhz);

  // Calculate Doppler shifts based on slant range rate
  const dopplerData = useMemo(() => {
    if (!passPoints || passPoints.length < 2) return [];

    const c = 299792.458; // speed of light in km/s
    const results = [];

    for (let i = 1; i < passPoints.length; i++) {
      const p1 = passPoints[i-1];
      const p2 = passPoints[i];

      const t1 = new Date(p1.time).getTime();
      const t2 = new Date(p2.time).getTime();
      const dt = (t2 - t1) / 1000; // delta time in seconds

      if (dt > 0) {
        // Range rate (dr/dt) in km/s
        const dr = p2.slant_range_km - p1.slant_range_km;
        const v_radial = dr / dt;

        // Doppler shift in Hz
        const f0_hz = f0 * 1000000;
        // Non-relativistic Doppler approximation: shift = - f0 * (v_radial / c)
        // Negative sign because if distance is decreasing (v_radial < 0), frequency should INCREASE
        const shift_hz = -1 * f0_hz * (v_radial / c);

        results.push({
          time: t2,
          shift: shift_hz
        });
      }
    }
    return results;
  }, [passPoints, f0]);

  // SVG Chart Setup
  const width = 250;
  const height = 200;
  const padding = { top: 20, right: 30, bottom: 20, left: 30 };

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  let pathString = '';
  let maxAbsShift = 3000; // Default +/- 3kHz
  const yZero = padding.top + innerHeight / 2;

  if (dopplerData.length > 0) {
    // Auto-scale Y axis
    const maxShift = Math.max(...dopplerData.map(d => Math.abs(d.shift)));
    maxAbsShift = Math.max(1000, maxShift * 1.2); // At least 1kHz range, padded 20%

    // Scale functions
    const tStart = dopplerData[0].time;
    const tEnd = dopplerData[dopplerData.length - 1].time;
    const tRange = tEnd - tStart || 1;

    const xScale = (t: number) => padding.left + ((t - tStart) / tRange) * innerWidth;
    const yScale = (s: number) => yZero - (s / maxAbsShift) * (innerHeight / 2);

    pathString = dopplerData.map((d, i) => {
      const x = xScale(d.time);
      const y = yScale(d.shift);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  }

  return (
    <div className="flex flex-col rounded border border-white/10 bg-black/30 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] overflow-hidden">
      <div className="flex items-center justify-between bg-white/5 border-b border-white/10 px-3 py-2">
        <span className="text-[10px] font-bold tracking-[0.2em] text-purple-400/70 uppercase">DOPPLER SHIFT</span>
        <div className="flex items-center gap-1">
          <span className="text-[8px] text-white/30 uppercase tracking-widest">f0:</span>
          <input
            type="number"
            value={f0}
            onChange={(e) => setF0(Number(e.target.value))}
            className="w-16 bg-white/5 border border-white/10 rounded text-[9px] text-white/80 font-mono px-1 outline-none focus:border-purple-400/50"
            step="0.001"
          />
          <span className="text-[8px] text-white/30 uppercase tracking-widest">MHz</span>
        </div>
      </div>

      <div className="relative w-full overflow-hidden" style={{ minWidth: '100%', height: `${height}px` }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          {/* Zero Line */}
          <line
            x1={padding.left}
            y1={yZero}
            x2={width - padding.right}
            y2={yZero}
            stroke="#ffffff"
            opacity="0.15"
            strokeWidth="1"
            strokeDasharray="2,2"
          />

          {/* Chart Area */}
          {dopplerData.length > 0 ? (
            <>
              <path
                d={pathString}
                fill="none"
                stroke="#a855f7"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* AOS / LOS Markers */}
              <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#22c55e" opacity="0.4" strokeWidth="1" />
              <line x1={width - padding.right} y1={padding.top} x2={width - padding.right} y2={height - padding.bottom} stroke="#ef4444" opacity="0.4" strokeWidth="1" />

              <text x={padding.left + 2} y={height - 5} fill="#22c55e" opacity="0.6" fontSize="7" fontFamily="monospace">AOS</text>
              <text x={width - padding.right - 2} y={height - 5} fill="#ef4444" opacity="0.6" fontSize="7" fontFamily="monospace" textAnchor="end">LOS</text>
            </>
          ) : (
             <text x={width/2} y={height/2} fill="#ffffff" opacity="0.2" fontSize="8" textAnchor="middle" fontFamily="monospace">NO DATA</text>
          )}

          {/* Y Axis Labels */}
          <text x={padding.left - 4} y={padding.top + 5} fill="#ffffff" opacity="0.3" fontSize="7" textAnchor="end" fontFamily="monospace">+{Math.round(maxAbsShift/1000)}k</text>
          <text x={padding.left - 4} y={yZero + 2} fill="#ffffff" opacity="0.3" fontSize="7" textAnchor="end" fontFamily="monospace">0</text>
          <text x={padding.left - 4} y={height - padding.bottom} fill="#ffffff" opacity="0.3" fontSize="7" textAnchor="end" fontFamily="monospace">-{Math.round(maxAbsShift/1000)}k</text>
        </svg>
      </div>
    </div>
  );
};

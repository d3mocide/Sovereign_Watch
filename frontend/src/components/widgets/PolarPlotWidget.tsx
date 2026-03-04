import React from 'react';

interface PolarPlotWidgetProps {
  pass?: {
    points: Array<{
      azimuth: number;       // 0-360 degrees
      elevation: number;     // 0-90 degrees
      time: string;          // ISO datetime
      isAos?: boolean;
      isTca?: boolean;
      isLos?: boolean;
    }>;
  };
  width?: number;   // default 200
  height?: number;  // default 200
}

export const PolarPlotWidget: React.FC<PolarPlotWidgetProps> = ({ pass, width = 200, height = 200 }) => {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 20; // 20px padding

  // coordinate transform function
  function toSvgPoint(az: number, el: number, r: number) {
    const rad = r * (1 - el / 90);   // full radius at el=0, 0 at el=90
    const angle = (az - 90) * Math.PI / 180;  // rotate so N is up
    return {
      x: cx + rad * Math.cos(angle),
      y: cy + rad * Math.sin(angle)
    };
  }

  // Draw circles for 0, 30, 60 elevation
  const rings = [0, 30, 60];

  // Draw the path if we have one
  let pathString = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let aosPoint: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tcaPoint: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let losPoint: any = null;

  if (pass && pass.points.length > 0) {
    pass.points.forEach((p, i) => {
      const { x, y } = toSvgPoint(p.azimuth, p.elevation, radius);
      if (i === 0) pathString += `M ${x} ${y} `;
      else pathString += `L ${x} ${y} `;

      if (p.isAos) aosPoint = { x, y };
      if (p.isTca) tcaPoint = { x, y };
      if (p.isLos) losPoint = { x, y };
    });
  }

  return (
    <div className="rounded border border-white/10 bg-black/30 p-2 flex flex-col items-center">
      <span className="text-[8px] text-white/30 tracking-[0.2em] uppercase self-start mb-2">PASS GEOMETRY</span>

      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Grids */}
        {rings.map((el) => {
          const r = radius * (1 - el / 90);
          return (
            <g key={el}>
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="#ffffff"
                opacity="0.08"
                strokeWidth="0.5"
              />
              <text
                x={cx}
                y={cy - r + 8}
                fill="#ffffff"
                opacity="0.2"
                fontSize="6"
                textAnchor="middle"
                fontFamily="monospace"
              >
                {el}°
              </text>
            </g>
          );
        })}

        {/* Radial lines N, E, S, W */}
        <line x1={cx} y1={cy - radius} x2={cx} y2={cy + radius} stroke="#ffffff" opacity="0.08" strokeWidth="0.5" />
        <line x1={cx - radius} y1={cy} x2={cx + radius} y2={cy} stroke="#ffffff" opacity="0.08" strokeWidth="0.5" />

        {/* Labels */}
        <text x={cx} y={cy - radius - 5} fill="#ffffff" opacity="0.3" fontSize="8" textAnchor="middle" fontFamily="monospace">N</text>
        <text x={cx} y={cy + radius + 10} fill="#ffffff" opacity="0.3" fontSize="8" textAnchor="middle" fontFamily="monospace">S</text>
        <text x={cx + radius + 5} y={cy + 3} fill="#ffffff" opacity="0.3" fontSize="8" textAnchor="start" fontFamily="monospace">E</text>
        <text x={cx - radius - 5} y={cy + 3} fill="#ffffff" opacity="0.3" fontSize="8" textAnchor="end" fontFamily="monospace">W</text>

        {/* Pass Arc */}
        {pathString && (
          <path
            d={pathString}
            fill="none"
            stroke="#a855f7"
            strokeWidth="1.5"
            opacity="0.8"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Markers */}
        {aosPoint && <circle cx={aosPoint.x} cy={aosPoint.y} r="3" fill="#22c55e" />}
        {tcaPoint && <circle cx={tcaPoint.x} cy={tcaPoint.y} r="4" fill="#a855f7" stroke="#ffffff" strokeWidth="1" opacity="0.9" />}
        {losPoint && <circle cx={losPoint.x} cy={losPoint.y} r="3" fill="#ef4444" />}
      </svg>
    </div>
  );
};

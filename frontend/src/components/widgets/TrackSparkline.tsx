import React from "react";

export type TrackSnapshot = { air: number; sea: number; orbital: number };

interface SparklineProps {
  data: TrackSnapshot[];
  width?: number;
  height?: number;
}

export const TrackSparkline: React.FC<SparklineProps> = ({
  data,
  width = 96,
  height = 22,
}) => {
  if (data.length < 2) {
    return (
      <svg width={width} height={height} className="opacity-20 flex-shrink-0">
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="#00ff41"
          strokeWidth={1}
        />
      </svg>
    );
  }
  const maxAirSea = Math.max(1, ...data.map((d) => Math.max(d.air, d.sea)));
  const pad = 2;
  const norm = (v: number, max: number) =>
    height - pad - (v / max) * (height - pad * 2);
  const buildPath = (vals: number[], max: number) => {
    const step = width / (vals.length - 1);
    return vals
      .map(
        (v, i) =>
          `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${norm(v, max).toFixed(1)}`,
      )
      .join(" ");
  };
  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <path
        d={buildPath(
          data.map((d) => d.air),
          maxAirSea,
        )}
        stroke="#00ff41"
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={buildPath(
          data.map((d) => d.sea),
          maxAirSea,
        )}
        stroke="#22d3ee"
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

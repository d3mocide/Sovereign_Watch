import React, { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, Navigation } from 'lucide-react';
import { CoTEntity, HistorySegment } from '../../types';

interface TrackPoint {
  time: string;
  lat: number;
  lon: number;
  alt: number;   // metres HAE
  speed: number; // m/s
  heading: number;
}

interface FlightInfo {
  departure: string | null;
  arrival: string | null;
  callsign: string | null;
  first_seen: number | null;
  last_seen: number | null;
}

interface TrackHistoryPanelProps {
  entity: CoTEntity;
  onHistoryLoaded: (segments: HistorySegment[]) => void;
}

const GAP_MS = 30 * 60 * 1000; // 30-minute gap = coverage hole

/** Split a DESC-sorted point array into continuous runs separated by gaps. */
function splitSegments(points: TrackPoint[]): TrackPoint[][] {
  if (points.length === 0) return [];
  const segs: TrackPoint[][] = [];
  let cur: TrackPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const dt = Date.parse(points[i - 1].time) - Date.parse(points[i].time);
    if (dt > GAP_MS) {
      if (cur.length > 1) segs.push(cur);
      cur = [];
    }
    cur.push(points[i]);
  }
  if (cur.length > 1) segs.push(cur);
  return segs;
}

export function TrackHistoryPanel({ entity, onHistoryLoaded }: TrackHistoryPanelProps) {
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [flightInfo, setFlightInfo] = useState<FlightInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPoints([]);
    setFlightInfo(null);

    async function load() {
      try {
        const [histRes, flightRes] = await Promise.allSettled([
          fetch(`/api/tracks/history/${encodeURIComponent(entity.uid)}?limit=500&hours=72`),
          fetch(`/api/tracks/flight-info/${encodeURIComponent(entity.uid)}`),
        ]);

        if (cancelled) return;

        if (histRes.status === 'fulfilled' && histRes.value.ok) {
          const raw: TrackPoint[] = await histRes.value.json();
          if (!cancelled) {
            setPoints(raw);

            // Build deck.gl segments for the map layer
            const contiguous = splitSegments(raw);
            const deckSegs: HistorySegment[] = contiguous.map(seg => ({
              // DESC → reverse to oldest-first for correct path direction
              path: seg.slice().reverse().map(p => [p.lon, p.lat, p.alt] as [number, number, number]),
              isGap: false,
            }));

            // Ghost lines across coverage gaps (dashed on map)
            for (let i = 0; i < contiguous.length - 1; i++) {
              const gapStart = contiguous[i][contiguous[i].length - 1]; // oldest in this seg
              const gapEnd = contiguous[i + 1][0];                       // newest in next seg
              deckSegs.push({
                path: [
                  [gapStart.lon, gapStart.lat, gapStart.alt],
                  [gapEnd.lon, gapEnd.lat, gapEnd.alt],
                ],
                isGap: true,
              });
            }

            onHistoryLoaded(deckSegs);
          }
        } else {
          if (!cancelled) setError('NO_TRACK_DATA');
        }

        if (flightRes.status === 'fulfilled' && flightRes.value.ok) {
          const fi: FlightInfo = await flightRes.value.json();
          if (!cancelled) setFlightInfo(fi);
        }
      } catch {
        if (!cancelled) setError('FETCH_FAILED');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [entity.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasGaps = useMemo(() => {
    for (let i = 1; i < points.length; i++) {
      if (Date.parse(points[i - 1].time) - Date.parse(points[i].time) > GAP_MS) return true;
    }
    return false;
  }, [points]);

  const stats = useMemo(() => {
    if (points.length === 0) return null;
    const maxAlt = Math.max(...points.map((p: TrackPoint) => p.alt));
    const maxSpd = Math.max(...points.map((p: TrackPoint) => p.speed));
    const oldest = points[points.length - 1];
    const newest = points[0];
    const durMs = Date.parse(newest.time) - Date.parse(oldest.time);
    const durHrs = Math.round(durMs / 36000) / 100;
    return {
      count: points.length,
      maxAltFt: Math.round(maxAlt * 3.28084),
      maxSpdKt: Math.round(maxSpd * 1.94384),
      durHrs,
    };
  }, [points]);

  // SVG altitude profile
  const chart = useMemo(() => {
    if (points.length < 2) return null;
    const asc = [...points].reverse(); // oldest → newest for chart left → right
    const t0 = Date.parse(asc[0].time);
    const t1 = Date.parse(asc[asc.length - 1].time);
    const maxA = Math.max(...asc.map(p => p.alt));
    const minA = Math.min(...asc.map(p => p.alt));
    const aRange = maxA - minA || 1;
    const W = 260, H = 56, PAD = 4;

    const tx = (t: number) => PAD + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * PAD);
    const ty = (a: number) => H - PAD - ((a - minA) / aRange) * (H - 2 * PAD);

    const segs: string[][] = [];
    let cur: string[] = [];
    for (let i = 0; i < asc.length; i++) {
      if (i > 0 && Date.parse(asc[i].time) - Date.parse(asc[i - 1].time) > GAP_MS) {
        if (cur.length > 1) segs.push(cur);
        cur = [];
      }
      cur.push(`${tx(Date.parse(asc[i].time)).toFixed(1)},${ty(asc[i].alt).toFixed(1)}`);
    }
    if (cur.length > 1) segs.push(cur);

    const gaps: { x1: number; x2: number }[] = [];
    for (let i = 1; i < asc.length; i++) {
      const dt = Date.parse(asc[i].time) - Date.parse(asc[i - 1].time);
      if (dt > GAP_MS) gaps.push({ x1: tx(Date.parse(asc[i - 1].time)), x2: tx(Date.parse(asc[i].time)) });
    }

    return { segs, gaps, W, H, PAD, maxAltFt: Math.round(maxA * 3.28084), minAltFt: Math.round(minA * 3.28084) };
  }, [points]);

  if (loading) {
    return (
      <div className="p-3 text-[10px] text-white/40 font-mono flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-hud-green/50 animate-pulse" />
        FETCHING_TRACK_DATA…
      </div>
    );
  }

  if (error || points.length === 0) {
    return (
      <div className="p-3 text-[10px] text-white/30 font-mono">
        {error === 'FETCH_FAILED' ? 'ERR: HISTORY_UNAVAILABLE' : 'NO_TRACK_DATA (72H WINDOW)'}
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-1">

      {/* Route header */}
      <div className="px-3 pt-2">
        <h3 className="text-[10px] text-white/50 font-bold pb-1.5">Track_Log</h3>
        {flightInfo && (flightInfo.departure || flightInfo.arrival) ? (
          <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold">
            <span className="text-hud-green">{flightInfo.departure ?? '????'}</span>
            <span className="text-white/20 flex-1 text-center text-[8px] tracking-widest overflow-hidden">
              {'─'.repeat(8)}
            </span>
            <Navigation size={9} className="text-white/30 shrink-0" />
            <span className="text-white/20 flex-1 text-center text-[8px] tracking-widest overflow-hidden">
              {'─'.repeat(8)}
            </span>
            <span className="text-amber-400">{flightInfo.arrival ?? '????'}</span>
          </div>
        ) : (
          <div className="text-[10px] text-white/20 font-mono">ROUTE: NOT_AVAILABLE</div>
        )}
      </div>

      {/* Coverage gap warning */}
      {hasGaps && (
        <div className="mx-3 px-2 py-1.5 rounded bg-amber-400/10 border border-amber-400/25 flex items-start gap-2">
          <AlertTriangle size={10} className="text-amber-400 shrink-0 mt-0.5" />
          <span className="text-[9px] text-amber-300/70 font-mono leading-relaxed">
            COVERAGE_GAP detected — aircraft left polling area.
            Track may be incomplete.
          </span>
        </div>
      )}

      {/* Altitude profile */}
      {chart && (
        <div className="mx-3 rounded border border-white/10 bg-black/40 overflow-hidden">
          <div className="px-2 pt-1.5 pb-0 flex justify-between text-[8px] text-white/30 font-mono">
            <span>ALT_PROFILE (72H)</span>
            <span className="tabular-nums">{chart.maxAltFt.toLocaleString()} ft</span>
          </div>
          <svg
            viewBox={`0 0 ${chart.W} ${chart.H}`}
            width="100%"
            height={chart.H}
            style={{ display: 'block' }}
          >
            {/* Gap shading */}
            {chart.gaps.map((g: { x1: number; x2: number }, i: number) => (
              <rect
                key={i}
                x={g.x1}
                y={chart.PAD}
                width={Math.max(1, g.x2 - g.x1)}
                height={chart.H - 2 * chart.PAD}
                fill="rgba(251,191,36,0.07)"
                stroke="rgba(251,191,36,0.25)"
                strokeWidth={0.5}
                strokeDasharray="2 2"
              />
            ))}

            {/* Altitude polylines */}
            {chart.segs.map((seg: string[], i: number) => (
              <polyline
                key={i}
                points={seg.join(' ')}
                fill="none"
                stroke="rgba(0,255,65,0.65)"
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}

            {/* Ground baseline */}
            <line
              x1={chart.PAD} y1={chart.H - chart.PAD}
              x2={chart.W - chart.PAD} y2={chart.H - chart.PAD}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={0.5}
            />
          </svg>
          <div className="px-2 pb-1 text-[8px] text-white/20 font-mono tabular-nums">
            {chart.minAltFt.toLocaleString()} ft
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="px-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] font-mono">
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-white/30">POINTS:</span>
              <span className="text-white/60 tabular-nums">{stats.count}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-white/30">TRACKED:</span>
              <span className="text-white/60 tabular-nums">{stats.durHrs}h</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-white/30">MAX_ALT:</span>
              <span className="text-hud-green/70 tabular-nums">{stats.maxAltFt.toLocaleString()} ft</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-white/30">MAX_SPD:</span>
              <span className="text-hud-green/70 tabular-nums">{stats.maxSpdKt} kts</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

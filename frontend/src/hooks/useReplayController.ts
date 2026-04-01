import { useCallback, useEffect, useRef, useState } from "react";
import type { CoTEntity } from "../types";
import { processReplayData } from "../utils/replayUtils";

export function useReplayController() {
  const [replayMode, setReplayMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [replayTime, setReplayTime] = useState<number>(Date.now());
  const [replayRange, setReplayRange] = useState({
    start: Date.now() - 3600000,
    end: Date.now(),
  });
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [historyDuration, setHistoryDuration] = useState(1);
  const [replayEntities, setReplayEntities] = useState<Map<string, CoTEntity>>(
    new Map(),
  );
  const [loadedPointCount, setLoadedPointCount] = useState(0);
  const [loadedTrackCount, setLoadedTrackCount] = useState(0);

  const replayCacheRef = useRef<Map<string, CoTEntity[]>>(new Map());
  const lastReplayFrameRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);
  const replayTimeRef = useRef<number>(Date.now());

  const updateReplayFrame = useCallback((time: number) => {
    const frameMap = new Map<string, CoTEntity>();

    for (const [uid, history] of replayCacheRef.current) {
      let found: CoTEntity | null = null;
      let low = 0,
        high = history.length - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if ((history[mid].time || 0) <= time) {
          found = history[mid];
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      if (found) {
        // 10-min stale window — matches max 5-min bucket size used by adaptive replay query
        if (time - (found.time || 0) < 600000) {
          frameMap.set(uid, found);
        }
      }
    }
    setReplayEntities(frameMap);
  }, []);

  const loadReplayData = useCallback(
    async (hoursOverride?: number) => {
      try {
        const hours = hoursOverride || historyDuration;
        const end = new Date();
        const start = new Date(end.getTime() - 1000 * 60 * 60 * hours);

        console.log(
          `Loading replay data (${hours}h): ${start.toISOString()} - ${end.toISOString()}`,
        );

        const res = await fetch(
          `/api/tracks/replay?start=${start.toISOString()}&end=${end.toISOString()}&limit=10000`,
        );
        if (!res.ok) throw new Error("Failed to fetch history");

        const data = await res.json();
        console.log(`Loaded ${data.length} historical points`);

        const processed = processReplayData(data);
        replayCacheRef.current = processed;
        setLoadedPointCount(data.length);
        setLoadedTrackCount(processed.size);
        setReplayRange({ start: start.getTime(), end: end.getTime() });

        // Sync ref to new start time so the rAF loop starts from the correct position.
        replayTimeRef.current = start.getTime();
        // Reset delta timer to avoid a massive first-frame dt that skips past replayRange.end.
        lastReplayFrameRef.current = 0;

        setReplayTime(start.getTime());
        updateReplayFrame(start.getTime());

        setReplayMode(true);
        setIsPlaying(true);
      } catch (err) {
        console.error("Replay load failed:", err);
      }
    },
    [historyDuration, updateReplayFrame],
  );

  // rAF animation loop
  useEffect(() => {
    if (!isPlaying) {
      replayTimeRef.current = replayTime;
      lastReplayFrameRef.current = 0;
      if (animationFrameRef.current)
        cancelAnimationFrame(animationFrameRef.current);
      return;
    }

    const loop = (timestamp: number) => {
      if (!lastReplayFrameRef.current) lastReplayFrameRef.current = timestamp;
      const dt = timestamp - lastReplayFrameRef.current;
      lastReplayFrameRef.current = timestamp;

      const next = replayTimeRef.current + dt * playbackSpeed;

      if (next > replayRange.end) {
        setIsPlaying(false);
        setReplayTime(replayRange.end);
        replayTimeRef.current = replayRange.end;
        updateReplayFrame(replayRange.end);
        return;
      }

      replayTimeRef.current = next;
      setReplayTime(next);
      updateReplayFrame(next);

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current)
        cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, playbackSpeed, replayRange.end, updateReplayFrame]);

  return {
    replayMode,
    setReplayMode,
    isPlaying,
    setIsPlaying,
    replayTime,
    setReplayTime,
    replayRange,
    playbackSpeed,
    setPlaybackSpeed,
    historyDuration,
    setHistoryDuration,
    replayEntities,
    replayTimeRef,
    loadReplayData,
    updateReplayFrame,
    loadedPointCount,
    loadedTrackCount,
  };
}

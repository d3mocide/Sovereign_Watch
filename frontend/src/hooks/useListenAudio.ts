/**
 * useListenAudio — KiwiSDR live audio streaming hook for the Listening Post mode.
 *
 * Connects to the backend /ws/audio WebSocket which streams raw S16LE PCM at
 * 12 kHz mono (same chunks from KiwiClient.on_audio).  Each binary message is
 * decoded into a Float32 AudioBuffer and scheduled on an AudioContext for
 * gapless playback.  An AnalyserNode is exposed for the waterfall canvas.
 *
 * Usage:
 *   const { analyserNode, isConnected, isPlaying, audioEnabled, enableAudio,
 *           volume, setVolume } = useListenAudio(radioMode === 'LISTEN');
 *
 * The hook only opens the WebSocket when `active` is true — no bandwidth is
 * consumed in JS8 mode.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// Derive the audio WebSocket URL from the same origin as the JS8 WS.
const JS8_WS_URL = import.meta.env.VITE_JS8_WS_URL || 'ws://localhost:8080/ws/js8';
const AUDIO_WS_URL = JS8_WS_URL.replace(/\/ws\/js8$/, '/ws/audio');

const SAMPLE_RATE   = 12000;  // KiwiSDR always outputs 12 kHz
const FFT_SIZE      = 2048;
// Buffer 250 ms before starting playback to absorb network jitter.
const PREBUFFER_S   = 0.25;

export interface UseListenAudioResult {
  analyserNode: AnalyserNode | null;
  isConnected: boolean;
  isPlaying: boolean;
  /** True once the user has clicked to unblock the AudioContext. */
  audioEnabled: boolean;
  /** Call on first user gesture to resume the AudioContext. */
  enableAudio: () => void;
  volume: number;
  setVolume: (v: number) => void;
}

export function useListenAudio(active: boolean): UseListenAudioResult {
  const wsRef          = useRef<WebSocket | null>(null);
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const gainRef        = useRef<GainNode | null>(null);
  const nextPlayRef    = useRef<number>(0);

  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [isConnected, setIsConnected]   = useState(false);
  const [isPlaying,   setIsPlaying]     = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [volume, setVolumeState]        = useState(0.8);

  // Initialise (or resume) the AudioContext on first user interaction.
  const enableAudio = useCallback(() => {
    if (audioCtxRef.current) {
      audioCtxRef.current.resume().then(() => setAudioEnabled(true));
      return;
    }
    try {
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.5;

      const gain = ctx.createGain();
      gain.gain.value = volume;

      analyser.connect(gain);
      gain.connect(ctx.destination);

      audioCtxRef.current = ctx;
      analyserRef.current  = analyser;
      gainRef.current      = gain;
      nextPlayRef.current  = 0;
      setAnalyserNode(analyser);

      ctx.resume().then(() => setAudioEnabled(true));
    } catch (err) {
      console.error('[useListenAudio] AudioContext creation failed:', err);
    }
  }, [volume]);

  // Update gain when volume changes.
  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (gainRef.current) {
      gainRef.current.gain.value = Math.max(0, Math.min(2, v));
    }
  }, []);

  // Process incoming binary PCM frame and schedule it for playback.
  const handleAudioChunk = useCallback((data: ArrayBuffer) => {
    const ctx = audioCtxRef.current;
    const analyser = analyserRef.current;
    if (!ctx || !analyser || ctx.state === 'suspended') return;

    // Ensure we only read an even number of bytes to prevent Int16Array RangeError
    const validBytes = Math.floor(data.byteLength / 2) * 2;
    if (validBytes === 0) return;
    const int16 = new Int16Array(data, 0, validBytes / 2);

    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    const buffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);

    // Gapless scheduling: start at nextPlayTime or now+prebuffer, whichever is later.
    const now = ctx.currentTime;
    if (nextPlayRef.current === 0 || nextPlayRef.current < now) {
      // First chunk or we fell behind — re-anchor with a small lead buffer.
      nextPlayRef.current = now + PREBUFFER_S;
      setIsPlaying(true);
    }
    source.start(nextPlayRef.current);
    nextPlayRef.current += buffer.duration;
  }, []);

  useEffect(() => {
    if (!active) {
      // Close WebSocket when switching out of LISTEN mode.
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      queueMicrotask(() => {
        setIsConnected(false);
        setIsPlaying(false);
      });
      nextPlayRef.current = 0;
      return;
    }

    let reconnectTimeout: number | undefined;

    const connect = () => {
      const ws = new WebSocket(AUDIO_WS_URL);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        nextPlayRef.current = 0;
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsPlaying(false);
        if (active) {
          reconnectTimeout = window.setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => { /* onclose handles cleanup */ };

      ws.onmessage = (evt) => {
        if (evt.data instanceof ArrayBuffer) {
          handleAudioChunk(evt.data);
        }
      };
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      queueMicrotask(() => {
        setIsConnected(false);
        setIsPlaying(false);
      });
    };
  }, [active, handleAudioChunk]);

  // Suspend AudioContext when inactive to release hardware resources.
  useEffect(() => {
    if (!active && audioCtxRef.current && audioCtxRef.current.state === 'running') {
      audioCtxRef.current.suspend();
    } else if (active && audioCtxRef.current && audioCtxRef.current.state === 'suspended' && audioEnabled) {
      audioCtxRef.current.resume();
    }
  }, [active, audioEnabled]);

  return {
    analyserNode,
    isConnected,
    isPlaying,
    audioEnabled,
    enableAudio,
    volume,
    setVolume,
  };
}

// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useJS8Stations } from './useJS8Stations';
import { useListenAudio } from './useListenAudio';

vi.mock('../api/auth', () => ({ getToken: () => null }));

class Socket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: Socket[] = [];
  readyState = 1;
  binaryType = '';
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
  send = vi.fn();
  constructor() { Socket.instances.push(this); }
  close() { this.readyState = 3; this.onclose?.(); }
}

beforeEach(() => {
  Socket.instances = [];
  vi.stubGlobal('WebSocket', Socket);
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('updates decoder readiness after connection and retains ordinary decode events', () => {
  const { result, unmount } = renderHook(() => useJS8Stations());
  const socket = Socket.instances[0];
  act(() => socket.onmessage?.({ data: JSON.stringify({ type: 'RADIO.STATUS', js8call_connected: true, decoder_audio_ready: true }) }));
  expect(result.current.js8Connected).toBe(true);
  act(() => socket.onmessage?.({ data: JSON.stringify({ type: 'RX.ACTIVITY', text: 'KNOWN JS8', snr: -12 }) }));
  expect(result.current.logEntries[0]).toMatchObject({ type: 'RX.ACTIVITY', text: 'KNOWN JS8', snr: -12 });
  act(() => socket.onmessage?.({ data: JSON.stringify({ type: 'RADIO.STATUS', js8call_connected: false }) }));
  expect(result.current.js8Connected).toBe(false);
  unmount();
});

it('does not reconnect the listening stream after unmount', async () => {
  const { unmount } = renderHook(() => useListenAudio(true));
  expect(Socket.instances).toHaveLength(1);
  unmount();
  await act(async () => { vi.advanceTimersByTime(6000); });
  expect(Socket.instances).toHaveLength(1);
});

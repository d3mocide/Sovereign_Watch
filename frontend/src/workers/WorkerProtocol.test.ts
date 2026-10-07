// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { startWorkerProtocol } from "./WorkerProtocol";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("waits for the decoder schema before opening the snapshot stream", () => {
  const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null as ((event: MessageEvent) => void) | null };
  vi.stubGlobal("Worker", vi.fn(function () { return worker; }));
  const socket = { close: vi.fn(), readyState: 0 };
  const WebSocketMock = vi.fn(function () { return socket; });
  vi.stubGlobal("WebSocket", WebSocketMock);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  const cleanup = startWorkerProtocol({
    workerRef: { current: null }, watchedIcaosRef: { current: new Set<string>() },
    onEntityUpdate: vi.fn(),
  });
  expect(WebSocketMock).not.toHaveBeenCalled();
  window.dispatchEvent(new Event("online"));
  expect(WebSocketMock).not.toHaveBeenCalled();
  worker.onmessage?.({ data: { type: "status", status: "ready" } } as MessageEvent);
  expect(WebSocketMock).toHaveBeenCalledTimes(1);
  cleanup();
  expect(worker.terminate).toHaveBeenCalledTimes(1);
});

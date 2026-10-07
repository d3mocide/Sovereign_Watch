// @vitest-environment jsdom
import { createElement, StrictMode, useLayoutEffect } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useMapContainerResize } from './useMapContainerResize';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('resizes maps after container changes and disconnects on replacement/unmount', () => {
  const callbacks: ResizeObserverCallback[] = [];
  const observers: { observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn(); disconnect = vi.fn();
    constructor(callback: ResizeObserverCallback) { callbacks.push(callback); observers.push(this); }
  });
  let frame!: FrameRequestCallback;
  vi.stubGlobal('requestAnimationFrame', vi.fn(callback => { frame = callback; return 1; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const container = document.createElement('div');
  const map = { getContainer: () => container, resize: vi.fn() };
  const { result, unmount } = renderHook(useMapContainerResize);
  act(() => result.current(map));
  act(() => { callbacks[0]([], {} as ResizeObserver); frame(0); });
  expect(map.resize).toHaveBeenCalledOnce();
  act(() => callbacks[0]([], {} as ResizeObserver));
  expect(requestAnimationFrame).toHaveBeenCalledOnce();
  Object.defineProperty(container, "clientWidth", { value: 760 });
  act(() => { callbacks[0]([], {} as ResizeObserver); frame(0); });
  expect(map.resize).toHaveBeenCalledTimes(2);
  const second = { ...map, resize: vi.fn() };
  act(() => result.current(second));
  expect(observers[0].disconnect).toHaveBeenCalledOnce();
  unmount();
  expect(observers[1].disconnect).toHaveBeenCalledOnce();
});
it('keeps an observer active when StrictMode replays an early load callback', () => {
  const observers: { active: boolean }[] = [];
  vi.stubGlobal('ResizeObserver', class {
    active = false;
    observe = () => { this.active = true; };
    disconnect = () => { this.active = false; };
    constructor() { observers.push(this); }
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const map = { getContainer: () => document.createElement('div'), resize: vi.fn() };
  const { unmount } = renderHook(() => {
    const observe = useMapContainerResize();
    useLayoutEffect(() => observe(map), [observe]);
  }, { wrapper: ({ children }) => createElement(StrictMode, null, children) });
  expect(observers.filter(observer => observer.active)).toHaveLength(1);
  unmount();
  expect(observers.filter(observer => observer.active)).toHaveLength(0);
});

import { useCallback, useEffect, useRef } from 'react';

interface ResizableMap {
  getContainer(): HTMLElement;
  resize(): unknown;
}

/** Keep layout-driven changes in sync for both engines and dashboard cards. */
export function useMapContainerResize() {
  const mapRef = useRef<ResizableMap | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const observe = useCallback((map: ResizableMap) => {
    mapRef.current = map;
    cleanupRef.current?.();
    let frame = 0;
    const container = map.getContainer();
    let width = -1;
    let height = -1;
    const observer = new ResizeObserver(() => {
      if (container.clientWidth === width && container.clientHeight === height) return;
      width = container.clientWidth;
      height = container.clientHeight;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.resize());
    });
    observer.observe(container);
    cleanupRef.current = () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    // StrictMode can replay effects after an early load callback. Reconnect the
    // remembered map instead of waiting for another load event that never fires.
    if (mapRef.current) observe(mapRef.current);
    return () => cleanupRef.current?.();
  }, [observe]);
  return observe;
}

import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}
function snapshot() {
  // Keep the deck canvas within a predictable fill-rate budget on touch devices.
  const budget = window.innerWidth < 1280 || window.matchMedia('(pointer: coarse)').matches ? 1 : 2;
  return Math.min(window.devicePixelRatio || 1, budget);
}
export function useRenderPixelRatio() {
  return useSyncExternalStore(subscribe, snapshot, () => 1);
}

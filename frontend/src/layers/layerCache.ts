import type { Layer } from "@deck.gl/core";

/**
 * Frame-to-frame memoization for deck.gl layer groups.
 *
 * The animation loop re-composes the full layer stack on every rAF tick, but
 * most groups (infrastructure, airspace, weather, GDELT, …) depend on data
 * that changes on second-to-minute cadences. Returning the *same* Layer
 * instances while inputs are unchanged lets deck.gl skip layer matching and
 * prop diffing for those groups entirely — and avoids regenerating and
 * re-uploading their GPU attribute buffers every frame.
 *
 * Each deck overlay must own its own LayerCache instance (Layer instances
 * hold per-deck internal state and must not be shared across overlays).
 */
export class LayerCache {
  private cache = new Map<
    string,
    { deps: readonly unknown[]; layers: Layer[] }
  >();

  /**
   * Return the cached layers for `key` if every entry in `deps` is identical
   * (Object.is) to the previous call; otherwise run `build` and cache it.
   */
  get(key: string, deps: readonly unknown[], build: () => Layer[]): Layer[] {
    const hit = this.cache.get(key);
    if (
      hit &&
      hit.deps.length === deps.length &&
      hit.deps.every((d, i) => Object.is(d, deps[i]))
    ) {
      return hit.layers;
    }
    const layers = build();
    this.cache.set(key, { deps, layers });
    return layers;
  }
}

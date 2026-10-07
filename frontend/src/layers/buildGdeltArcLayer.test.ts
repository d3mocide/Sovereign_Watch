import { describe, expect, it, vi } from 'vitest';
vi.mock('@deck.gl/layers', () => {
  class Layer { constructor(public props: Record<string, unknown>) {} }
  return { ArcLayer: Layer, PathLayer: Layer, ScatterplotLayer: Layer };
});

describe('globe arc geometry lifecycle', () => {
  it('rebuilds after centroid arrival, then reuses geometry while pulsing', async () => {
    let finish!: (value: unknown) => void;
    vi.stubGlobal('fetch', () => new Promise(resolve => { finish = resolve; }));
    const { buildGdeltArcLayer } = await import('./buildGdeltArcLayer');
    const data = { type: 'FeatureCollection', features: [{ geometry: { coordinates: [20, 30] }, properties: { event_id: 'event', quad_class: 4, actor1_country: 'USA', actor2_country: 'CHN', goldstein: -7 } }] };
    const cold = buildGdeltArcLayer(data, true, true, 0);
    finish({ json: async () => ({ USA: [38, -97], CHN: [35, 105] }) });
    await vi.waitFor(() => {
      expect(buildGdeltArcLayer(data, true, true, 0)[0].props.data).not.toBe(cold[0].props.data);
    });
    const first = buildGdeltArcLayer(data, true, true, 0);
    const pulse = buildGdeltArcLayer(data, true, true, 0.7);
    first.forEach((layer, i) => expect(pulse[i].props.data).toBe(layer.props.data));
    expect(pulse[0].props.opacity).not.toBe(first[0].props.opacity);
    expect(buildGdeltArcLayer({ ...data }, true, true, 0)[0].props.data).not.toBe(first[0].props.data);
    vi.unstubAllGlobals();
  });
});

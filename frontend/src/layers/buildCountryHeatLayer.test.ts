import { expect, it, vi } from 'vitest';
import { buildCountryHeatLayer, type ActorEntry } from './buildCountryHeatLayer';
vi.mock('@deck.gl/layers', () => ({ GeoJsonLayer: class { constructor(public props: Record<string, unknown>) {} } }));
it('only uploads countries with a visible threat fill', () => {
  const china = { properties: { name: 'China', ISO3166_1_Alpha_2: 'CN' } };
  const canada = { properties: { name: 'Canada' } };
  const data = { type: 'FeatureCollection', features: [china, canada] };
  const actors = [{ actor: 'China', threat_level: 'CRITICAL' }] as ActorEntry[];
  const layers = buildCountryHeatLayer(data, actors, true, true, 0);
  const props = layers[0].props as unknown as { data: { features: unknown[] }; getFillColor: (feature: unknown) => number[] };
  expect(props.data.features).toEqual([china]);
  expect(props.getFillColor(china)).toEqual([239, 68, 68, 95]);
  expect(data.features).toHaveLength(2);
  expect(buildCountryHeatLayer(data, [{ ...actors[0], threat_level: 'STABLE' }], true, true, 0)).toEqual([]);
});

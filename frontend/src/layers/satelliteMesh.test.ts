import { describe, expect, it } from 'vitest';
import type { CoTEntity } from '../types';
import { SATELLITE_MESH, satelliteMeshScale } from './satelliteMesh';
import { processSatelliteFrame } from '../engine/EntityPositionInterpolator';

describe('satellite instancing', () => {
  it('shares a finite, outward-facing eight-triangle mesh', () => {
    const positions = SATELLITE_MESH.attributes.POSITION.value;
    const normals = SATELLITE_MESH.attributes.NORMAL.value;
    expect(positions.length).toBe(8 * 3 * 3);
    expect(Array.from(positions).every(Number.isFinite)).toBe(true);
    for (let i = 0; i < positions.length; i += 9) {
      expect(positions[i] * normals[i] + positions[i + 1] * normals[i + 1] + positions[i + 2] * normals[i + 2]).toBeGreaterThan(0);
    }
  });
  it('keeps polar and high-altitude markers finite and enlarges selection', () => {
    for (const lat of [-90, 0, 90]) {
      const sat = { uid: 'sat', lat, altitude: 35786000 } as CoTEntity;
      const normal = satelliteMeshScale(sat, undefined, 5);
      const selected = satelliteMeshScale(sat, 'sat', 5);
      expect(normal.every(n => Number.isFinite(n) && n > 0)).toBe(true);
      expect(selected[1]).toBeGreaterThan(normal[1]);
    }
  });
  it('does not scan or mutate satellite state when the layer is hidden', () => {
    const satellites = new Map<string, CoTEntity>();
    satellites[Symbol.iterator] = () => { throw new Error('Hidden layer scanned'); };
    const state = new Map();
    expect(processSatelliteFrame(satellites, new Map(), state, undefined, 0, 0)).toEqual([]);
    expect(state.size).toBe(0);
  });
});

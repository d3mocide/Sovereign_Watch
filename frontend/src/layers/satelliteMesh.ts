import type { CoTEntity } from "../types";

// One octahedron shared by every satellite and every frame. Coordinates are
// local east/north/up offsets; per-instance transforms are expressed in meters.
const vertices = [[0, 0, 0.6], [0, 0, -0.6], [0, 1, 0], [1, 0, 0], [0, -1, 0], [-1, 0, 0]];
const faces = [[0, 2, 3], [0, 3, 4], [0, 4, 5], [0, 5, 2], [1, 3, 2], [1, 4, 3], [1, 5, 4], [1, 2, 5]];
const shades = [1, 0.75, 0.5, 0.75, 0.8, 0.6, 0.4, 0.6];
const positions: number[] = [];
const normals: number[] = [];
const colors: number[] = [];
faces.forEach((face, i) => {
  const [a, b, c] = face.map(index => vertices[index]).reverse();
  const u = b.map((v, j) => v - a[j]);
  const v = c.map((value, j) => value - a[j]);
  const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...normal);
  for (const vertex of [a, b, c]) {
    positions.push(...vertex);
    normals.push(...normal.map(n => n / length));
    colors.push(shades[i], shades[i], shades[i]);
  }
});

export const SATELLITE_MESH = {
  attributes: {
    POSITION: { size: 3, value: new Float32Array(positions) },
    NORMAL: { size: 3, value: new Float32Array(normals) },
    COLOR_0: { size: 3, value: new Float32Array(colors) },
  },
};

export function satelliteMeshScale(sat: CoTEntity, selectedUid: string | undefined, zoom: number): [number, number, number] {
  const altitude = sat.altitude || 1000;
  const radiusScale = (6371 + altitude / 1000) / 6371;
  const pixelDegrees = 360 / 512 / Math.pow(2, Math.max(0, zoom));
  const degrees = Math.min(Math.max((sat.uid === selectedUid ? 12 : 6) * pixelDegrees / radiusScale, 0.02), 1);
  const latitudeCosine = Math.max(0.01, Math.cos(sat.lat * Math.PI / 180));
  const eastCorrection = Math.min(1 / latitudeCosine, 10) * latitudeCosine;
  return [degrees * 111000 * eastCorrection, degrees * 111000, degrees * 111000 * radiusScale];
}

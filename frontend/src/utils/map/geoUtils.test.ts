import { describe, it, expect } from 'vitest';
import { chaikinSmooth } from './geoUtils';

describe('chaikinSmooth', () => {
  it('should return original points if fewer than 3 points provided', () => {
    const empty: number[][] = [];
    const one: number[][] = [[0, 0]];
    const two: number[][] = [[0, 0], [10, 10]];

    expect(chaikinSmooth(empty)).toBe(empty);
    expect(chaikinSmooth(one)).toBe(one);
    expect(chaikinSmooth(two)).toBe(two);
  });

  it('should smooth a simple 3-point line (1 iteration)', () => {
    // Triangle: (0,0) -> (10,10) -> (20,0)
    // Seg 1: (0,0) to (10,10)
    //   Q = 0.75*P0 + 0.25*P1 = (0.75*0 + 0.25*10, 0.75*0 + 0.25*10) = (2.5, 2.5)
    //   R = 0.25*P0 + 0.75*P1 = (0.25*0 + 0.75*10, 0.25*0 + 0.75*10) = (7.5, 7.5)
    // Seg 2: (10,10) to (20,0)
    //   Q = 0.75*P0 + 0.25*P1 = (0.75*10 + 0.25*20, 0.75*10 + 0.25*0) = (7.5 + 5, 7.5) = (12.5, 7.5)
    //   R = 0.25*P0 + 0.75*P1 = (0.25*10 + 0.75*20, 0.25*10 + 0.75*0) = (2.5 + 15, 2.5) = (17.5, 2.5)

    // Result should be: [Start, Seg1_Q, Seg1_R, Seg2_Q, Seg2_R, End]
    // [0,0], [2.5, 2.5], [7.5, 7.5], [12.5, 7.5], [17.5, 2.5], [20,0]

    const pts = [[0, 0, 0], [10, 10, 0], [20, 0, 0]]; // Using 3D points as per implementation
    const result = chaikinSmooth(pts, 1);

    expect(result.length).toBe(6);
    expect(result[0]).toEqual([0, 0, 0]);
    expect(result[1]).toEqual([2.5, 2.5, 0]);
    expect(result[2]).toEqual([7.5, 7.5, 0]);
    expect(result[3]).toEqual([12.5, 7.5, 0]);
    expect(result[4]).toEqual([17.5, 2.5, 0]);
    expect(result[5]).toEqual([20, 0, 0]);
  });

  it('should handle 3D coordinates correctly (Z-interpolation)', () => {
    // (0,0,0) -> (0,0,10) -> (0,0,20)
    // Straight line in Z.
    const pts = [[0, 0, 0], [0, 0, 10], [0, 0, 20]];
    const result = chaikinSmooth(pts, 1);

    // Seg 1: 0 -> 10. Q=2.5, R=7.5
    // Seg 2: 10 -> 20. Q=12.5, R=17.5

    expect(result[1][2]).toBe(2.5);
    expect(result[2][2]).toBe(7.5);
    expect(result[3][2]).toBe(12.5);
    expect(result[4][2]).toBe(17.5);
  });

  it('should increase point count with more iterations', () => {
    const pts = [[0, 0, 0], [10, 10, 0], [20, 0, 0]];
    const iter1 = chaikinSmooth(pts, 1);
    const iter2 = chaikinSmooth(pts, 2);

    expect(iter2.length).toBeGreaterThan(iter1.length);
    // 1 iteration: 2 segments -> 2*2 points + 2 ends = 6 points. Segments = 5.
    // 2 iterations: 5 segments -> 5*2 points + 2 ends = 12 points.
    expect(iter2.length).toBe(12);
  });

  it('should default to 2 iterations if not specified', () => {
     const pts = [[0, 0, 0], [10, 10, 0], [20, 0, 0]];
     const result = chaikinSmooth(pts);
     expect(result.length).toBe(12);
  });
});

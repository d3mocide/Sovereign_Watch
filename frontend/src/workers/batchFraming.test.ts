import { describe, expect, it } from "vitest";
import {
  BATCH_MAGIC,
  isBatchFrame,
  isTakFrame,
  splitBatchFrame,
  TAK_MAGIC,
} from "./batchFraming";

function takMessage(payload: number[]): Uint8Array {
  return new Uint8Array([...TAK_MAGIC, ...payload]);
}

function batchFrame(records: Uint8Array[]): Uint8Array {
  let total = 3;
  for (const r of records) total += 4 + r.length;
  const out = new Uint8Array(total);
  out.set(BATCH_MAGIC, 0);
  let offset = 3;
  const view = new DataView(out.buffer);
  for (const r of records) {
    view.setUint32(offset, r.length, true);
    offset += 4;
    out.set(r, offset);
    offset += r.length;
  }
  return out;
}

describe("batchFraming", () => {
  it("identifies legacy TAK frames and batch frames", () => {
    expect(isTakFrame(takMessage([1, 2, 3]))).toBe(true);
    expect(isBatchFrame(takMessage([1, 2, 3]))).toBe(false);
    expect(isBatchFrame(batchFrame([takMessage([1])]))).toBe(true);
    expect(isTakFrame(batchFrame([takMessage([1])]))).toBe(false);
    expect(isTakFrame(new Uint8Array([]))).toBe(false);
    expect(isBatchFrame(new Uint8Array([0xbf]))).toBe(false);
  });

  it("splits a batch frame into its original records", () => {
    const a = takMessage([10, 11]);
    const b = takMessage([20]);
    const c = takMessage([30, 31, 32]);
    const records = splitBatchFrame(batchFrame([a, b, c]));
    expect(records.map((r) => Array.from(r))).toEqual([
      Array.from(a),
      Array.from(b),
      Array.from(c),
    ]);
  });

  it("handles a batch frame arriving in a non-zero-offset view", () => {
    const a = takMessage([1, 2, 3, 4]);
    const frame = batchFrame([a]);
    // Simulate a subarray view into a larger buffer
    const padded = new Uint8Array(frame.length + 8);
    padded.set(frame, 8);
    const view = padded.subarray(8);
    const records = splitBatchFrame(view);
    expect(records.length).toBe(1);
    expect(Array.from(records[0])).toEqual(Array.from(a));
  });

  it("drops a truncated trailing record without throwing", () => {
    const a = takMessage([1, 2]);
    const frame = batchFrame([a, takMessage([3, 4, 5, 6])]);
    const truncated = frame.subarray(0, frame.length - 3);
    const records = splitBatchFrame(truncated);
    expect(records.length).toBe(1);
    expect(Array.from(records[0])).toEqual(Array.from(a));
  });

  it("returns no records for an empty batch frame", () => {
    expect(splitBatchFrame(batchFrame([]))).toEqual([]);
  });
});

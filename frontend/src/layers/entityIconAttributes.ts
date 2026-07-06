import type { CoTEntity } from "../types";
import { entityColor } from "../utils/map/colorUtils";

/**
 * Persistent binary-attribute cache for the 2D entity icon layer.
 *
 * With thousands of COTs, letting deck.gl iterate a fresh object array and
 * call five accessors per entity per frame dominates the frame budget. This
 * cache keeps typed arrays across frames and fills them in one pass:
 *
 *  - positions / angles change every frame → written into ping-pong buffer
 *    pairs so the external-buffer reference changes whenever content does
 *    (deck skips re-upload for an unchanged reference).
 *  - colors / sizes / icon kinds change slowly → recomputed only when the
 *    entity membership changes, the selection changes, or on a 1 s cadence
 *    (entityColor tracks altitude/speed, which drift far slower than that).
 *
 * The returned `data` object is consumed by IconLayer as partial binary data;
 * picking then reports indices into the same entity array that filled the
 * buffers, so handlers resolve `entities[info.index]`.
 */

const STYLE_REFRESH_INTERVAL_MS = 1000;
const BASE_ICON_SIZE = 32;
const SELECTED_ICON_SIZE = BASE_ICON_SIZE * 1.3;

export interface EntityIconBinaryData {
  length: number;
  attributes: {
    getPosition: { value: Float64Array; size: 3 };
    getAngle: { value: Float32Array; size: 1 };
    getColor: { value: Uint8Array; size: 4 };
    getSize: { value: Float32Array; size: 1 };
  };
}

export interface EntityIconFrame {
  data: EntityIconBinaryData;
  /** 1 = vessel icon, 0 = aircraft icon; parallel to the entity array. */
  shipFlags: Uint8Array;
}

export class EntityIconAttributeCache {
  private capacity = 0;
  private slot = 0;
  private positions: [Float64Array, Float64Array] = [
    new Float64Array(0),
    new Float64Array(0),
  ];
  private angles: [Float32Array, Float32Array] = [
    new Float32Array(0),
    new Float32Array(0),
  ];
  private styleSlot = 0;
  private colors: [Uint8Array, Uint8Array] = [
    new Uint8Array(0),
    new Uint8Array(0),
  ];
  private sizes: [Float32Array, Float32Array] = [
    new Float32Array(0),
    new Float32Array(0),
  ];
  private shipFlags = new Uint8Array(0);
  private uids: (string | undefined)[] = [];
  private lastCount = -1;
  private lastSelectedUid: string | null = null;
  private lastStyleRefresh = 0;

  private ensureCapacity(n: number): void {
    if (n <= this.capacity) return;
    const cap = Math.max(16, Math.ceil(n * 1.5));
    this.positions = [new Float64Array(cap * 3), new Float64Array(cap * 3)];
    this.angles = [new Float32Array(cap), new Float32Array(cap)];
    this.colors = [new Uint8Array(cap * 4), new Uint8Array(cap * 4)];
    this.sizes = [new Float32Array(cap), new Float32Array(cap)];
    this.shipFlags = new Uint8Array(cap);
    this.uids = new Array(cap);
    this.capacity = cap;
    this.lastStyleRefresh = 0; // force a style fill into the new buffers
  }

  update(
    entities: CoTEntity[],
    selectedUid: string | null,
    now: number,
  ): EntityIconFrame {
    const n = entities.length;
    this.ensureCapacity(n);

    // Ping-pong the per-frame buffers so their references change with content.
    this.slot = 1 - this.slot;
    const positions = this.positions[this.slot];
    const angles = this.angles[this.slot];

    let membershipChanged = n !== this.lastCount;
    for (let i = 0; i < n; i++) {
      const e = entities[i];
      const base = i * 3;
      positions[base] = e.lon;
      positions[base + 1] = e.lat;
      positions[base + 2] = e.altitude || 0;
      angles[i] = -(e.course || 0);
      if (this.uids[i] !== e.uid) {
        this.uids[i] = e.uid;
        membershipChanged = true;
      }
    }
    this.lastCount = n;

    const styleRefresh =
      membershipChanged ||
      selectedUid !== this.lastSelectedUid ||
      now - this.lastStyleRefresh >= STYLE_REFRESH_INTERVAL_MS;

    if (styleRefresh) {
      this.styleSlot = 1 - this.styleSlot;
      const colors = this.colors[this.styleSlot];
      const sizes = this.sizes[this.styleSlot];
      for (let i = 0; i < n; i++) {
        const e = entities[i];
        const [r, g, b, a] = entityColor(e);
        const base = i * 4;
        colors[base] = r;
        colors[base + 1] = g;
        colors[base + 2] = b;
        colors[base + 3] = a;
        sizes[i] =
          selectedUid && e.uid === selectedUid
            ? SELECTED_ICON_SIZE
            : BASE_ICON_SIZE;
        this.shipFlags[i] = e.type.includes("S") ? 1 : 0;
      }
      this.lastStyleRefresh = now;
      this.lastSelectedUid = selectedUid;
    }

    return {
      data: {
        length: n,
        attributes: {
          getPosition: { value: positions, size: 3 },
          getAngle: { value: angles, size: 1 },
          getColor: { value: this.colors[this.styleSlot], size: 4 },
          getSize: { value: this.sizes[this.styleSlot], size: 1 },
        },
      },
      shipFlags: this.shipFlags,
    };
  }
}

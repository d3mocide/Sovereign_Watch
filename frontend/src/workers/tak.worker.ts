import { load, Type } from 'protobufjs';
import { isBatchFrame, isTakFrame, splitBatchFrame } from './batchFraming';

// --- State ---
let takType: Type | null = null;
// let processing = false;

// Batching: accumulate decoded entities and flush periodically.
// A larger batch means fewer worker→main postMessage wakeups during dense
// bursts (the orbital sweep alone emits ~11k messages per cycle); latency is
// still bounded by FLUSH_INTERVAL_MS for sparse traffic.
let batch: unknown[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_SIZE = 64;
const FLUSH_INTERVAL_MS = 50;

function flushBatch() {
    if (batch.length > 0) {
        self.postMessage({ type: "entity_batch", data: batch });
        batch = [];
    }
    flushTimer = null;
}

// --- Constants ---
// Magic Bytes: 0xbf 0x01 0xbf
// const MAGIC_BYTES = new Uint8Array([0xbf, 0x01, 0xbf]);

// --- Initialization ---
// We can't rely on standard fetch relative paths easily in workers without some Vite magic
// or passing the absolute URL from the main thread.
// For now, we'll assume the main thread passes the proto definition string or URL.

// --- Message Handling ---
self.onmessage = async (e: MessageEvent) => {
    const { type, payload } = e.data;

    if (type === 'init') {
        const protoUrl = payload;
        try {
            const root = await load(protoUrl);
            takType = root.lookupType("tak.proto.TakMessage");
            // console.log("TAK Worker: Schema Loaded");
            self.postMessage({ type: 'status', status: 'ready' });
        } catch (err) {
            console.error("TAK Worker: Schema Load Failed", err);
            self.postMessage({ type: 'status', status: 'error', error: str(err) });
        }
        return;
    }

    if (type === 'decode_batch') {
        if (!takType) return;

        const buffer = new Uint8Array(payload);

        // Coalesced frame: repeated [u32le length + single-message payload]
        if (isBatchFrame(buffer)) {
            for (const record of splitBatchFrame(buffer)) {
                decodeOne(record);
            }
            return;
        }

        // Legacy frame: exactly one magic-prefixed TAK message
        decodeOne(buffer);
    }
};

function decodeOne(buffer: Uint8Array): void {
    if (!takType || !isTakFrame(buffer)) return;
    try {
        // The proto payload follows the 3-byte magic header.
        const cleanBuffer = buffer.subarray(3);

        const message = takType.decode(cleanBuffer);

        // Convert to plain object
        const object = takType.toObject(message, {
            longs: Number,
            enums: String,
            bytes: String,
        });

        // BUG-018: Removed hex debug computation (Array.from().map().join())
        // that ran on every decoded message in production. Raw hex is
        // a debug/inspection artifact and not consumed by any UI feature.

        batch.push(object);
        if (batch.length >= BATCH_SIZE) {
            flushBatch();
        } else if (!flushTimer) {
            flushTimer = setTimeout(flushBatch, FLUSH_INTERVAL_MS);
        }
    } catch (parseErr) {
        console.error("TAK Parse Error:", parseErr);
    }
}

function str(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

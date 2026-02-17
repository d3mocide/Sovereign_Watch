import { load, Type } from 'protobufjs';

// --- State ---
let takType: Type | null = null;
// let processing = false;

// Batching: accumulate decoded entities and flush periodically
let batch: any[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_SIZE = 10;
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
        
        // Payload is Array<ArrayBuffer> or just ArrayBuffer
        // We expect raw bytes.
        const buffer = new Uint8Array(payload);
        
        // 1. Check Magic Bytes (Simple Check)
        if (buffer[0] === 0xbf && buffer[1] === 0x01 && buffer[2] === 0xbf) {
            try {
                // Skip 3 bytes? Or does the proto include them?
                // Usually protocol wrappers strip headers before proto decoding.
                // If the proto IS the payload after magic bytes:
                const cleanBuffer = buffer.subarray(3);
                
                const message = takType.decode(cleanBuffer);
                // Convert raw buffer to Hex String for inspection
                const hex = Array.from(cleanBuffer)
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join(' ');

                // Convert to plain object
                const object = takType.toObject(message, {
                    longs: Number,
                    enums: String,
                    bytes: String,
                });
                
                // Attach raw payload
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (object as any).raw = hex;
                
                // Return Parsed Data
                // Optimization: In real world, we would write to a SharedArrayBuffer here.
                // For FE-05 MVP, we just return the object.
                batch.push(object);
                if (batch.length >= BATCH_SIZE) {
                  flushBatch();
                } else if (!flushTimer) {
                  flushTimer = setTimeout(flushBatch, FLUSH_INTERVAL_MS);
                }
                
            } catch (parseErr) {
                // console.warn("TAK Parse Error:", parseErr);
            }
        }
    }
};

function str(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

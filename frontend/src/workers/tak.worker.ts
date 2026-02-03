import { load, Type, Root } from 'protobufjs';

// --- State ---
let takType: Type | null = null;
let processing = false;

// --- Constants ---
// Magic Bytes: 0xbf 0x01 0xbf
const MAGIC_BYTES = new Uint8Array([0xbf, 0x01, 0xbf]);

// --- Initialization ---
// We can't rely on standard fetch relative paths easily in workers without some Vite magic
// or passing the absolute URL from the main thread.
// For now, we'll assume the main thread passes the proto definition string or URL.
// But valid strategy: Use a self-hosted string or a known URL.
// Better: Compile the proto to JSON/JS and bundle it.
// FASTEST PATH: Just embed the JSON descriptor here to avoid network fetches in the worker startup.
// ... But user asked for .proto.
// Let's try fetching relative to the worker script context.

const initialize = async () => {
    try {
        // In Vite, assets in `public` or imported via `?url` are best.
        // We'll trust the main thread might initialize us or we fetch from a known path.
        // For MVP, let's try fetching from the generated bundle location if possible.
        // Simplify: The main thread will pass the Schema URL in the "init" message.
    } catch (err) {
        console.error("Worker Init Failed:", err);
    }
};

// --- Message Handling ---
self.onmessage = async (e: MessageEvent) => {
    const { type, payload } = e.data;

    if (type === 'init') {
        const protoUrl = payload;
        try {
            const root = await load(protoUrl);
            takType = root.lookupType("tak.proto.TakMessage");
            console.log("TAK Worker: Schema Loaded");
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
                // Convert to plain object
                const object = takType.toObject(message, {
                    longs: Number,
                    enums: String,
                    bytes: String,
                });
                
                // Return Parsed Data
                // Optimization: In real world, we would write to a SharedArrayBuffer here.
                // For FE-05 MVP, we just return the object.
                self.postMessage({ type: 'entity_update', data: object });
                
            } catch (parseErr) {
                console.warn("TAK Parse Error:", parseErr);
            }
        }
    }
};

function str(err: any): string {
    return err instanceof Error ? err.message : String(err);
}

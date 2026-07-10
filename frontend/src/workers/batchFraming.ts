/**
 * Wire framing for the /api/tracks/live WebSocket.
 *
 * Legacy frame:  0xbf 0x01 0xbf + one TAK protobuf payload.
 * Batch frame:   0xbf 0x02 0xbf + repeated records of
 *                [uint32 little-endian length + payload], where each payload
 *                is itself a complete legacy frame (magic included) so single
 *                and batched messages share the same decode path.
 */

export const TAK_MAGIC = [0xbf, 0x01, 0xbf] as const;
export const BATCH_MAGIC = [0xbf, 0x02, 0xbf] as const;

export function isBatchFrame(buffer: Uint8Array): boolean {
  return (
    buffer.length >= 3 &&
    buffer[0] === BATCH_MAGIC[0] &&
    buffer[1] === BATCH_MAGIC[1] &&
    buffer[2] === BATCH_MAGIC[2]
  );
}

export function isTakFrame(buffer: Uint8Array): boolean {
  return (
    buffer.length >= 3 &&
    buffer[0] === TAK_MAGIC[0] &&
    buffer[1] === TAK_MAGIC[1] &&
    buffer[2] === TAK_MAGIC[2]
  );
}

/**
 * Split a batch frame into its record payloads (zero-copy subarray views).
 * Malformed tails (truncated length or payload) are dropped silently.
 */
export function splitBatchFrame(buffer: Uint8Array): Uint8Array[] {
  const records: Uint8Array[] = [];
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 3;
  while (offset + 4 <= buffer.length) {
    const length = view.getUint32(offset, true);
    offset += 4;
    if (length === 0 || offset + length > buffer.length) break;
    records.push(buffer.subarray(offset, offset + length));
    offset += length;
  }
  return records;
}

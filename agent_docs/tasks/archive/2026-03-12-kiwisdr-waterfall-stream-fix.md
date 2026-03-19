# KiwiSDR Waterfall & Audio Stream Fixes

## Issue
The HF Listening Post UI was not receiving audio or waterfall data from the KiwiSDR. The UI indicated a broken connection, and the stream channels were silent on the backend, failing to transmit PCM audio or spectrogram pixels.

## Findings & Solutions

We isolated protocol mismatch errors and synchronization race conditions across both the Audio (`SND`) and Waterfall (`W/F`) WebSocket channels.

### 1. Audio Stream (SND) Fixes (Completed)
* **Handshake Sequence:** `kiwi_client.py` was sending `SET mod` and `SET freq` as separate commands. KiwiSDR requires them as a single atomic string (`SET mod=... freq=... low_cut=... high_cut=...`), otherwise the internal state machine stalls.
* **Missing Initialization:** Added required config flags (`SET squelch=0 max=0`, `SET genattn=0`, `SET gen=0 mix=-1`, `SET ident_user=js8bridge`) to the initial connection burst.
* **Telemetry Race Condition:** The backend was delaying `SET AR OK` and waiting for `MSG sample_rate=`. Blasting the configuration synchronously immediately after authentication resolved the audio stream hang.

### 2. Waterfall Stream Fixes (Completed, Pending Final UI Verification)
* **Wrong KiwiSDR Endpoint:** The backend was querying the `/WVM` (Waterfall Video Map) WebSocket endpoint. The correct endpoint for standard KiwiSDR spectrum data is actually `/W/F`.
* **Magic Bytes Mismatch:** Because the endpoint is `W/F`, the binary frames return the magic prefix `b"W/F"`, not `b"WVM"`. Updated `kiwi_client.py`'s `_wf_receive_loop` to parse parser logic accordingly.
* **Waterfall Init Race Condition:** Similar to the audio channel, the waterfall channel was waiting for a telemetry config message before sending `SET zoom=0 cf=...`. This pauses the server, causing it to drop the client. Moved `SET zoom...`, `SET max_freq...`, and `SET bins...` to be sent immediately after `SET auth`.
* **Frontend WS Port:** `ListeningPost.tsx` was falling back to `localhost:80` instead of the correct `8082`. Updated `WATERFALL_WS_URL`.

## Changes Made
* `js8call/kiwi_client.py`:
  * Rewrote `_handshake()` to accurately burst the KiwiSDR initialization block for the `/SND` channel.
  * Extracted `SET zoom=0 cf=...` logic to `_start_waterfall()` in a synchronous initialization burst.
  * Updated connection endpoint and binary parser from `WVM` to `W/F`.
* `frontend/src/components/js8call/ListeningPost.tsx`:
  * Fixed `WS_BASE_URL` port alignment to `8082`.

## Verification & Next Steps
1. The code is completely implemented and the Docker container was just rebuilt.
2. When you resume, connect to the HF Listening Post UI.
3. Audio should unmute, and the Panoramic Waterfall (WVM/WF) component should now render pixels.
4. If the waterfall is still blank, run `docker logs sovereign-js8call | grep "W/F"` to verify if the binary frames are being actively decoded!

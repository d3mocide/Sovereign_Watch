# Radio pipeline runtime and audio audit

## Issue

Determine whether the Radio tab can receive KiwiSDR audio, decode JS8Call traffic and deliver decoded messages to the web client; establish practical tests.

## Solution

Audit the actual running container and source, run existing radio tests, reproduce PCM byte-order behavior with known sample values, and make short independent receive-only connections to a public KiwiSDR. Do not retune the application's receiver or send any radio/API transmission commands.

## Changes

Documentation only. Runtime smoke scripts were temporary and removed from the container. No decoder, frontend, authentication, Docker configuration, branch on GitHub or service deployment was changed. The audit worktree is on `audit/radio-pipeline` at the merged dev source snapshot; relevant radio source matches main.

## Findings

1. **Decoder unavailable (blocking):** running image is Ubuntu 22.04.5 / glibc 2.35. JS8Call 3.0.3 exits at startup with missing GLIBC_2.38 and GLIBCXX_3.4.31/3.4.32 requirements. `ps` shows the bridge, PulseAudio and pacat, but no JS8Call decoder and no PulseAudio source-output capturing audio. Configured binary/library compatibility must be repaired before decoding can work.
2. **Health covers the bridge only:** `/health` returns HTTP 200 and status ok while reporting js8call_connected=false, kiwi_connected=false. Entrypoint continues after the decoder exits and tails /dev/null. Docker healthy therefore does not prove a healthy decoder.
3. **PCM byte order is wrong:** KiwiClient forwards the SND payload without converting byte order. pacat and browser both consume S16LE. A known big-endian payload of [1000, -2000, 3000, -4000] emerges as [-6141, 12536, -18421, 24816] when consumed as S16LE; the little-endian fixture is correct. Two independent short live receiver sessions succeeded; all 20 inspected live SND frames had the little-endian flag unset. This is a live-impacting issue, not only a synthetic edge case. [Reference kiwiclient](https://github.com/jks-prv/kiwiclient/blob/master/kiwi/client.py) converts ordinary uncompressed network samples from big endian.
4. **SEND gives misleading confirmation:** server._udp_send drops commands when no decoder address has been learned, but the SEND handler enqueues TX.SENT regardless. Frontend SEND is gated on bridge connectivity rather than decoder/actual transmit capability. This was established from source; no SEND command was executed during the audit. KiwiSDR is a receiving source; no physical transmit chain is configured for this virtual rig.
5. **Additional reliability gaps:** native Kiwi status reflects an open WebSocket, not confirmed audio reception/authentication; unsupported compressed/stereo frames can be forwarded as mono PCM; sample-rate metadata does not change the hardcoded 12 kHz playback path. Entrypoint creates a duplicate KIWI_RX.2 sink. These need targeted tests and explicit readiness stages.

## Verification

- Radio lint passed with pinned Ruff and the repository correctness policy.
- Existing radio suite: 26 tests passed on Python 3.12 with frozen dependencies. These exercise command formatting/debounce and do not start the real decoder or prove decoding.
- Actual health payload: status ok, js8call_connected=false, kiwi_connected=false. PulseAudio inspection used its actual socket `/run/user/1000/pulse/native`; the Docker exec default socket differs, so default pactl failures are not evidence of a failed running audio daemon.
- Public directory refresh found 863 receivers. A short separate client at 50.53.41.24:8073 tuned receive-only to 7078 kHz USB received 20 nonzero PCM payloads totaling 20,480 bytes. A second connection inspected 20 SND frames: flags 7 (one), 0 (14), 2 (five); all were uncompressed with little-endian flag unset. Connections were closed in finally blocks; the application's shared receiver was not changed.
- Fixture reproduction passed for little-endian input and demonstrated sample corruption for big-endian input. This deliberately diagnoses a failure rather than marking the audio implementation correct.
- All 14 application services remained running. No complete JS8 decode, browser playback or over-the-air transmission was established. This audit cannot determine whether older versions ever worked.

## Repair and acceptance sequence

1. Make the decoder image compatible with its pinned JS8Call binary and verify executable startup in Docker, not only image build success. Confirm API settings and an active input stream on KIWI_RX.monitor.
2. Normalize uncompressed mono PCM to S16LE; reject or correctly support other frame formats. Validate sample-rate negotiation, buffer behavior and timing, with protocol fixtures covering both byte orders.
3. Expose bridge, receiver/audio, decoder and decode activity independently. Supervise child-process failure and avoid a misleading healthy decoder indication. Disable transmit UI for this receive-only setup and distinguish command acceptance from actual transmitted events.
4. Add a deterministic integration fixture containing a known JS8 transmission. Replay it through the same audio pipeline into the real decoder and assert the expected RX event reaches the authenticated browser WebSocket. Include corrupted audio, silent audio, decoder-down and receiver-auth/error cases. A fake RX event is only a transport test, not decoder evidence.
5. Receive from a live public node on an active JS8 band and observe actual decoded traffic in the Radio tab. No decode during a quiet interval is inconclusive; the known recording remains the repeatable acceptance gate. Browser audio needs a user gesture; test real playback and mobile resume behavior separately.

## Benefits

Separates functioning receiver transport from failed decoding, identifies reproducible blockers and misleading UI signals, and establishes an acceptance test that proves actual audio-to-message conversion.

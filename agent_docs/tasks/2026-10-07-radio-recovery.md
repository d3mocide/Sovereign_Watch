# Radio pipeline recovery

## Issue

The Radio bridge reported healthy even though JS8Call 3.0.3 could not start on
Ubuntu 22.04. Uncompressed Kiwi audio was interpreted in the wrong byte order,
Qt could not select the monitor capture device, ordinary decodes were dropped,
and the waterfall used a different receiver session. The interface also offered
transmission through a receive-only input.

## Solution

Restore the actual receiver-to-decoder path and prove it with a pinned upstream
JS8 recording. Expose explicit decoder, audio and waterfall readiness instead of
assuming a running bridge means working reception.

## Changes

- `js8call/Dockerfile`: Ubuntu 24.04 runtime, required Qt/EGL libraries, frozen
  Python dependencies, one receive sink and a Qt-visible remapped capture source.
- `js8call/entrypoint.sh` and `js8call/js8call.ini`: stable audio device IDs,
  receive monitoring, configured grid, discarded output and critical-child
  supervision. Child failure exits the container rather than leaving a healthy
  bridge without a decoder.
- `js8call/kiwi_client.py`: normalize big-endian PCM, pair audio/waterfall session
  IDs, reject unsupported frames/modes and require actual audio before readiness.
- `js8call/server.py`: forward ordinary and directed decodes, configure the full
  receive passband, probe actual decoder capture, publish periodic radio status,
  return degraded health when decoder reception is unavailable and reject SEND.
- Radio UI/hooks: separate bridge/decoder indicators, receive-only messaging,
  responsive waterfall sizing and fresh-row state, bounded playback queue and
  cleanup that prevents reconnecting after leaving Radio.
- Python/frontend regression tests and CI include the new radio tests.
- `tools/radio/`: repeatable real-decoder fixture replay and pinned download
  instructions, without bundling upstream WAV files.

## Verification

- Frontend lint/typecheck and 318 tests passed.
- Radio Ruff passed and all 40 Python tests passed.
- Real upstream `A_1_4.wav` decoded all four calls, including
  `K0OG: KN4CRD SNR +02`, via Kiwi framing, PulseAudio, JS8Call and WebSocket.
  Initial replay produced 1,605 PCM frames and 344 waterfall rows.
- A weaker `A_2_1.wav` did not decode in the initial diagnostic run; acceptance
  uses the pinned `A_1_4.wav` and asserts known text explicitly.
- Final production image replay passed the exact-text assertion with 1,610 PCM
  frames and 344 waterfall rows.
- Live KiwiSDR `50.53.41.24:8073`, 7078 kHz USB: 698 nonzero PCM frames and
  676 real 1,024-bin waterfall rows in 30 seconds. A longer 90-second browser
  validation received 2,104 nonzero PCM frames and 2,055 waterfall rows. Real
  on-air JS8 traffic from `WO7I` was decoded, with directed and spot events.
- Chromium browser validation at 1440x900 and 390x844 painted live waterfall
  rows with hundreds of distinct colors; canvases sized to 832x781 and 390x493
  respectively, with no horizontal viewport overflow or page errors. Other API
  data was isolated; radio WebSockets connected to the real validation bridge.
- Terminating JS8Call in the isolated container caused its supervisor to exit
  with status 1 and shut down the bridge, preventing a false healthy state.
- Applied the verified radio/frontend images to the existing production stack.
  All 14 services remain running; radio is healthy, frontend and radio proxy
  respond HTTP 200, and unauthenticated radio WebSockets close with code 4001.
  Decoder readiness does not mean a receiver is selected: receiver freshness
  appears separately in status. Verification was completed before preparing the patch for `dev`.
- After the initial receiver developed ADC overload, switched the shared
  receiver to `noise.proxy.kiwisdr.com:8073`, still at 7078 kHz USB. Audio and
  waterfall were fresh, with zero overload events during a 15-second follow-up.
  The user confirmed seeing decoded data in their frontend.
- Code was synchronized into `/opt/Sovereign_Watch` after baseline comparison,
  preserving existing local edits. The isolated change branch is
  `audit/radio-pipeline`; rollback images are tagged
  `sovereign-radio-rollback:2026-10-07` and
  `sovereign-radio-frontend-rollback:2026-10-07`.

## Benefits

A verifiable, working receive path, honest health indicators, clearer Radio
controls and fewer stale audio/waterfall failures. The pinned fixture supports
repeatable diagnosis independently of changing propagation or receiver capacity.

# Radio acceptance test

This exercises a real JS8Call decoder, not a mocked decode. It serves a recording
as big-endian Kiwi SND frames and paired waterfall frames, then checks the bridge's
PCM audio, waterfall rows and decoded WebSocket messages. Use a separate radio
container: the test temporarily selects a loopback receiver.

The upstream recording is from JS8Call-improved's GPL-3.0 test corpus. Download
it outside the repository, using the pinned commit and verify its checksum:

```sh
curl -fL https://raw.githubusercontent.com/JS8Call-improved/JS8Call-improved/4c592bd9a034f18178a3e7179db92acb14939668/media/tests/A_1_4.wav -o /tmp/A_1_4.wav
printf '%s\n' '60b650c2090dff5e2144f164ebe692cde5f048c769518e1b1b9e67223f3da138  /tmp/A_1_4.wav' | sha256sum -c -
docker compose build sovereign-js8call
docker compose run -d --no-deps --name radio-acceptance -e AUTH_ENABLED=false sovereign-js8call
docker cp /tmp/A_1_4.wav radio-acceptance:/tmp/fixture.wav
docker cp tools/radio/replay_fixture.py radio-acceptance:/tmp/replay_fixture.py
# Wait for /health to return 200 before replaying.
docker exec radio-acceptance curl -f http://localhost:8080/health
docker exec radio-acceptance python /tmp/replay_fixture.py /tmp/fixture.wav --isolated-validation --expected-text 'K0OG: KN4CRD SNR +02'
docker rm -f radio-acceptance
```

Do not publish ports on the authentication-disabled test container. The test takes
about 70 seconds, aligning the 15-second WAV to JS8's UTC decoding cycle and
replaying twice. A passing result requires the expected real decoded text, PCM
frames and 1,024-bin waterfall rows. Waterfall rows in this fixture test are
synthetic; validate a public receiver separately to test its real waterfall.

Production remains authenticated and receive-only. A KiwiSDR supplies reception;
this integration has no physical transmitter. `/health` checks decoder heartbeat
and actual, uncorked JS8Call audio capture. `RADIO.STATUS` additionally distinguishes
receiver connectivity, fresh audio, fresh waterfall and the most recent decode.

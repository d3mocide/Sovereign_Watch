# JS8Call, Common Frequencies, and Operation with a Remote KiwiSDR

## Overview

JS8Call is an open‑source application that implements the JS8 digital mode: a custom 8‑FSK modulation derived from FT8, but extended with a robust messaging and networking layer for human‑readable QSOs and store‑and‑forward traffic on HF.[web:1][web:7][web:23][web:26]
It sacrifices some of FT8’s pure contact rate in exchange for longer free‑text messages, directed callsigns, relays, heartbeats, and APRS/JS8NET gateway features, all designed to work under low SNR, QRP, and compromised‑antenna conditions.[web:1][web:5][web:7][web:24][web:26]

## How JS8Call Works

JS8Call’s RF layer uses JS8, a narrow‑band multi‑tone 8‑FSK scheme that is directly descended from FT8’s waveform but with different framing and symbol mapping optimized for flexible message content rather than fixed 77‑bit contest‑style exchanges.[web:1][web:7][web:24]
The software transmits and decodes in time‑synchronized frames, most commonly 15‑second periods (“Normal” speed), but also offering 10‑second (“Fast”), 6‑second (“Turbo”), and slower 30‑second modes, trading throughput against decoding sensitivity and occupied bandwidth.[web:1][web:30]

Typical JS8Call frame characteristics (from the official guide and release notes) are:[web:1][web:30]

- Normal: 15 s frames, ≈50 Hz occupied bandwidth, ≈16 WPM text rate, decoding down to roughly −24 dB SNR.
- Fast: 10 s frames, ≈80 Hz bandwidth, ≈24 WPM, decode around −20 dB.
- Turbo: 6 s frames, ≈160 Hz bandwidth, ≈40 WPM, decode around −18 dB.
- Slow (30 s mode, later versions): further improved sensitivity, with decoding thresholds around −28 dB for marginal QRP work.[web:30]

As with FT8, JS8Call relies heavily on accurate timing; the application either syncs to system time or can use on‑air timing aids, and decoders expect clock error to be within about a second for reliable decodes.[web:1][web:26][web:19]

## Messaging and Networking Features

On top of the JS8 modulation, JS8Call implements a structured messaging protocol that supports several higher‑level functions:[web:1][web:7][web:24][web:26]

- Keyboard‑to‑keyboard chat: Free‑text QSOs using multiple consecutive frames; the software segments and reassembles long messages automatically.[web:1][web:24]
- Directed messages: Messages are prefixed with the originator’s callsign and an explicit destination (e.g., `CALL1>CALL2>MESSAGE`), allowing targeted traffic and multi‑hop paths.[web:1][web:7][web:24]
- Heartbeats (HB): Periodic short transmissions advertising a station’s presence; other stations in “auto” mode reply with SNR reports, effectively mapping who hears whom and who can relay.[web:1][web:26]
- Relaying / store‑and‑forward: Stations in auto mode can automatically relay traffic addressed through them, enabling messages to reach stations beyond direct propagation via multi‑hop routing.[web:1][web:24][web:26]
- APRS / JS8NET gateways: Special commands (e.g. `@APRSIS GRID ...`) allow embedding APRS‑style information that gateways forward into APRS‑IS, providing position reporting and other integrations.[web:1][web:26][web:13]

All of this is presented in a UI closely inspired by WSJT‑X—complete with waterfall, decoded text panes, and logging—while remaining focused on conversational and networked usage rather than short contest exchanges.[web:1][web:7][web:23][web:24]

## Common JS8Call Frequencies

JS8Call is intentionally operated near—but not on—the standard FT8 calling frequencies to avoid QRMing FT8 activity while still making it easy to find.[web:1][web:2][web:5]
The JS8Call guide and several frequency charts (WSJT‑X defaults, SigidWiki, and club guides) agree on a widely used set of dial frequencies, typically 2–9 kHz offset from the primary FT8 channels depending on band.[web:1][web:2][web:5][web:8]

### HF and VHF JS8Call Calling Frequencies

All frequencies below are dial frequencies in MHz (USB), derived from the JS8Call guide and commonly published lists.[web:1][web:2][web:5][web:8]

| Band  | JS8Call dial freq (MHz) | Approx. relation to FT8 dial |
|-------|-------------------------|------------------------------|
| 160 m | 1.842                   | ≈2 kHz above 1.840           |
| 80 m  | 3.578                   | ≈5 kHz above 3.573           |
| 40 m  | 7.078                   | ≈4 kHz above 7.074           |
| 30 m  | 10.130                  | ≈6 kHz below 10.136          |
| 20 m  | 14.078                  | ≈4 kHz above 14.074          |
| 17 m  | 18.104                  | ≈4 kHz above 18.100          |
| 15 m  | 21.078                  | ≈4 kHz above 21.074          |
| 12 m  | 24.922                  | ≈7–9 kHz above 24.915        |
| 10 m  | 28.078                  | ≈4 kHz above 28.074          |
| 6 m   | 50.318                  | ≈5 kHz above 50.313          |
| 2 m   | 144.178                 | ≈4 kHz above common FT8 use  |

These values match the default or suggested JS8Call frequency list and are echoed in third‑party FT8/JS8 frequency charts; operators may also agree on alternative channels by region or local practice.[web:1][web:2][web:5]

The JS8Call documentation explicitly notes that these are suggested calling frequencies only; operators are free to use any appropriate frequency in the band, taking responsibility to avoid interference with other modes and band‑plan restrictions.[web:1][web:5]

### Band‑Usage Patterns

Community reports and guides suggest that:[web:14][web:19][web:26]

- 40 m (7.078 MHz) tends to have the most consistent JS8Call activity, especially in the evening and night for regional and some DX paths.
- 20 m (14.078 MHz) is more active during daytime and supports longer‑distance DX QSOs when the band is open.
- 30 m and 17 m see intermittent but often high‑quality weak‑signal activity, useful for experimentation and long‑haul QRP work.

Because JS8Call is less crowded than FT8, calling frequencies may appear sparse; leaving the program running for heartbeats and automatic replies is a common way to “see” JS8 activity over time.[web:14][web:26]

## KiwiSDR Overview

KiwiSDR is a network‑connected, HF‑only SDR receiver (10 kHz–30 MHz) built on a dedicated board plus a BeagleBone single‑board computer, accessed via a browser‑based UI over Ethernet or the Internet.[web:3][web:6]
A single KiwiSDR typically allows 4–8 simultaneous independent user sessions, each with its own frequency, mode, and audio/waterfall instance; owners can register public receivers on the kiwisdr.com directory so others can listen remotely.[web:3][web:6]

The standard web interface provides:[web:6]

- Tuning across the HF spectrum with various demodulation modes (AM, SSB, CW, etc.) and adjustable filters.
- Per‑client audio streaming and waterfall rendering directly in the browser.
- “Extensions” like built‑in WSPR decoding and TDoA geolocation, which run server‑side and require no additional local software.[web:3][web:6]

KiwiSDR is receive‑only; it provides no transmit capability, so any use of JS8Call with a KiwiSDR is inherently receive‑only unless paired with a separate remote‑controlled transmitter.[web:3][web:6]

## Conceptual Integration: JS8Call with a Remote KiwiSDR

From JS8Call’s perspective, a KiwiSDR (or any online WebSDR) is simply a remote HF receiver that outputs baseband audio over the network; if that audio is routed into JS8Call’s input in a timely and reasonably linear fashion, JS8Call can decode JS8 frames as though they came from a local radio.[web:16][web:17][web:19][web:32]
The typical integration pattern therefore looks like this:

1. KiwiSDR receives HF RF and demodulates it to USB audio on the chosen JS8Call calling frequency.
2. The browser or SDR client plays that audio to a local “sound device” (speaker).
3. A virtual audio cable driver is configured so that instead of going to speakers, the audio is sent to a virtual output/input pair.
4. JS8Call is configured to use the virtual cable as its audio input, with rig control and transmit disabled, creating a receive‑only JS8Call monitor for that band.[web:17][web:19][web:20][web:32]

Public guidance for FT8/WSJT‑X with remote KiwiSDRs describes the same basic audio‑routing approach, and JS8Call uses an identical sound‑card interface model, so the method carries over directly.[web:32][web:33]

## Audio Routing via Virtual Audio Cables

Several tutorials show receive‑only JS8Call setups using SDR software or WebSDRs plus virtual audio cables:[web:16][web:17][web:19][web:20][web:35]

- On Windows, the common choice is VB‑Audio Virtual Cable, which exposes a “Cable Input” (playback) and “Cable Output” (recording) device that can be selected in both the SDR client and JS8Call.[web:16][web:17][web:22][web:29]
- On macOS, tools like BlackHole provide a similar loopback device for routing audio between apps, recommended as a more robust alternative to “microphone pointed at speakers.”[web:20]

A representative receive‑only JS8Call / WebSDR flow (shown in YouTube demos) is:[web:17][web:35]

- WebSDR or SDR software:
  - Audio output device → “Cable Input (VB‑Audio Virtual Cable)” (or equivalent).
- JS8Call:
  - Audio input device → “Cable Output (VB‑Audio Virtual Cable)”.
  - Audio output device → normal speakers/headphones (optional, for monitoring).

This effectively “plugs” the KiwiSDR’s demodulated JS8Call audio directly into JS8Call’s decoder, without ever sending it to physical speakers.[web:17][web:19][web:20]

## Time Synchronization and Latency Considerations

Because JS8Call uses fixed‑length time slots similar to FT8, system clock accuracy and end‑to‑end latency matter:[web:1][web:26][web:19][web:32]

- Tutorials emphasize using an NTP‑based time sync tool (e.g., BktTimeSync on Windows) so that PC time is within roughly a second of UTC.[web:17][web:19][web:20]
- KiwiSDR introduces some buffering and Internet latency, but operators have reported that FT8 and WSPR decoding via remote Kiwi receivers is generally reliable, while very short‑duration modes like FT4 can fail due to the higher percentage of latency vs. frame length.[web:3]

Given that JS8Call’s common modes use 10–30 second frames, typical Internet buffering and latency from a public KiwiSDR are usually acceptable, as long as the PC’s absolute time is correct and drift is minimized.[web:1][web:3][web:17][web:26]

## Example: Receive‑Only JS8Call Monitor Using a Public KiwiSDR

The following is a practical, band‑agnostic example you can adapt; it assumes Windows and VB‑Audio Cable, but the steps are conceptually similar on macOS or Linux using equivalent tools.[web:6][web:16][web:17][web:20][web:32]

1. Choose a KiwiSDR and band
   - Browse the public KiwiSDR list (e.g., via the official directory) and select a receiver with good HF coverage and low noise for your target band (40 m or 20 m are good starting points).[web:3][web:6][web:14]
   - Open the Kiwi URL in your browser; you should see a waterfall and controls.

2. Tune KiwiSDR to a JS8Call calling frequency
   - Set mode to USB.
   - Enter the JS8Call dial frequency for your band (e.g., 7.078 MHz for 40 m, 14.078 MHz for 20 m).[web:1][web:2][web:5]
   - Narrow the filter to ~2–3 kHz around the JS8Call sub‑band if the UI allows, centering the passband where JS8 signals appear.

3. Install and configure a virtual audio cable
   - Install VB‑Audio Virtual Cable and confirm that “Cable Input” and “Cable Output” show up as audio devices.[web:16][web:17][web:22][web:29]
   - In the browser/OS sound settings, set the KiwiSDR audio output or system default playback device to Cable Input (VB‑Audio Virtual Cable) instead of speakers.[web:17][web:35]

4. Install JS8Call and set up receive‑only operation
   - Install JS8Call from the official site and run the initial setup wizard.[web:23][web:33]
   - In Settings → Radio:
     - Set Rig to None (no CAT control), and ensure PTT/transmit options are disabled for a pure RX‑only configuration.[web:17][web:19]
   - In Settings → Audio:
     - Set Input to Cable Output (VB‑Audio Virtual Cable) so JS8Call hears the KiwiSDR audio.
     - Optionally set Output to normal speakers if you want to monitor, or leave it disabled.

5. Verify levels and timing
   - Confirm that the JS8Call input level meter sits in the green region (around −50 dB when no signals are present is commonly suggested in community advice).[web:19][web:21]
   - Use a time‑sync tool (e.g., BktTimeSync on Windows) to align your PC’s clock with an NTP server, and verify that JS8Call’s timing error indicator (if used) is small.[web:17][web:19][web:20]

6. Start decoding
   - With the KiwiSDR tuned to the JS8Call calling frequency and audio routed via the virtual cable, JS8Call’s waterfall should begin showing narrow JS8 traces around the usual audio offset region (e.g., 1500 Hz).[web:1][web:16][web:17]
   - After a few frames, you should see decoded heartbeats, CQs, and messages in the main decoded‑text window; 40 m at night and 20 m during the day increase your odds of seeing activity.[web:14][web:19][web:26]

7. Operational notes
   - This configuration is receive‑only; KiwiSDR cannot transmit, and you should keep JS8Call’s TX disabled to avoid any confusion about your operational status.[web:3][web:6][web:17]
   - If you later add a separate remotely controlled HF transmitter, you can conceptually use the KiwiSDR as a remote receiver while keying your own rig for JS8Call transmissions, but that introduces additional timing, legal, and configuration complexities beyond a simple RX monitor.

## Practical Limitations and Etiquette

When using public KiwiSDRs for JS8Call decoding, several practical considerations apply:[web:3][web:6][web:17][web:22][web:32]

- Connection limits: Many Kiwi SDRs allow only a small number of concurrent users; long‑running JS8 monitoring sessions should respect the owner’s policies and any connection‑time limits.
- Audio quality: Some servers may use lower sample rates or compression that can slightly degrade weak‑signal decodability, though JS8’s robustness generally tolerates modest degradation.[web:1][web:3][web:26]
- Latency: Excessive network delay or jitter can prevent successful decodes, especially if combined with poor local timekeeping; testing with FT8 via the same path is a good sanity‑check before committing to JS8.[web:3][web:32][web:33]
- Legal and band‑plan compliance: Even in receive‑only configurations, you should remain aware of local regulations and band plans—particularly if you later pair the setup with a remote transmitter or use non‑standard bands such as 60 m or 11 m.[web:1][web:24][web:8]

JS8Call’s default frequency list intentionally omits some bands (e.g., 2200 m, 630 m, and 60 m) because they have complicated, jurisdiction‑specific rules; operators are expected to research and choose appropriate channels when experimenting there.[web:1][web:5][web:8]

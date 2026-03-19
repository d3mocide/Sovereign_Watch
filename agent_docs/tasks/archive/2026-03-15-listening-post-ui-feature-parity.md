# 2026-03-15 — Listening Post UI & Backend Feature Parity

## Issue

After the KiwiSDR client compatibility fixes, six new `kiwi_client.py` methods
(`set_notch`, `set_noise_reduction`, `set_noise_filter`, `set_rf_attn`, `set_cmap`,
`set_aperture`) had no corresponding server action handlers in `server.py` and no
UI controls in `ListeningPost.tsx`. Additionally, the mode selector covered only 9 of
the 18 demodulation modes now supported by the backend.

---

## Gaps Found (Pre-fix)

### server.py — Missing action handlers (new kiwi_client methods unwired)

| Action (missing) | Calls |
|-----------------|-------|
| `SET_NOTCH` | `_kiwi_native.set_notch()` |
| `SET_NR` | `_kiwi_native.set_noise_reduction()` |
| `SET_NF` | `_kiwi_native.set_noise_filter()` |
| `SET_RF_ATTN` | `_kiwi_native.set_rf_attn()` |
| `SET_CMAP` | `_kiwi_native.set_cmap()` |
| `SET_APERTURE` | `_kiwi_native.set_aperture()` |

### ListeningPost.tsx — Missing UI controls

- No notch filter section (enable toggle, frequency slider, BW slider)
- No NR / NF noise processing toggles
- No RF attenuator preset selector
- No waterfall colour map picker
- No waterfall aperture toggle

### Mode selector gap

UI had 9 modes: `usb, lsb, am, amn, sam, cw, cwn, nbfm, iq`

Missing modes now supported by backend:
- `amw` (AM wideband / broadcast) — most useful for BCB
- `drm` (Digital Radio Mondiale) — European digital shortwave
- Also available but not added (too niche for default UI): `amn`, `usn`, `lsn`, `cwn`, `nnfm`, `sau`, `sal`, `sas`, `qam`

### Confirmed already wired (no change needed)

| Action | Backend method | UI control |
|--------|---------------|------------|
| SET_KIWI | connect / tune | Node browser + tune bar |
| SET_AGC | set_agc() | AGC/MAN toggle + gain slider |
| SET_NOISE_BLANKER | set_noise_blanker() | NB toggle + gate + threshold |
| SET_DE_EMP | set_de_emp() | De-emphasis 3-button selector |
| SET_ZOOM | set_zoom() | Spectral zoom +/- buttons |
| SET_SQUELCH | set_squelch() | SQL slider + hysteresis |
| DISCONNECT_KIWI | disconnect() | Disconnect button |

---

## Solution

### server.py — Added 6 new action handlers

All handlers follow the existing guard pattern:
```python
if not KIWI_USE_SUBPROCESS and _HAS_NATIVE_KIWI and _kiwi_native:
    await _kiwi_native.<method>(...)
```

- **SET_NOTCH** — `enabled`, `freq_hz` (0–∞), `bw_hz` (10–3000)
- **SET_NR** — `enabled`, `param` (0 = default algorithm)
- **SET_NF** — `enabled`, `param`
- **SET_RF_ATTN** — `db` (clamped -60–0, typical -30/-20/-10/0)
- **SET_CMAP** — `index` (0–11, clamped)
- **SET_APERTURE** — `auto` (bool), `algo`, `param`

### ListeningPost.tsx — Added controls and modes

**Modes expanded** (9 → 11):
- Added `amw` (AM Wideband, ±8 kHz passband) for broadcast monitoring
- Added `drm` (Digital Radio Mondiale, ±5 kHz passband)
- Added `WF_CMAPS` constant array with labels and index values

**State variables added:**
```typescript
const [notchEnabled, setNotchEnabled] = useState(false);
const [notchFreq,    setNotchFreq]    = useState(1000);
const [notchBw,      setNotchBw]      = useState(100);
const [nrEnabled, setNrEnabled] = useState(false);
const [nfEnabled, setNfEnabled] = useState(false);
const [rfAttn,    setRfAttn]    = useState(0);
const [wfCmap,    setWfCmap]    = useState(0);
const [wfAperture, setWfAperture] = useState(true);
```

**Right sidebar sections added** (inserted after De-emphasis):

1. **Notch Filter** — ON/OFF toggle + Freq slider (100–4000 Hz) + BW slider (25–500 Hz)
   → Dispatches `SET_NOTCH` live when sliders move while enabled

2. **Noise Processing** — NR and NF toggle buttons side-by-side
   → Dispatches `SET_NR` / `SET_NF` on click

3. **RF Attenuator** — 4-button preset: 0 dB (BYPASS) / -10 / -20 / -30
   → Dispatches `SET_RF_ATTN` on click; highlights active level
   → Useful when ADC_OVFL alert fires

4. **WF Colour Map** — 3×2 grid of preset buttons: Kiwi / CSDR / Grey / Linear / Turbo / SdrDx
   → Dispatches `SET_CMAP` to server → KiwiSDR W/F stream

5. **WF Aperture** — AUTO / MAN toggle
   → Dispatches `SET_APERTURE` with `auto: true/false`

---

## Changes

| File | Change |
|------|--------|
| `js8call/server.py` | Added 6 action handlers: SET_NOTCH, SET_NR, SET_NF, SET_RF_ATTN, SET_CMAP, SET_APERTURE |
| `frontend/src/components/js8call/ListeningPost.tsx` | Expanded KIWI_MODES (9→11), added WF_CMAPS constant, 8 new state vars, 5 new UI control sections |

---

## Verification

```
js8call/tests/test_kiwi_compatibility.py   23 passed
js8call/tests/test_kiwi_debounce.py         4 passed
```

server.py: `python -m py_compile` passes.

Frontend: `node_modules` not installed on host (Docker-only build) so ESLint/tsc
unavailable; TypeScript patterns match existing component code verbatim.

---

## Complete UI→Backend→KiwiSDR Signal Path (Post-fix)

```
ListeningPost.tsx (React)
  sendAction({ action: 'SET_NOTCH', enabled, freq_hz, bw_hz })
    ↓ WebSocket /ws/js8
server.py SET_NOTCH handler
    ↓ await _kiwi_native.set_notch(enabled, freq_hz, bw_hz)
kiwi_client.py set_notch() [debounced 0.3s]
    ↓ ws.send("SET notch=1 freq=1000.0 bw=100.0")
KiwiSDR DSP — narrow notch applied in signal chain
```

Same path for NR, NF, RF attn, cmap, aperture.

## Benefits

- Full end-to-end wiring: every DSP capability in kiwi_client.py now reachable
  from the browser UI
- Notch filter removes heterodyne interference without operator mode change
- NR/NF toggles reduce noise on weak signals
- RF attn selector provides a one-click fix for ADC overload events
- 11-mode selector covers all practical HF demodulation needs
- Waterfall colour map lets operator optimise contrast for their environment
- Waterfall aperture auto-centres the dynamic range on the signal floor

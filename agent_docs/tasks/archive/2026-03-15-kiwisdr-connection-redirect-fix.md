# 2026-03-15 — KiwiSDR Client Compatibility & Feature Parity

## Issue

Review of `kiwi-arc.md` (official KiwiSDR protocol reference based on the upstream
git repo) against our custom `js8call/kiwi_client.py` revealed several incompatibilities
and missing features that could cause connection failures on modern KiwiSDR nodes and limit
the receiver's DSP capabilities.

---

## Findings

### Critical Bugs

| # | Issue | Details |
|---|-------|---------|
| 1 | **Wrong WebSocket URL format** | We used `ws://host:port/<ts>/SND`. Modern KiwiSDR (v1.550+) requires `ws://host:port/ws/kiwi/<ts>/SND`. Connection would fail silently on all newer nodes. |
| 2 | **Plaintext password auth** | We sent `SET auth t=kiwi p=<plaintext>`. The current protocol requires `SET auth t=kiwi pwd=<md5(password)>` for password-protected nodes. Open nodes (empty password) were unaffected. |
| 3 | **Only 5 of 18 demod modes** | `MODE_FILTERS` covered only `usb, lsb, am, cw, nbfm`. The official protocol supports 18 modes including `amn`, `amw`, `usn`, `lsn`, `cwn`, `nnfm`, `iq`, `drm`, `sam`, `sau`, `sal`, `sas`, `qam`. Requests for unsupported modes fell through to a generic `(-5000, 5000)` passband. |

### Missing DSP Commands

| Missing Method | KiwiSDR Command |
|---------------|-----------------|
| `set_notch()` | `SET notch=<0\|1> freq=<hz> bw=<hz>` |
| `set_noise_reduction()` | `SET nr=<0\|1> param=<n>` |
| `set_noise_filter()` | `SET nf=<0\|1> param=<n>` |
| `set_rf_attn()` | `SET rf_attn=<dB>` |
| `set_passband()` | `SET passband=<low_hz> <high_hz>` |
| `set_mute()` | `SET mute` |

### Missing Waterfall Controls

| Missing Method | KiwiSDR Command |
|---------------|-----------------|
| `set_cmap()` | `SET cmap=<0-11>` (colour map index) |
| `set_aperture()` | `SET aper=<0\|1> algo=<n> param=<n>` |

### Confirmed Correct (No Change Needed)

- **S-meter encoding**: Our formula `rssi = 0.1 * smeter_uint16 - 127.0` matches the actual KiwiSDR server source. The `kiwisdr-architecture.md` reference description of signed int16 dBm×10 is incorrect.
- **SND frame magic**: `b"SND"` is correct. The `kiwi-arc.md` "AUD" label for compressed frames is a documentation abstraction, not the actual wire bytes.
- **Keepalive cadence**: 5 seconds is correct.
- **SET AR OK**: Required to start audio stream — our implementation is correct.
- **Waterfall frame format**: 16-byte header before pixel data — our parser is correct.
- **ADC overflow flag, RSSI decimation, squelch hysteresis, command debouncing**: All correct and ahead of the reference implementation.

---

## Solution

### 1. Dual URL format with automatic fallback

Added `_WS_PATH_TEMPLATES` list:

```python
_WS_PATH_TEMPLATES = [
    "ws://{host}:{port}/ws/kiwi/{ts}/{stream}",   # modern (v1.550+)
    "ws://{host}:{port}/{ts}/{stream}",            # legacy
]
```

`connect()` and `_start_waterfall()` now iterate this list and use the first
format that succeeds. Removed the convoluted aiohttp HTTP-redirect pre-check
(which could not detect WS-level failures) in favour of direct WebSocket
connection attempts.

### 2. MD5 password auth via `_make_auth_cmd()`

```python
def _make_auth_cmd(password: str) -> str:
    if not password:
        return "SET auth t=kiwi p="          # open node — all versions accept this
    md5 = hashlib.md5(password.encode()).hexdigest()
    return f"SET auth t=kiwi pwd={md5}"      # password-protected nodes
```

### 3. Full MODE_FILTERS — all 18 official modes

Expanded from 5 to 18 modes including all AM variants, narrow modes, sync AM
family, IQ, DRM, and QAM with correct passband values.

### 4. New DSP methods (all debounced)

- `set_notch(enabled, freq_hz, bw_hz)` — narrow interferer notch filter
- `set_noise_reduction(enabled, param)` — NR algorithm
- `set_noise_filter(enabled, param)` — NF algorithm
- `set_rf_attn(db)` — front-end attenuator (useful when ADC overload fires)
- `set_passband(low_hz, high_hz)` — passband-only adjustment
- `set_mute()` — toggle server-side mute

### 5. New waterfall controls (both debounced)

- `set_cmap(index)` — colour map 0–11 (0=Kiwi default, 4=Turbo, etc.)
- `set_aperture(auto, algo, param)` — dynamic range centering

### 6. Housekeeping

- `SET ident_user=SovereignWatch` (was `js8bridge`) — correct project identity
- Added `hashlib` import

---

## Changes

| File | Change |
|------|--------|
| `js8call/kiwi_client.py` | All fixes above |
| `js8call/tests/test_kiwi_compatibility.py` | **New** — 23 tests covering auth, modes, URL templates, new DSP methods, waterfall controls |

---

## Verification

```
js8call/tests/test_kiwi_compatibility.py   23 passed
js8call/tests/test_kiwi_debounce.py         4 passed
```

Pre-existing failures in `test_json.py` (live network, HTTP 403) and
`test_ws.py` (missing `pytest-asyncio`) are unrelated to this change.

---

## Benefits

- Connects to all modern KiwiSDR nodes (v1.550+) that use the `/ws/kiwi/` path
- Correctly authenticates to password-protected nodes via MD5 hash
- Full demodulation mode coverage — no more silent passband fallback for DRM, IQ, sync AM, etc.
- Complete DSP toolbox matching the official KiwiSDR protocol: notch, NR, NF, RF attn, passband, mute
- Waterfall colour map and aperture control for richer UI integration
- All new methods are debounced, consistent with existing command patterns

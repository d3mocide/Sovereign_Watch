"""
test_kiwi_compatibility.py — Tests covering KiwiSDR protocol compatibility fixes.

Tests:
  - MD5 auth command generation (_make_auth_cmd)
  - MODE_FILTERS completeness (all 18 official modes present)
  - New DSP methods: notch, NR, noise filter, RF attn, passband, mute
  - New waterfall controls: cmap, aperture
  - URL path template list (both modern and legacy formats present)
"""

import asyncio
import sys
import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.append(os.path.join(os.getcwd(), "js8call"))
from kiwi_client import (
    KiwiClient,
    MODE_FILTERS,
    _WS_PATH_TEMPLATES,
    _make_auth_cmd,
)


# ---------------------------------------------------------------------------
# _make_auth_cmd
# ---------------------------------------------------------------------------

class TestMakeAuthCmd(unittest.TestCase):
    def test_open_node_uses_legacy_p_form(self):
        cmd = _make_auth_cmd("")
        self.assertEqual(cmd, "SET auth t=kiwi p=")

    def test_password_uses_md5_pwd_form(self):
        cmd = _make_auth_cmd("secret")
        # Must start with modern prefix and contain 32-char hex MD5
        self.assertTrue(cmd.startswith("SET auth t=kiwi pwd="), cmd)
        md5_part = cmd.split("pwd=")[1]
        self.assertEqual(len(md5_part), 32)
        self.assertTrue(all(c in "0123456789abcdef" for c in md5_part), md5_part)

    def test_known_md5_value(self):
        import hashlib
        pw = "kiwi"
        expected = hashlib.md5(pw.encode()).hexdigest()
        cmd = _make_auth_cmd(pw)
        self.assertIn(expected, cmd)


# ---------------------------------------------------------------------------
# MODE_FILTERS completeness
# ---------------------------------------------------------------------------

class TestModeFilters(unittest.TestCase):
    # All modes listed in kiwi.js:103 modes_lc[]
    OFFICIAL_MODES = {
        "am", "amn", "amw",
        "usb", "lsb", "usn", "lsn",
        "cw", "cwn",
        "nbfm", "nnfm",
        "iq", "drm", "qam",
        "sam", "sau", "sal", "sas",
    }

    def test_all_official_modes_present(self):
        missing = self.OFFICIAL_MODES - set(MODE_FILTERS.keys())
        self.assertEqual(missing, set(), f"Missing modes: {missing}")

    def test_filter_tuples_are_valid(self):
        for mode, (lo, hi) in MODE_FILTERS.items():
            self.assertIsInstance(lo, int, f"{mode}: low_cut must be int")
            self.assertIsInstance(hi, int, f"{mode}: high_cut must be int")
            self.assertLess(lo, hi, f"{mode}: low_cut must be < high_cut")

    def test_usb_passband_is_correct(self):
        lo, hi = MODE_FILTERS["usb"]
        self.assertGreater(lo, 0, "USB low_cut should be positive (above carrier)")
        self.assertGreater(hi, lo)

    def test_lsb_passband_is_correct(self):
        lo, hi = MODE_FILTERS["lsb"]
        self.assertLess(lo, 0, "LSB low_cut should be negative (below carrier)")
        self.assertLess(hi, 0, "LSB high_cut should be negative (below carrier)")


# ---------------------------------------------------------------------------
# URL path templates
# ---------------------------------------------------------------------------

class TestUrlTemplates(unittest.TestCase):
    def test_modern_format_is_first(self):
        first = _WS_PATH_TEMPLATES[0]
        self.assertIn("/ws/kiwi/", first, "Modern format should use /ws/kiwi/ path")

    def test_legacy_format_is_present(self):
        legacy = [t for t in _WS_PATH_TEMPLATES if "/ws/kiwi/" not in t]
        self.assertTrue(legacy, "Legacy /<ts>/SND format must be present")

    def test_templates_contain_placeholders(self):
        for t in _WS_PATH_TEMPLATES:
            self.assertIn("{host}", t)
            self.assertIn("{port}", t)
            self.assertIn("{ts}", t)
            self.assertIn("{stream}", t)

    def test_templates_render_snd(self):
        for t in _WS_PATH_TEMPLATES:
            rendered = t.format(host="example.com", port=8073, ts=1000, stream="SND")
            self.assertIn("SND", rendered)
            self.assertIn("example.com", rendered)
            self.assertIn("8073", rendered)


# ---------------------------------------------------------------------------
# New DSP methods
# ---------------------------------------------------------------------------

class TestNewDspMethods(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = KiwiClient(on_audio=MagicMock(), on_status=MagicMock())
        self.client._ws = AsyncMock()

    async def _run_with_connected(self, coro):
        with patch.object(KiwiClient, "is_connected", new_callable=unittest.mock.PropertyMock) as m:
            m.return_value = True
            await coro

    async def test_set_notch_enabled(self):
        async def _go():
            await self.client.set_notch(True, freq_hz=1000.0, bw_hz=100.0)
            await asyncio.sleep(0.5)
            args = self.client._ws.send.call_args[0][0]
            self.assertIn("notch=1", args)
            self.assertIn("freq=1000.0", args)
            self.assertIn("bw=100.0", args)
        await self._run_with_connected(_go())

    async def test_set_notch_disabled(self):
        async def _go():
            await self.client.set_notch(False)
            await asyncio.sleep(0.5)
            args = self.client._ws.send.call_args[0][0]
            self.assertIn("notch=0", args)
        await self._run_with_connected(_go())

    async def test_set_noise_reduction_enabled(self):
        async def _go():
            await self.client.set_noise_reduction(True, param=2)
            await asyncio.sleep(0.5)
            args = self.client._ws.send.call_args[0][0]
            self.assertIn("nr=1", args)
            self.assertIn("param=2", args)
        await self._run_with_connected(_go())

    async def test_set_noise_filter_disabled(self):
        async def _go():
            await self.client.set_noise_filter(False)
            await asyncio.sleep(0.5)
            args = self.client._ws.send.call_args[0][0]
            self.assertIn("nf=0", args)
        await self._run_with_connected(_go())

    async def test_set_rf_attn(self):
        async def _go():
            await self.client.set_rf_attn(-20)
            await asyncio.sleep(0.5)
            args = self.client._ws.send.call_args[0][0]
            self.assertIn("rf_attn=-20", args)
        await self._run_with_connected(_go())

    async def test_set_passband(self):
        async def _go():
            await self.client.set_passband(300, 2700)
            await asyncio.sleep(0.4)
            args = self.client._ws.send.call_args[0][0]
            self.assertIn("passband=300 2700", args)
        await self._run_with_connected(_go())

    async def test_set_mute_sends_command(self):
        async def _go():
            await self.client.set_mute()
            self.client._ws.send.assert_called_once_with("SET mute")
        await self._run_with_connected(_go())


# ---------------------------------------------------------------------------
# Waterfall controls
# ---------------------------------------------------------------------------

class TestWaterfallControls(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = KiwiClient(on_audio=MagicMock(), on_status=MagicMock())
        self.client._ws    = AsyncMock()
        self.client._wf_ws = AsyncMock()

    async def test_set_cmap(self):
        with patch.object(KiwiClient, "is_connected", new_callable=unittest.mock.PropertyMock) as m:
            m.return_value = True
            await self.client.set_cmap(4)
            await asyncio.sleep(0.4)
            args = self.client._wf_ws.send.call_args[0][0]
            self.assertIn("cmap=4", args)

    async def test_set_cmap_clamps_to_range(self):
        with patch.object(KiwiClient, "is_connected", new_callable=unittest.mock.PropertyMock) as m:
            m.return_value = True
            await self.client.set_cmap(99)
            await asyncio.sleep(0.4)
            args = self.client._wf_ws.send.call_args[0][0]
            self.assertIn("cmap=11", args)

    async def test_set_aperture_auto(self):
        with patch.object(KiwiClient, "is_connected", new_callable=unittest.mock.PropertyMock) as m:
            m.return_value = True
            await self.client.set_aperture(True, algo=1, param=5)
            await asyncio.sleep(0.5)
            args = self.client._wf_ws.send.call_args[0][0]
            self.assertIn("aper=1", args)
            self.assertIn("algo=1", args)
            self.assertIn("param=5", args)

    async def test_set_aperture_manual(self):
        with patch.object(KiwiClient, "is_connected", new_callable=unittest.mock.PropertyMock) as m:
            m.return_value = True
            await self.client.set_aperture(False)
            await asyncio.sleep(0.5)
            args = self.client._wf_ws.send.call_args[0][0]
            self.assertIn("aper=0", args)

    async def test_set_cmap_no_wf_ws_is_noop(self):
        """set_cmap should silently do nothing if waterfall is not active."""
        self.client._wf_ws = None
        with patch.object(KiwiClient, "is_connected", new_callable=unittest.mock.PropertyMock) as m:
            m.return_value = True
            # Should not raise
            await self.client.set_cmap(3)
            await asyncio.sleep(0.4)


if __name__ == "__main__":
    unittest.main()

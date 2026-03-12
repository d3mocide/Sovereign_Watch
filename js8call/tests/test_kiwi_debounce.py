import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
import sys
import os

# Ensure we can import kiwi_client
sys.path.append(os.path.join(os.getcwd(), "js8call"))
from kiwi_client import KiwiClient

class TestKiwiDebounce(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.on_audio = MagicMock()
        self.on_status = MagicMock()
        self.client = KiwiClient(on_audio=self.on_audio, on_status=self.on_status)
        self.client._ws = AsyncMock()
        # Mock is_connected to return True
        # Note: KiwiClient.is_connected uses _ws.open or _ws.state, but we can set it via property mock if needed
        # Actually _ws is an AsyncMock, so we can just mock the property if it's accessed.
        # But wait, is_connected is a property.
        
    async def test_tune_debounce(self):
        # Mocking is_connected property
        with patch.object(KiwiClient, 'is_connected', new_callable=unittest.mock.PropertyMock) as mock_connected:
            mock_connected.return_value = True
            
            # Send 3 tune commands rapidly
            await self.client.tune(14074.0, "usb")
            await self.client.tune(14075.0, "usb")
            await self.client.tune(14076.0, "usb")
            
            # Tasks should be scheduled but not executed yet
            self.assertEqual(len(self.client._command_tasks), 1)
            self.client._ws.send.assert_not_called()
            
            # Wait for debounce (0.5s + small margin)
            await asyncio.sleep(0.7)
            
            # Should have been called exactly once (the last one)
            # _send_mod sends "SET mod=usb low_cut=300 high_cut=2700 freq=14076.000"
            self.client._ws.send.assert_called_once()
            args = self.client._ws.send.call_args[0][0]
            self.assertIn("freq=14076.000", args)
            
            # Task should be removed
            self.assertEqual(len(self.client._command_tasks), 0)

    async def test_agc_debounce(self):
        with patch.object(KiwiClient, 'is_connected', new_callable=unittest.mock.PropertyMock) as mock_connected:
            mock_connected.return_value = True
            
            await self.client.set_agc(True, 50)
            await self.client.set_agc(True, 60)
            await self.client.set_agc(True, 70)
            
            await asyncio.sleep(0.7)
            
            self.client._ws.send.assert_called_once()
            args = self.client._ws.send.call_args[0][0]
            self.assertIn("manGain=70", args)

    async def test_squelch_debounce(self):
        with patch.object(KiwiClient, 'is_connected', new_callable=unittest.mock.PropertyMock) as mock_connected:
            mock_connected.return_value = True
            
            await self.client.set_squelch(True, 50)
            await self.client.set_squelch(True, 60)
            await self.client.set_squelch(True, 70)
            
            await asyncio.sleep(0.7)
            
            self.client._ws.send.assert_called_once()
            args = self.client._ws.send.call_args[0][0]
            self.assertIn("max=70", args)

if __name__ == "__main__":
    unittest.main()

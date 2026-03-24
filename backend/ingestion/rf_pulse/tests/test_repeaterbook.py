"""Legacy placeholder for repeaterbook tests.

The RepeaterBook source module was removed from the RF poller and replaced by
the RadioReference adapter. Keep this file as an explicit skip so historical
references do not break test collection.
"""

import pytest


@pytest.mark.skip(reason="RepeaterBook source removed; migrate coverage to sources/radioref.py")
def test_repeaterbook_legacy_placeholder():
    assert True

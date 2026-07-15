"""Unit tests for the semantic cache scope guard.

Prompts for adjacent H3 regions are near-identical, so embedding similarity
alone would serve one region's cached assessment for its neighbor.  The
scope guard must treat a scope mismatch as a cache miss.
"""

import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.semantic_cache import SovereignSemanticCache  # noqa: E402


def _wrap(scope, response):
    return json.dumps({"scope": scope, "response": response})


class TestUnwrap:
    def test_matching_scope_returns_response(self):
        stored = _wrap("871f24ac9ffffff", "assessment-A")
        assert (
            SovereignSemanticCache._unwrap(stored, "871f24ac9ffffff")
            == "assessment-A"
        )

    def test_mismatched_scope_is_a_miss(self):
        stored = _wrap("871f24ac9ffffff", "assessment-A")
        assert SovereignSemanticCache._unwrap(stored, "871f24acbffffff") is None

    def test_none_scope_matches_none(self):
        stored = _wrap(None, "assessment-A")
        assert SovereignSemanticCache._unwrap(stored, None) == "assessment-A"

    def test_legacy_plain_string_served_only_without_scope(self):
        assert SovereignSemanticCache._unwrap("legacy-response", None) == "legacy-response"
        assert SovereignSemanticCache._unwrap("legacy-response", "871f24ac9ffffff") is None

    def test_none_stored_is_a_miss(self):
        assert SovereignSemanticCache._unwrap(None, "any") is None

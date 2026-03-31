"""
Test configuration for the JS8Call bridge.

Adds the js8call package directory to sys.path so that bare-module imports
like `from kiwi_client import ...` resolve correctly regardless of the
working directory pytest is invoked from (repo root or js8call/).

The individual test files also attempt their own sys.path manipulation via
os.getcwd(), which is cwd-sensitive; this conftest takes precedence because
pytest loads it before collecting test modules.
"""
import os
import sys

_TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
_JS8CALL_DIR = os.path.dirname(_TESTS_DIR)

if _JS8CALL_DIR not in sys.path:
    sys.path.insert(0, _JS8CALL_DIR)

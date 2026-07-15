"""Tests for AIService LiteLLM Router wiring.

router_settings.fallbacks in litellm_config.yaml were previously dead
configuration: AIService called acompletion() directly, which never consults
router settings.  These tests verify the Router is built from the config with
unavailable models filtered out, and that completions route through it.
"""

from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from .test_stubs import install_common_test_stubs  # noqa: E402

install_common_test_stubs()

import services.ai_service as ai_service_mod  # noqa: E402


_CONFIG_YAML = """
model_list:
  - model_name: primary
    litellm_params:
      model: os.environ/TEST_PRIMARY_MODEL
      api_key: os.environ/TEST_PRIMARY_KEY

  - model_name: backup
    litellm_params:
      model: os.environ/TEST_BACKUP_MODEL
      api_key: os.environ/TEST_BACKUP_KEY

  - model_name: ghost
    litellm_params:
      model: os.environ/TEST_GHOST_MODEL
      api_key: os.environ/TEST_GHOST_KEY

litellm_settings:
  drop_params: true
  callbacks: ["presidio"]

router_settings:
  fallbacks:
    - primary: ["ghost", "backup"]
    - ghost: ["backup"]
    - backup: []
"""

_ENV = {
    "TEST_PRIMARY_MODEL": "openai/primary-model",
    "TEST_PRIMARY_KEY": "pk",
    "TEST_BACKUP_MODEL": "openai/backup-model",
    "TEST_BACKUP_KEY": "bk",
    # TEST_GHOST_* intentionally unset → 'ghost' must be disabled
}


def _make_service(tmp_path):
    config_path = tmp_path / "litellm_config.yaml"
    config_path.write_text(_CONFIG_YAML)

    router_cls = MagicMock(name="Router")
    with (
        patch.object(ai_service_mod, "_LITELLM_CONFIG_PATH", str(config_path)),
        patch.dict(os.environ, _ENV, clear=False),
        patch.object(ai_service_mod, "Router", router_cls),
    ):
        service = ai_service_mod.AIService()
    return service, router_cls


def test_router_built_with_available_models_and_filtered_fallbacks(tmp_path):
    service, router_cls = _make_service(tmp_path)

    # ghost has unset env vars → excluded from the model map entirely
    assert set(service.model_map) == {"primary", "backup"}
    assert service.model_map["primary"]["model"] == "openai/primary-model"

    router_cls.assert_called_once()
    kwargs = router_cls.call_args.kwargs
    model_names = {m["model_name"] for m in kwargs["model_list"]}
    assert model_names == {"primary", "backup"}

    # ghost dropped from primary's chain; ghost-primary entry dropped;
    # empty backup entry (fail-closed default) dropped.
    assert kwargs["fallbacks"] == [{"primary": ["backup"]}]
    assert service.router is router_cls.return_value


@pytest.mark.asyncio
async def test_completion_routes_through_router_for_managed_models(tmp_path):
    service, router_cls = _make_service(tmp_path)
    service.router.acompletion = AsyncMock(return_value="router-response")

    with patch.object(service, "get_active_model", AsyncMock(return_value="primary")):
        result = await service._acompletion(messages=[{"role": "user", "content": "hi"}])

    assert result == "router-response"
    assert service.router.acompletion.await_args.kwargs["model"] == "primary"


@pytest.mark.asyncio
async def test_unmanaged_model_falls_back_to_direct_completion(tmp_path):
    service, _ = _make_service(tmp_path)

    direct = AsyncMock(return_value="direct-response")
    with (
        patch.object(service, "get_active_model", AsyncMock(return_value="custom-model")),
        patch.object(ai_service_mod, "acompletion", direct),
    ):
        result = await service._acompletion(messages=[{"role": "user", "content": "hi"}])

    assert result == "direct-response"
    assert direct.await_args.kwargs["model"] == "custom-model"

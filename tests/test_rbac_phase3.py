import pytest
from fastapi.testclient import TestClient
import sys
import os

# Add backend/api to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "api")))

from main import app
from core.auth import create_access_token

client = TestClient(app)

def get_token(role: str):
    return create_access_token(data={"sub": f"test_{role}", "role": role})

def test_ai_analyze_rbac():
    # Viewer should be forbidden
    token = get_token("viewer")
    response = client.post(
        "/api/analyze/test-uid",
        headers={"Authorization": f"Bearer {token}"},
        json={"lookback_hours": 1}
    )
    assert response.status_code == 403
    assert "Insufficient permissions" in response.json()["detail"]

    # Operator should be allowed (will probably return 404 or something if uid is fake, but not 403)
    token = get_token("operator")
    response = client.post(
        "/api/analyze/test-uid",
        headers={"Authorization": f"Bearer {token}"},
        json={"lookback_hours": 1}
    )
    assert response.status_code != 403

def test_ai_config_rbac():
    # Operator should be forbidden (admin only)
    token = get_token("operator")
    response = client.post(
        "/api/config/ai",
        headers={"Authorization": f"Bearer {token}"},
        json={"model_id": "secure-core"}
    )
    assert response.status_code == 403
    assert "Insufficient permissions" in response.json()["detail"]

    # Admin should be allowed
    token = get_token("admin")
    response = client.post(
        "/api/config/ai",
        headers={"Authorization": f"Bearer {token}"},
        json={"model_id": "secure-core"}
    )
    assert response.status_code != 403

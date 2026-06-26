from fastapi.testclient import TestClient

import app.api.routes as routes
from app.config import ensure_user_dirs, settings
from app.main import app


def _client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_path", tmp_path)
    monkeypatch.setattr(routes.settings, "storage_path", tmp_path)
    routes._store_cache.clear()
    ensure_user_dirs(tmp_path / "default")
    return TestClient(app)


def test_create_tool_persists_with_thumbnail(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)

    resp = client.post("/api/tools", json={
        "name": "Refill case",
        "points": [
            {"x": -10, "y": -5},
            {"x": 10, "y": -5},
            {"x": 10, "y": 5},
            {"x": -10, "y": 5},
        ],
    })

    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Refill case"
    assert data["source_image_path"] is None
    assert data["smoothed"] is False
    assert data["thumbnail_path"] is not None

    _, tools, _ = routes.get_stores("default")
    assert tools.get(data["id"]) is not None


def test_create_tool_rejects_too_few_points(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)

    resp = client.post("/api/tools", json={
        "name": "bad",
        "points": [{"x": 0, "y": 0}, {"x": 1, "y": 1}],
    })

    assert resp.status_code == 400

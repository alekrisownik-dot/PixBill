import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PIXBILL_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PIXBILL_PASSWORD", "tajne")
    from app import config, db

    config.get_settings.cache_clear()
    db.reset_engine()
    from app.main import app

    with TestClient(app) as c:
        assert c.post("/api/login", json={"password": "tajne"}).status_code == 204
        yield c
    db.reset_engine()
    config.get_settings.cache_clear()

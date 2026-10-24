import io
from datetime import datetime, timedelta, timezone

from PIL import Image

from app.ocr import ollama


def jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 80), "white").save(buf, format="JPEG")
    return buf.getvalue()


def first_category(client) -> int:
    return client.get("/api/categories").json()[0]["id"]


def test_requires_login(client):
    client.post("/api/logout")
    assert client.get("/api/categories").status_code == 401
    assert client.post("/api/login", json={"password": "zle"}).status_code == 401


def test_default_categories_seeded(client):
    names = [c["name"] for c in client.get("/api/categories").json()]
    assert "Spożywcze" in names and "Inne" in names


def test_manual_expense_and_month_stats(client):
    cats = client.get("/api/categories").json()
    food, fuel = cats[0]["id"], cats[2]["id"]
    for amount, day, cat in [(10000, "2026-09-10", food), (15000, "2026-10-02", food), (5000, "2026-10-05", fuel)]:
        r = client.post(
            "/api/expenses",
            json={"amount_grosze": amount, "spent_on": day, "category_id": cat, "description": "test"},
        )
        assert r.status_code == 201

    assert len(client.get("/api/expenses", params={"month": "2026-10"}).json()) == 2

    summary = client.get("/api/stats/month", params={"month": "2026-10"}).json()
    assert summary["total_grosze"] == 20000
    assert summary["previous_total_grosze"] == 10000
    assert summary["change_percent"] == 100.0
    food_stat = next(c for c in summary["categories"] if c["category_id"] == food)
    assert food_stat["change_percent"] == 50.0
    fuel_stat = next(c for c in summary["categories"] if c["category_id"] == fuel)
    assert fuel_stat["change_percent"] is None

    trend = client.get("/api/stats/trend", params={"months": 3, "until": "2026-10"}).json()
    assert [p["total_grosze"] for p in trend] == [0, 10000, 20000]


def test_expense_rejects_unknown_category(client):
    r = client.post("/api/expenses", json={"amount_grosze": 100, "spent_on": "2026-10-01", "category_id": 999})
    assert r.status_code == 422


def test_receipt_flow_and_photo_cleanup(client, monkeypatch):
    monkeypatch.setattr(
        ollama,
        "read_receipt",
        lambda path: ({"merchant": "Biedronka", "date": "2026-10-20", "total_grosze": 4599, "items": []}, "SUMA PLN 45,99"),
    )
    r = client.post("/api/receipts", files={"file": ("p.jpg", jpeg_bytes(), "image/jpeg")})
    assert r.status_code == 201
    receipt_id = r.json()["id"]

    receipt = client.get(f"/api/receipts/{receipt_id}").json()
    assert receipt["status"] == "processed"
    assert receipt["ocr_result"]["total_grosze"] == 4599
    assert receipt["photo_delete_after"] is None
    assert client.get(f"/api/receipts/{receipt_id}/photo").status_code == 200

    r = client.post(
        f"/api/receipts/{receipt_id}/confirm",
        json={"amount_grosze": 4599, "spent_on": "2026-10-20", "category_id": first_category(client), "merchant": "Biedronka"},
    )
    assert r.status_code == 201
    assert r.json()["source"] == "receipt"

    receipt = client.get(f"/api/receipts/{receipt_id}").json()
    assert receipt["status"] == "confirmed"
    assert receipt["photo_delete_after"] is not None

    from app.cleanup import delete_expired_photos
    from app.db import new_session

    with new_session() as db:
        assert delete_expired_photos(db, datetime.now(timezone.utc) + timedelta(days=9)) == 0
        assert delete_expired_photos(db, datetime.now(timezone.utc) + timedelta(days=11)) == 1

    receipt = client.get(f"/api/receipts/{receipt_id}").json()
    assert receipt["has_photo"] is False and receipt["photo_deleted_at"] is not None
    assert client.get(f"/api/receipts/{receipt_id}/photo").status_code == 410
    assert client.get("/api/stats/month", params={"month": "2026-10"}).json()["total_grosze"] == 4599


def test_ocr_failure_marks_receipt(client, monkeypatch):
    def boom(path):
        raise ollama.OcrError("Ollama niedostępna")

    monkeypatch.setattr(ollama, "read_receipt", boom)
    r = client.post("/api/receipts", files={"file": ("p.jpg", jpeg_bytes(), "image/jpeg")})
    receipt = client.get(f"/api/receipts/{r.json()['id']}").json()
    assert receipt["status"] == "failed" and "niedostępna" in receipt["ocr_error"]


def test_normalize_ocr_output():
    out = ollama.normalize({"merchant": "Orlen", "date": "2026-10-1", "total": "123,45 PLN", "items": [{"name": "PB95", "price": 120}]})
    assert out == {"merchant": "Orlen", "date": None, "total_grosze": 12345, "items": [{"name": "PB95", "price_grosze": 12000}]}


def test_suggests_category_from_previous_merchant(client, monkeypatch):
    fuel = client.get("/api/categories").json()[2]["id"]
    client.post("/api/expenses", json={"amount_grosze": 20000, "spent_on": "2026-10-01", "category_id": fuel, "merchant": "Orlen"})
    monkeypatch.setattr(
        ollama, "read_receipt", lambda path: ({"merchant": "ORLEN", "date": None, "total_grosze": 100, "items": []}, "")
    )
    r = client.post("/api/receipts", files={"file": ("p.jpg", jpeg_bytes(), "image/jpeg")})
    assert client.get(f"/api/receipts/{r.json()['id']}").json()["ocr_result"]["suggested_category_id"] == fuel


def test_serves_mobile_app(client):
    r = client.get("/")
    assert r.status_code == 200 and "PixBill" in r.text
    assert client.get("/manifest.webmanifest").status_code == 200
    assert client.get("/api/health").json() == {"status": "ok"}

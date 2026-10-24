import base64
import io
import json
import re
from pathlib import Path

import httpx
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

from ..config import get_settings

PROMPT = """Jesteś systemem odczytu polskich paragonów fiskalnych.
Odczytaj zdjęcie paragonu i zwróć WYŁĄCZNIE JSON w formacie:
{
  "merchant": "nazwa sklepu lub null",
  "date": "RRRR-MM-DD lub null",
  "total": "suma do zapłaty jako liczba z kropką, np. 123.45, lub null",
  "items": [{"name": "nazwa pozycji", "price": 12.34}],
  "raw_text": "cały odczytany tekst paragonu"
}
W "items" wpisz każdą kupioną pozycję po kolei: nazwę tak jak na paragonie i cenę za cały wiersz
(np. "2 x 3,49 6,98" daje cenę 6.98). Pomiń literę stawki VAT po cenie. Rabat lub upust wpisz
jako osobną pozycję z ujemną ceną. Nie wpisuj do "items" sumy, podatku PTU ani reszty.
Suma to zwykle wiersz "SUMA PLN". Nie zgaduj: jeśli czegoś nie widać, wpisz null."""

MAX_SIDE = 1600

register_heif_opener()


class OcrError(Exception):
    pass


def prepare_image(path: Path) -> bytes:
    with Image.open(path) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        img.thumbnail((MAX_SIDE, MAX_SIDE))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=90)
        return buf.getvalue()


def parse_amount(value) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return round(value * 100)
    match = re.search(r"-?\d+(?:[.,]\d{1,2})?", str(value).replace(" ", ""))
    if not match:
        return None
    return round(float(match.group().replace(",", ".")) * 100)


def normalize(result: dict) -> dict:
    items = []
    for item in result.get("items") or []:
        if isinstance(item, dict) and item.get("name"):
            items.append({"name": str(item["name"]), "price_grosze": parse_amount(item.get("price"))})
    date = result.get("date")
    if not (isinstance(date, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", date)):
        date = None
    return {
        "merchant": result.get("merchant") or None,
        "date": date,
        "total_grosze": parse_amount(result.get("total")),
        "items": items,
    }


def read_receipt(path: Path) -> tuple[dict, str]:
    settings = get_settings()
    image_b64 = base64.b64encode(prepare_image(path)).decode()
    try:
        response = httpx.post(
            f"{settings.ollama_url}/api/generate",
            json={
                "model": settings.ollama_model,
                "prompt": PROMPT,
                "images": [image_b64],
                "format": "json",
                "stream": False,
                "options": {"temperature": 0},
            },
            timeout=settings.ollama_timeout_seconds,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise OcrError(f"Ollama niedostępna: {exc}") from exc

    text = response.json().get("response", "")
    try:
        result = json.loads(text)
    except json.JSONDecodeError as exc:
        raise OcrError(f"Model nie zwrócił poprawnego JSON: {text[:200]}") from exc
    return normalize(result), str(result.get("raw_text") or "")

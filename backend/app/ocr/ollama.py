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
  "items": [{"name": "nazwa pozycji", "price": 12.34}]
}
W "items" wpisz każdą kupioną pozycję po kolei: nazwę tak jak na paragonie i cenę za cały wiersz
(np. "2 x 3,49 6,98" daje cenę 6.98). Pomiń literę stawki VAT po cenie. Rabat lub upust wpisz
jako osobną pozycję z ujemną ceną. Kaucję za butelki lub puszki wpisz jako osobną pozycję z nazwą zawierającą słowo "kaucja". Nie wpisuj do "items" sumy, podatku PTU ani reszty.
Każdy wiersz paragonu wpisz do "items" tylko raz i zakończ listę na ostatniej pozycji przed sumą.
Suma to zwykle wiersz "SUMA PLN". Nie zgaduj: jeśli czegoś nie widać, wpisz null."""

SCHEMA = {
    "type": "object",
    "properties": {
        "merchant": {"type": ["string", "null"]},
        "date": {"type": ["string", "null"]},
        "total": {"type": ["string", "number", "null"]},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"name": {"type": "string"}, "price": {"type": ["string", "number", "null"]}},
                "required": ["name", "price"],
            },
        },
    },
    "required": ["merchant", "date", "total", "items"],
}
LOOP_RUN = 4

register_heif_opener()


class OcrError(Exception):
    pass


def prepare_image(path: Path, max_pixels: int) -> bytes:
    with Image.open(path) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        scale = (max_pixels / (img.width * img.height)) ** 0.5
        if scale < 1:
            img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
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


MIN_PDF_TEXT = 30


def ask(prompt: str, images: list[str]) -> dict:
    settings = get_settings()
    body = {
        "model": settings.ollama_model,
        "prompt": prompt,
        "format": SCHEMA,
        "stream": False,
        "keep_alive": settings.ollama_keep_alive,
        "options": {
            "temperature": 0,
            "repeat_penalty": 1.1,
            "num_ctx": settings.ollama_num_ctx,
            "num_predict": settings.ollama_num_predict,
        },
    }
    if images:
        body["images"] = images
    try:
        response = httpx.post(f"{settings.ollama_url}/api/generate", json=body, timeout=settings.ollama_timeout_seconds)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise OcrError(f"Ollama niedostępna: {exc}") from exc

    text = response.json().get("response", "")
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        result = salvage(text)
        if result is None:
            raise OcrError(f"Model nie zwrócił poprawnego JSON: {text[:200]}") from exc
        return result


def field(text: str, name: str) -> str | None:
    match = re.search(rf'"{name}"\s*:\s*(?:"([^"]*)"|(-?\d+(?:\.\d+)?))', text)
    if not match:
        return None
    return match.group(1) if match.group(1) is not None else match.group(2)


def drop_loop(items: list[dict]) -> list[dict]:
    run = 1
    for index in range(1, len(items)):
        run = run + 1 if items[index] == items[index - 1] else 1
        if run == LOOP_RUN:
            return items[: index - LOOP_RUN + 2]
    return items


def salvage(text: str) -> dict | None:
    items = [
        json.loads(chunk)
        for chunk in re.findall(r'\{\s*"name"\s*:\s*"[^"]*"\s*,\s*"price"\s*:\s*(?:"[^"]*"|-?\d+(?:\.\d+)?|null)\s*\}', text)
    ]
    result = {"merchant": field(text, "merchant"), "date": field(text, "date"), "total": field(text, "total"), "items": drop_loop(items)}
    if result["total"] is None and not result["items"]:
        return None
    return result


def read_receipt(path: Path) -> tuple[dict, str]:
    image_b64 = base64.b64encode(prepare_image(path, get_settings().ocr_max_pixels)).decode()
    data = normalize(ask(PROMPT, [image_b64]))
    return data, raw_text(data)


def read_receipt_text(text: str) -> tuple[dict, str]:
    prompt = PROMPT.replace("Odczytaj zdjęcie paragonu", "Odczytaj tekst paragonu podany na końcu")
    data = normalize(ask(f"{prompt}\n\nTekst paragonu:\n{text[:12000]}", []))
    return data, text


def has_text(text: str | None) -> bool:
    return bool(text) and len(text.strip()) >= MIN_PDF_TEXT


def raw_text(data: dict) -> str:
    lines = [data["merchant"] or "", data["date"] or ""]
    for item in data["items"]:
        price = item["price_grosze"]
        lines.append(f"{item['name']} {price / 100:.2f}" if price is not None else item["name"])
    if data["total_grosze"] is not None:
        lines.append(f"SUMA {data['total_grosze'] / 100:.2f}")
    return "\n".join(line for line in lines if line)

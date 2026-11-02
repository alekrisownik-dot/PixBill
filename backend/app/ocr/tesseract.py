import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageOps

MAX_WIDTH = 2000
TIMEOUT_SECONDS = 120


def available() -> bool:
    return shutil.which("tesseract") is not None


def read_text(path: Path) -> str | None:
    if not available():
        return None
    try:
        return run(path)
    except (OSError, ValueError):
        return None


def run(path: Path) -> str | None:
    with Image.open(path) as img:
        img = ImageOps.exif_transpose(img).convert("L")
        if img.width > MAX_WIDTH:
            img = img.resize((MAX_WIDTH, round(img.height * MAX_WIDTH / img.width)), Image.LANCZOS)
        with tempfile.NamedTemporaryFile(suffix=".png") as tmp:
            img.save(tmp.name)
            try:
                done = subprocess.run(
                    ["tesseract", tmp.name, "-", "-l", "pol", "--psm", "4"],
                    capture_output=True,
                    text=True,
                    timeout=TIMEOUT_SECONDS,
                )
            except subprocess.TimeoutExpired:
                return None
    return done.stdout if done.returncode == 0 else None

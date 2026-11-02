import io

import pypdfium2 as pdfium
from PIL import Image

MAX_PAGES = 6
PAGE_WIDTH = 1000


class PdfError(Exception):
    pass


def is_pdf(content: bytes) -> bool:
    return content[:1024].lstrip().startswith(b"%PDF")


def read_pdf(content: bytes) -> tuple[bytes, str]:
    try:
        doc = pdfium.PdfDocument(content)
    except pdfium.PdfiumError as exc:
        raise PdfError("Nie udało się otworzyć pliku PDF") from exc
    try:
        if len(doc) == 0:
            raise PdfError("Plik PDF jest pusty")
        pages, texts = [], []
        for index in range(min(len(doc), MAX_PAGES)):
            page = doc[index]
            texts.append(page.get_textpage().get_text_bounded())
            scale = PAGE_WIDTH / page.get_width()
            pages.append(page.render(scale=scale).to_pil().convert("RGB"))
    finally:
        doc.close()
    height = sum(p.height for p in pages)
    sheet = Image.new("RGB", (max(p.width for p in pages), height), "white")
    top = 0
    for page in pages:
        sheet.paste(page, (0, top))
        top += page.height
    buf = io.BytesIO()
    sheet.save(buf, format="JPEG", quality=88)
    text = "\n".join(t.strip() for t in texts if t.strip())
    return buf.getvalue(), text.replace("\r\n", "\n").replace("\r", "\n")

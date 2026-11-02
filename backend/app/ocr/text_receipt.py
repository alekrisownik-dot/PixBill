import re

from .ollama import parse_amount

AMOUNT = r"-?\d{1,6}(?:[  ]\d{3})*[,.]\d{2}"
CHAINS = [
    "Biedronka", "Lidl", "Żabka", "Kaufland", "Auchan", "Carrefour", "Netto", "Dino", "Stokrotka",
    "Lewiatan", "Rossmann", "Hebe", "Pepco", "Action", "Aldi", "Intermarché", "Polomarket", "Orlen",
    "Circle K", "Shell", "BP", "Moya", "Media Markt", "Media Expert", "RTV Euro AGD", "Castorama",
    "Leroy Merlin", "OBI", "IKEA", "Decathlon", "Empik", "Super-Pharm", "Ziko", "DOZ", "McDonald's",
    "KFC", "Spar", "Makro", "Selgros", "Delikatesy Centrum", "Frac", "Topaz", "Mila",
]
TOTAL_PATTERNS = [
    rf"SUMA\s*:?\s*PLN\s*:?\s*({AMOUNT})",
    rf"SUMA\s*:?\s*({AMOUNT})\s*(?:PLN|zł)?\s*$",
    rf"DO\s+ZAP[ŁL]ATY\s*:?\s*(?:PLN)?\s*({AMOUNT})",
    rf"RAZEM\s*:?\s*(?:PLN)?\s*({AMOUNT})",
]
ITEM = re.compile(
    rf"^(?P<name>.*?)\s*(?P<qty>\d+(?:[,.]\d{{1,3}})?)\s*(?:szt\.?|kg|l)?\s*[x×*]\s*(?P<unit>{AMOUNT})\s*=?\s*(?P<total>{AMOUNT})\s*[A-G]?$",
    re.IGNORECASE,
)
DISCOUNT = re.compile(rf"^(?P<name>(?:rabat|upust|obni[żz]ka|promocja|zni[żz]ka|opust)\b.*?)\s+(?P<total>-{AMOUNT})\s*[A-G]?$", re.IGNORECASE)
DATES = [
    (re.compile(r"\b(20\d{2})-(\d{2})-(\d{2})\b"), (0, 1, 2)),
    (re.compile(r"\b(\d{2})[.-](\d{2})[.-](20\d{2})\b"), (2, 1, 0)),
]
END_OF_ITEMS = re.compile(r"^(SUMA|SPRZEDA[ŻZ] OPODATK|PTU|RAZEM|DO ZAP)", re.IGNORECASE)


def clean_lines(text: str) -> list[str]:
    return [re.sub(r"[ \t ]+", " ", line).strip() for line in text.splitlines() if line.strip()]


def find_total(lines: list[str]) -> int | None:
    for pattern in TOTAL_PATTERNS:
        for line in lines:
            if re.search(r"SUMA\s+PTU", line, re.IGNORECASE):
                continue
            match = re.search(pattern, line, re.IGNORECASE)
            if match:
                return parse_amount(match.group(1))
    return None


def find_date(text: str) -> str | None:
    for pattern, order in DATES:
        match = pattern.search(text)
        if match:
            parts = match.groups()
            year, month, day = (parts[i] for i in order)
            if 1 <= int(month) <= 12 and 1 <= int(day) <= 31:
                return f"{year}-{month}-{day}"
    return None


def find_merchant(lines: list[str]) -> str | None:
    head = "\n".join(lines[:15]).casefold()
    for chain in CHAINS:
        if re.search(rf"(?<!\w){re.escape(chain.casefold())}(?!\w)", head):
            return chain
    return lines[0][:80] if lines else None


def find_items(lines: list[str]) -> list[dict]:
    items = []
    previous = ""
    for line in lines:
        if END_OF_ITEMS.match(line):
            break
        match = ITEM.match(line)
        if match:
            name = match.group("name").strip(" .:-") or previous
            if name:
                items.append({"name": name, "price_grosze": parse_amount(match.group("total"))})
            previous = ""
            continue
        match = DISCOUNT.match(line)
        if match:
            items.append({"name": match.group("name").strip(), "price_grosze": parse_amount(match.group("total"))})
            previous = ""
            continue
        previous = line
    return items


def parse(text: str) -> dict | None:
    lines = clean_lines(text)
    total = find_total(lines)
    if total is None or total <= 0:
        return None
    return {
        "merchant": find_merchant(lines),
        "date": find_date(text),
        "total_grosze": total,
        "items": find_items(lines),
    }

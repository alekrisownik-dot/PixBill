from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .items import fold, product_key
from .models import Category, Expense, ExpenseItem

KEYWORDS = {
    "chemia i dom": [
        "znicz", "swiec", "wklad", "plyn", "proszek", "kapsul", "papier", "recznik", "worki", "worek", "gabk",
        "szampon", "mydl", "zel pod", "zel do", "pasta do z", "szczotecz", "dezodor", "antyperspir", "odplamiacz", "domestos",
        "ludwik", "chusteczk", "serwetk", "folia", "bateri", "zarowk", "sciereczk", "zmyw", "pieluch",
        "podpaski", "wacik", "patyczk", "krem do", "balsam", "odswiezacz", "kostka wc", "rekawic", "zapalniczk",
    ],
    "zdrowie": ["apap", "ibuprom", "ibuprofen", "paracetamol", "witamin", "plaster", "magnez", "rutinoscorbin", "syrop", "masc"],
    "transport i paliwo": ["benzyn", "pb95", "pb98", "diesel", "olej napedowy", "lpg", "paliw", "adblue", "myjnia", "bilet"],
    "ubrania": ["skarpet", "koszul", "majtk", "spodn", "bluz", "kurtk", "rajstop", "czapk", "buty "],
    "spozywcze": [
        "mlek", "mleko", "chleb", "bulk", "bulecz", "bagiet", "pieczyw", "maslo", "ser", "jogurt", "kefir", "jaj",
        "mies", "wieprz", "wolow", "kurcz", "drob", "indyk", "szynk", "kielbas", "parowk", "boczek", "schab",
        "ryb", "losos", "tunczyk", "ziemniak", "cukini", "ogor", "pomidor", "papryk", "marchew", "cebul", "czosn",
        "salat", "kapust", "brokul", "pieczark", "jablk", "banan", "winogr", "awokad", "cytryn", "pomarancz",
        "mandaryn", "gruszk", "truskaw", "owoc", "warzyw", "makaron", "ryz", "kasz", "maka", "cukier", "sol ",
        "kawa", "herbat", "sok", "woda", "nap", "cola", "pepsi", "piwo", "wino", "smietan", "smiet", "twarog",
        "czekol", "baton", "ciast", "chips", "platki", "olej", "oliw", "kaucj", "drozdz", "lody", "mrozon",
        "pizza", "pierog", "konserw", "przypraw", "ketchup", "majonez", "musztard", "dzem", "miod", "orzech",
        "pasztet", "salami", "pomidor", "hummus", "tortill", "mozzarell", "parmezan", "gouda", "edam",
    ],
}
MERCHANTS = {
    "transport i paliwo": ["orlen", "circle k", "shell", "bp", "moya", "amic", "lotos", "mol"],
    "chemia i dom": ["rossmann", "hebe", "castorama", "leroy", "obi", "ikea", "pepco", "action", "jysk"],
    "zdrowie": ["apteka", "doz", "ziko", "gemini", "super-pharm"],
    "restauracje": ["mcdonald", "kfc", "burger king", "pizza hut", "starbucks", "costa", "subway"],
    "spozywcze": ["biedronka", "lidl", "zabka", "kaufland", "auchan", "carrefour", "netto", "dino", "stokrotka", "aldi"],
}


def categories_by_name(db: Session) -> dict[str, int]:
    rows = db.execute(select(Category.id, Category.name).where(Category.archived.is_(False))).all()
    return {fold(name): cid for cid, name in rows}


def keyword_match(text: str, table: dict[str, list[str]], names: dict[str, int]) -> int | None:
    words = f" {fold(text)} "
    for category, keywords in table.items():
        if category not in names:
            continue
        for keyword in keywords:
            if f" {keyword}" in words:
                return names[category]
    return None


def learned(db: Session, keys: set[str]) -> dict[str, int]:
    if not keys:
        return {}
    category = func.coalesce(ExpenseItem.category_id, Expense.category_id)
    rows = db.execute(
        select(ExpenseItem.product_key, category)
        .join(Expense)
        .where(ExpenseItem.product_key.in_(keys))
        .order_by(Expense.spent_on, ExpenseItem.id)
    ).all()
    return {key: cid for key, cid in rows}


def merchant_category(db: Session, merchant: str | None, names: dict[str, int]) -> int | None:
    if not merchant:
        return None
    previous = db.scalar(
        select(Expense.category_id)
        .where(func.lower(Expense.merchant) == merchant.strip().lower())
        .order_by(Expense.spent_on.desc(), Expense.id.desc())
        .limit(1)
    )
    return previous or keyword_match(merchant, MERCHANTS, names)


def assign(db: Session, result: dict) -> None:
    names = categories_by_name(db)
    items = result.get("items") or []
    memory = learned(db, {product_key(i["name"]) for i in items})
    fallback = merchant_category(db, result.get("merchant"), names)
    last_product = None
    for item in items:
        key = product_key(item["name"])
        if key.startswith("rabat") and last_product is not None:
            item["category_id"] = last_product
            continue
        item["category_id"] = memory.get(key) or keyword_match(item["name"], KEYWORDS, names) or fallback or names.get("inne")
        if (item["price_grosze"] or 0) > 0:
            last_product = item["category_id"]
    totals: dict[int, int] = {}
    for item in items:
        if item.get("category_id"):
            totals[item["category_id"]] = totals.get(item["category_id"], 0) + (item["price_grosze"] or 0)
    best = max(totals, key=totals.get) if totals else None
    result["suggested_category_id"] = best if best and totals[best] > 0 else fallback

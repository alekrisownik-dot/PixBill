import re
import unicodedata

from .models import Expense, ExpenseItem

TAX_SUFFIX = re.compile(r"\s+[A-G]$")


def fold(text: str) -> str:
    text = text.replace("ł", "l").replace("Ł", "L")
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text if not unicodedata.combining(c)).casefold()


def product_key(name: str) -> str:
    name = TAX_SUFFIX.sub("", name.strip())
    return " ".join(fold(name).split())


def set_items(expense: Expense, items) -> None:
    expense.items = [
        ExpenseItem(position=i, name=item.name.strip(), product_key=product_key(item.name), price_grosze=item.price_grosze)
        for i, item in enumerate(items)
        if item.name.strip()
    ]

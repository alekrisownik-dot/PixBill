from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..items import fold
from ..models import Expense, ExpenseItem
from ..schemas import PricePoint, ProductStat
from ..util import month_range

router = APIRouter(prefix="/api/products", tags=["products"])


@router.get("", response_model=list[ProductStat])
def list_products(
    q: str = Query(default="", max_length=100),
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = (
        select(ExpenseItem, Expense.spent_on)
        .join(Expense)
        .where(ExpenseItem.price_grosze > 0)
        .order_by(Expense.spent_on, ExpenseItem.id)
    )
    if month:
        start, end = month_range(month)
        query = query.where(Expense.spent_on >= start, Expense.spent_on < end)
    words = fold(q).split()
    stats: dict[str, ProductStat] = {}
    for item, spent_on in db.execute(query):
        if not all(word in item.product_key for word in words):
            continue
        stat = stats.get(item.product_key)
        if stat is None:
            stat = stats[item.product_key] = ProductStat(
                product_key=item.product_key, name=item.name, count=0, total_grosze=0,
                last_price_grosze=item.price_grosze, last_date=spent_on,
            )
        stat.count += 1
        stat.total_grosze += item.price_grosze
        stat.name, stat.last_price_grosze, stat.last_date = item.name, item.price_grosze, spent_on
    return sorted(stats.values(), key=lambda s: s.total_grosze, reverse=True)[:limit]


@router.get("/history", response_model=list[PricePoint])
def price_history(key: str = Query(min_length=1, max_length=200), db: Session = Depends(get_db)):
    rows = db.execute(
        select(ExpenseItem, Expense)
        .join(Expense)
        .where(ExpenseItem.product_key == key)
        .order_by(Expense.spent_on, ExpenseItem.id)
    )
    return [
        PricePoint(expense_id=e.id, spent_on=e.spent_on, merchant=e.merchant, name=i.name, price_grosze=i.price_grosze)
        for i, e in rows
    ]

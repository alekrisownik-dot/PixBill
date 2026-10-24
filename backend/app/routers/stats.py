from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Category, Expense, ExpenseItem
from ..schemas import BiggestExpense, CategoryStat, MonthReport, MonthSummary, PriceChange, TrendPoint
from ..util import month_range, shift_month

router = APIRouter(prefix="/api/stats", tags=["stats"])

MONTH = Query(default=None, pattern=r"^\d{4}-\d{2}$")


def current_month() -> str:
    return date.today().strftime("%Y-%m")


def totals_by_category(db: Session, month: str, category_id: int | None = None) -> dict[int, int]:
    start, end = month_range(month)
    query = (
        select(Expense.category_id, func.sum(Expense.amount_grosze))
        .where(Expense.spent_on >= start, Expense.spent_on < end)
        .group_by(Expense.category_id)
    )
    if category_id is not None:
        query = query.where(Expense.category_id == category_id)
    return {cid: total for cid, total in db.execute(query).all()}


def percent(current: int, previous: int) -> float | None:
    if previous == 0:
        return None
    return round((current - previous) / previous * 100, 1)


@router.get("/month", response_model=MonthSummary)
def month_summary(month: str | None = MONTH, db: Session = Depends(get_db)):
    month = month or current_month()
    previous = shift_month(month, -1)
    now_totals = totals_by_category(db, month)
    prev_totals = totals_by_category(db, previous)

    categories = []
    for category in db.scalars(select(Category).order_by(Category.position)).all():
        cur = now_totals.get(category.id, 0)
        prev = prev_totals.get(category.id, 0)
        if cur == 0 and prev == 0:
            continue
        categories.append(
            CategoryStat(
                category_id=category.id,
                name=category.name,
                color=category.color,
                total_grosze=cur,
                previous_grosze=prev,
                change_grosze=cur - prev,
                change_percent=percent(cur, prev),
            )
        )
    categories.sort(key=lambda c: c.total_grosze, reverse=True)

    total = sum(now_totals.values())
    prev_total = sum(prev_totals.values())
    return MonthSummary(
        month=month,
        total_grosze=total,
        previous_month=previous,
        previous_total_grosze=prev_total,
        change_grosze=total - prev_total,
        change_percent=percent(total, prev_total),
        categories=categories,
    )


@router.get("/trend", response_model=list[TrendPoint])
def trend(
    months: int = Query(default=12, ge=1, le=60),
    until: str | None = MONTH,
    category_id: int | None = None,
    db: Session = Depends(get_db),
):
    until = until or current_month()
    points = []
    for offset in range(months - 1, -1, -1):
        month = shift_month(until, -offset)
        points.append(
            TrendPoint(month=month, total_grosze=sum(totals_by_category(db, month, category_id).values()))
        )
    return points


def last_prices(db: Session, before: date, since: date | None = None) -> dict[str, tuple[str, int]]:
    query = (
        select(ExpenseItem.product_key, ExpenseItem.name, ExpenseItem.price_grosze)
        .join(Expense)
        .where(Expense.spent_on < before, ExpenseItem.price_grosze > 0)
        .order_by(Expense.spent_on, ExpenseItem.id)
    )
    if since:
        query = query.where(Expense.spent_on >= since)
    return {key: (name, price) for key, name, price in db.execute(query)}


@router.get("/report", response_model=MonthReport)
def month_report(month: str | None = MONTH, db: Session = Depends(get_db)):
    month = month or shift_month(current_month(), -1)
    summary = month_summary(month, db)
    start, end = month_range(month)
    expenses = db.scalars(
        select(Expense).where(Expense.spent_on >= start, Expense.spent_on < end).order_by(Expense.amount_grosze.desc())
    ).all()

    biggest = None
    if expenses:
        e = expenses[0]
        biggest = BiggestExpense(
            id=e.id, label=e.description or e.merchant or e.category.name, amount_grosze=e.amount_grosze, spent_on=e.spent_on
        )
    increases = [c for c in summary.categories if c.change_grosze > 0 and c.previous_grosze > 0]

    now_prices = last_prices(db, end, since=start)
    before = last_prices(db, start)
    changes = [
        PriceChange(product_key=key, name=name, previous_grosze=before[key][1], current_grosze=price)
        for key, (name, price) in now_prices.items()
        if key in before and before[key][1] != price
    ]
    ratio = lambda c: c.current_grosze / c.previous_grosze
    rises = sorted((c for c in changes if c.current_grosze > c.previous_grosze), key=ratio, reverse=True)[:5]
    drops = sorted((c for c in changes if c.current_grosze < c.previous_grosze), key=ratio)[:3]

    return MonthReport(
        month=month,
        total_grosze=summary.total_grosze,
        previous_total_grosze=summary.previous_total_grosze,
        change_percent=summary.change_percent,
        expense_count=len(expenses),
        receipt_count=sum(1 for e in expenses if e.source == "receipt"),
        top_category=summary.categories[0] if summary.categories and summary.categories[0].total_grosze else None,
        biggest_category_increase=max(increases, key=lambda c: c.change_grosze) if increases else None,
        biggest_expense=biggest,
        price_rises=rises,
        price_drops=drops,
    )

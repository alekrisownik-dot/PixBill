from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Category, Expense
from ..schemas import CategoryStat, MonthSummary, TrendPoint
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

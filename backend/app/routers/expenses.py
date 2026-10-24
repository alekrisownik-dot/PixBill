from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..items import fold, set_items
from ..models import Category, Expense
from ..schemas import ExpenseIn, ExpenseOut, ExpenseUpdate
from ..util import month_range

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


def ensure_category(db: Session, category_id: int) -> None:
    if db.get(Category, category_id) is None:
        raise HTTPException(422, "Nie ma takiej sekcji")


@router.get("", response_model=list[ExpenseOut])
def list_expenses(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    category_id: int | None = None,
    db: Session = Depends(get_db),
):
    query = select(Expense).options(selectinload(Expense.items)).order_by(Expense.spent_on.desc(), Expense.id.desc())
    if month:
        start, end = month_range(month)
        query = query.where(Expense.spent_on >= start, Expense.spent_on < end)
    if category_id is not None:
        query = query.where(Expense.category_id == category_id)
    return db.scalars(query).all()


@router.get("/search", response_model=list[ExpenseOut])
def search_expenses(
    q: str = Query(default="", max_length=100),
    category_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    query = select(Expense).options(selectinload(Expense.items), selectinload(Expense.category))
    if category_id is not None:
        query = query.where(Expense.category_id == category_id)
    if date_from:
        query = query.where(Expense.spent_on >= date_from)
    if date_to:
        query = query.where(Expense.spent_on <= date_to)
    words = fold(q).split()
    results = []
    for expense in db.scalars(query.order_by(Expense.spent_on.desc(), Expense.id.desc())):
        haystack = fold(
            " ".join([expense.description, expense.merchant or "", expense.category.name, *(i.name for i in expense.items)])
        )
        if all(word in haystack for word in words):
            results.append(expense)
            if len(results) >= limit:
                break
    return results


@router.post("", response_model=ExpenseOut, status_code=201)
def create_expense(data: ExpenseIn, db: Session = Depends(get_db)):
    if data.client_id:
        existing = db.scalar(select(Expense).where(Expense.client_id == data.client_id))
        if existing is not None:
            return existing
    ensure_category(db, data.category_id)
    expense = Expense(**data.model_dump(exclude={"items"}), source="manual")
    set_items(expense, data.items)
    db.add(expense)
    db.commit()
    return expense


@router.get("/{expense_id}", response_model=ExpenseOut)
def get_expense(expense_id: int, db: Session = Depends(get_db)):
    expense = db.get(Expense, expense_id)
    if expense is None:
        raise HTTPException(404, "Nie ma takiego wydatku")
    return expense


@router.patch("/{expense_id}", response_model=ExpenseOut)
def update_expense(expense_id: int, data: ExpenseUpdate, db: Session = Depends(get_db)):
    expense = db.get(Expense, expense_id)
    if expense is None:
        raise HTTPException(404, "Nie ma takiego wydatku")
    changes = data.model_dump(exclude_unset=True)
    if "category_id" in changes:
        ensure_category(db, changes["category_id"])
    if changes.pop("items", None) is not None:
        set_items(expense, data.items)
    for key, value in changes.items():
        setattr(expense, key, value)
    db.commit()
    return expense


@router.delete("/{expense_id}", status_code=204)
def delete_expense(expense_id: int, db: Session = Depends(get_db)):
    expense = db.get(Expense, expense_id)
    if expense is None:
        raise HTTPException(404, "Nie ma takiego wydatku")
    db.delete(expense)
    db.commit()

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Category, RecurringExpense
from ..recurring import generate_recurring
from ..schemas import RecurringIn, RecurringOut, RecurringUpdate

router = APIRouter(prefix="/api/recurring", tags=["recurring"])


def ensure_category(db: Session, category_id: int) -> None:
    if db.get(Category, category_id) is None:
        raise HTTPException(422, "Nie ma takiej sekcji")


def get_or_404(db: Session, recurring_id: int) -> RecurringExpense:
    item = db.get(RecurringExpense, recurring_id)
    if item is None:
        raise HTTPException(404, "Nie ma takiej opłaty stałej")
    return item


@router.get("", response_model=list[RecurringOut])
def list_recurring(db: Session = Depends(get_db)):
    return db.scalars(
        select(RecurringExpense).order_by(RecurringExpense.active.desc(), RecurringExpense.day_of_month)
    ).all()


@router.post("", response_model=RecurringOut, status_code=201)
def create_recurring(data: RecurringIn, db: Session = Depends(get_db)):
    ensure_category(db, data.category_id)
    values = data.model_dump()
    values["start_month"] = values["start_month"] or date.today().strftime("%Y-%m")
    item = RecurringExpense(**values)
    db.add(item)
    db.commit()
    generate_recurring(db)
    return item


@router.patch("/{recurring_id}", response_model=RecurringOut)
def update_recurring(recurring_id: int, data: RecurringUpdate, db: Session = Depends(get_db)):
    item = get_or_404(db, recurring_id)
    changes = data.model_dump(exclude_unset=True)
    if "category_id" in changes:
        ensure_category(db, changes["category_id"])
    if changes.get("active") and not item.active:
        current = date.today().strftime("%Y-%m")
        if item.last_generated_month is None or item.last_generated_month < current:
            item.start_month = current
            item.last_generated_month = None
    for key, value in changes.items():
        setattr(item, key, value)
    db.commit()
    generate_recurring(db)
    return item


@router.delete("/{recurring_id}", status_code=204)
def delete_recurring(recurring_id: int, db: Session = Depends(get_db)):
    item = get_or_404(db, recurring_id)
    db.delete(item)
    db.commit()

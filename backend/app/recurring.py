from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Expense, RecurringExpense
from .util import shift_month


def generate_recurring(db: Session, today: date | None = None) -> int:
    today = today or date.today()
    current = today.strftime("%Y-%m")
    created = 0
    for item in db.scalars(select(RecurringExpense).where(RecurringExpense.active.is_(True))).all():
        month = shift_month(item.last_generated_month, 1) if item.last_generated_month else item.start_month
        while month <= current:
            if month == current and today.day < item.day_of_month:
                break
            year, mon = map(int, month.split("-"))
            db.add(
                Expense(
                    amount_grosze=item.amount_grosze,
                    spent_on=date(year, mon, item.day_of_month),
                    description=item.description,
                    category_id=item.category_id,
                    source="recurring",
                    recurring_id=item.id,
                )
            )
            item.last_generated_month = month
            created += 1
            month = shift_month(month, 1)
    db.commit()
    return created

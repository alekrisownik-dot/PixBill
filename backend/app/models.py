from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    color: Mapped[str] = mapped_column(String(9), default="#9e9e9e")
    icon: Mapped[str] = mapped_column(String(40), default="dots")
    position: Mapped[int] = mapped_column(Integer, default=0)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class Receipt(Base):
    __tablename__ = "receipts"

    id: Mapped[int] = mapped_column(primary_key=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    photo_path: Mapped[str | None] = mapped_column(String(255))
    ocr_engine: Mapped[str | None] = mapped_column(String(80))
    ocr_raw: Mapped[str | None] = mapped_column(Text)
    ocr_result: Mapped[dict | None] = mapped_column(JSON)
    ocr_error: Mapped[str | None] = mapped_column(Text)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    photo_deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    expense: Mapped["Expense | None"] = relationship(back_populates="receipt")


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    amount_grosze: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="PLN")
    spent_on: Mapped[date] = mapped_column(Date, index=True)
    description: Mapped[str] = mapped_column(String(500), default="")
    merchant: Mapped[str | None] = mapped_column(String(200))
    source: Mapped[str] = mapped_column(String(20), default="manual")
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    receipt_id: Mapped[int | None] = mapped_column(ForeignKey("receipts.id"), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    category: Mapped[Category] = relationship()
    receipt: Mapped[Receipt | None] = relationship(back_populates="expense")

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str = Field(default="#9e9e9e", pattern=r"^#[0-9a-fA-F]{6}$")
    icon: str = Field(default="dots", max_length=40)
    position: int = 0
    budget_grosze: int | None = Field(default=None, gt=0)


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    icon: str | None = Field(default=None, max_length=40)
    position: int | None = None
    archived: bool | None = None
    budget_grosze: int | None = Field(default=None, gt=0)


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    color: str
    icon: str
    position: int
    archived: bool
    budget_grosze: int | None = None


class ItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    price_grosze: int


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    product_key: str
    price_grosze: int


class ExpenseIn(BaseModel):
    amount_grosze: int = Field(gt=0)
    spent_on: date
    description: str = Field(default="", max_length=500)
    merchant: str | None = Field(default=None, max_length=200)
    category_id: int
    client_id: str | None = Field(default=None, max_length=64)
    items: list[ItemIn] = Field(default_factory=list, max_length=200)


class ExpenseUpdate(BaseModel):
    amount_grosze: int | None = Field(default=None, gt=0)
    spent_on: date | None = None
    description: str | None = Field(default=None, max_length=500)
    merchant: str | None = Field(default=None, max_length=200)
    category_id: int | None = None
    items: list[ItemIn] | None = Field(default=None, max_length=200)


class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    amount_grosze: int
    currency: str
    spent_on: date
    description: str
    merchant: str | None
    source: str
    category_id: int
    receipt_id: int | None
    recurring_id: int | None
    created_at: datetime
    items: list[ItemOut] = []


class ReceiptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    has_photo: bool
    ocr_engine: str | None
    ocr_result: dict | None
    ocr_error: str | None
    uploaded_at: datetime
    confirmed_at: datetime | None
    photo_deleted_at: datetime | None
    photo_delete_after: datetime | None
    expense_id: int | None
    keep_photo: bool = False
    deposit_grosze: int = 0
    merchant: str | None = None
    spent_on: date | None = None
    amount_grosze: int | None = None


class ReceiptUpdate(BaseModel):
    keep_photo: bool


class CategoryStat(BaseModel):
    category_id: int
    name: str
    color: str
    total_grosze: int
    previous_grosze: int
    change_grosze: int
    change_percent: float | None


class MonthSummary(BaseModel):
    month: str
    total_grosze: int
    previous_month: str
    previous_total_grosze: int
    change_grosze: int
    change_percent: float | None
    categories: list[CategoryStat]


class TrendPoint(BaseModel):
    month: str
    total_grosze: int


class LoginIn(BaseModel):
    password: str


class RecurringIn(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    amount_grosze: int = Field(gt=0)
    category_id: int
    day_of_month: int = Field(default=1, ge=1, le=28)
    start_month: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}$")


class RecurringUpdate(BaseModel):
    description: str | None = Field(default=None, min_length=1, max_length=500)
    amount_grosze: int | None = Field(default=None, gt=0)
    category_id: int | None = None
    day_of_month: int | None = Field(default=None, ge=1, le=28)
    active: bool | None = None


class RecurringOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    description: str
    amount_grosze: int
    category_id: int
    day_of_month: int
    active: bool
    start_month: str
    last_generated_month: str | None


class ProductStat(BaseModel):
    product_key: str
    name: str
    count: int
    total_grosze: int
    last_price_grosze: int
    last_date: date


class PricePoint(BaseModel):
    expense_id: int
    spent_on: date
    merchant: str | None
    name: str
    price_grosze: int


class PriceChange(BaseModel):
    product_key: str
    name: str
    previous_grosze: int
    current_grosze: int


class BiggestExpense(BaseModel):
    id: int
    label: str
    amount_grosze: int
    spent_on: date


class MonthReport(BaseModel):
    month: str
    total_grosze: int
    previous_total_grosze: int
    change_percent: float | None
    expense_count: int
    receipt_count: int
    top_category: CategoryStat | None
    biggest_category_increase: CategoryStat | None
    biggest_expense: BiggestExpense | None
    price_rises: list[PriceChange]
    price_drops: list[PriceChange]

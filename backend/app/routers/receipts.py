import logging
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..cleanup import photo_delete_after
from ..config import get_settings
from ..db import get_db, new_session
from ..items import set_items
from ..models import Category, Expense, Receipt
from ..ocr import ollama
from ..schemas import ExpenseOut, ItemIn, ReceiptOut, ReceiptUpdate

router = APIRouter(prefix="/api/receipts", tags=["receipts"])
log = logging.getLogger(__name__)

ALLOWED_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic"}
MAX_UPLOAD_BYTES = 20 * 1024 * 1024


def deposit_of(receipt: Receipt) -> int:
    if receipt.expense is None:
        return 0
    return sum(i.price_grosze for i in receipt.expense.items if "kaucj" in i.product_key and i.price_grosze > 0)


def to_out(receipt: Receipt) -> ReceiptOut:
    expense = receipt.expense
    return ReceiptOut(
        id=receipt.id,
        status=receipt.status,
        has_photo=receipt.photo_path is not None,
        ocr_engine=receipt.ocr_engine,
        ocr_result=receipt.ocr_result,
        ocr_error=receipt.ocr_error,
        uploaded_at=receipt.uploaded_at,
        confirmed_at=receipt.confirmed_at,
        photo_deleted_at=receipt.photo_deleted_at,
        photo_delete_after=photo_delete_after(receipt),
        expense_id=expense.id if expense else None,
        keep_photo=receipt.keep_photo,
        deposit_grosze=deposit_of(receipt),
        merchant=expense.merchant if expense else None,
        spent_on=expense.spent_on if expense else None,
        amount_grosze=expense.amount_grosze if expense else None,
    )


def suggest_category(db: Session, merchant: str | None) -> int | None:
    if not merchant:
        return None
    return db.scalar(
        select(Expense.category_id)
        .where(func.lower(Expense.merchant) == merchant.strip().lower())
        .order_by(Expense.spent_on.desc(), Expense.id.desc())
        .limit(1)
    )


def run_ocr(receipt_id: int) -> None:
    with new_session() as db:
        receipt = db.get(Receipt, receipt_id)
        if receipt is None or receipt.photo_path is None:
            return
        receipt.ocr_engine = f"ollama:{get_settings().ollama_model}"
        try:
            result, raw = ollama.read_receipt(get_settings().photos_dir / receipt.photo_path)
        except Exception as exc:
            log.warning("OCR paragonu %s nie powiódł się: %s", receipt_id, exc)
            receipt.status = "failed"
            receipt.ocr_error = str(exc)
        else:
            result["suggested_category_id"] = suggest_category(db, result.get("merchant"))
            receipt.status = "processed"
            receipt.ocr_result = result
            receipt.ocr_raw = raw
            receipt.ocr_error = None
        db.commit()


def get_receipt_or_404(db: Session, receipt_id: int) -> Receipt:
    receipt = db.get(Receipt, receipt_id)
    if receipt is None:
        raise HTTPException(404, "Nie ma takiego paragonu")
    return receipt


@router.post("", response_model=ReceiptOut, status_code=201)
async def upload_receipt(
    file: UploadFile,
    background: BackgroundTasks,
    client_id: str | None = Form(default=None, max_length=64),
    db: Session = Depends(get_db),
):
    if client_id:
        existing = db.scalar(select(Receipt).where(Receipt.client_id == client_id))
        if existing is not None:
            return to_out(existing)
    suffix = ALLOWED_TYPES.get(file.content_type or "")
    if suffix is None:
        raise HTTPException(415, "Obsługiwane formaty: JPG, PNG, WEBP, HEIC")
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Zdjęcie jest za duże (max 20 MB)")

    name = f"{uuid.uuid4().hex}{suffix}"
    (get_settings().photos_dir / name).write_bytes(content)
    receipt = Receipt(photo_path=name, client_id=client_id)
    db.add(receipt)
    db.commit()
    background.add_task(run_ocr, receipt.id)
    return to_out(receipt)


@router.get("", response_model=list[ReceiptOut])
def list_receipts(status: str | None = None, keep_photo: bool | None = None, db: Session = Depends(get_db)):
    query = select(Receipt).order_by(Receipt.uploaded_at.desc())
    if status:
        query = query.where(Receipt.status == status)
    if keep_photo is not None:
        query = query.where(Receipt.keep_photo == keep_photo)
    return [to_out(r) for r in db.scalars(query).all()]


@router.get("/{receipt_id}", response_model=ReceiptOut)
def get_receipt(receipt_id: int, db: Session = Depends(get_db)):
    return to_out(get_receipt_or_404(db, receipt_id))


@router.get("/{receipt_id}/photo")
def get_photo(receipt_id: int, db: Session = Depends(get_db)):
    receipt = get_receipt_or_404(db, receipt_id)
    if receipt.photo_path is None:
        raise HTTPException(410, "Zdjęcie zostało już usunięte")
    return FileResponse(get_settings().photos_dir / receipt.photo_path)


@router.post("/{receipt_id}/retry", response_model=ReceiptOut)
def retry_ocr(receipt_id: int, background: BackgroundTasks, db: Session = Depends(get_db)):
    receipt = get_receipt_or_404(db, receipt_id)
    if receipt.status == "confirmed" or receipt.photo_path is None:
        raise HTTPException(409, "Tego paragonu nie można już odczytać ponownie")
    receipt.status = "pending"
    db.commit()
    background.add_task(run_ocr, receipt.id)
    return to_out(receipt)


class ConfirmIn(BaseModel):
    amount_grosze: int = Field(gt=0)
    spent_on: date
    category_id: int
    description: str = Field(default="", max_length=500)
    merchant: str | None = Field(default=None, max_length=200)
    items: list[ItemIn] = Field(default_factory=list, max_length=200)
    keep_photo: bool = False


@router.post("/{receipt_id}/confirm", response_model=ExpenseOut, status_code=201)
def confirm_receipt(receipt_id: int, data: ConfirmIn, db: Session = Depends(get_db)):
    receipt = get_receipt_or_404(db, receipt_id)
    if receipt.status == "confirmed":
        raise HTTPException(409, "Paragon jest już zatwierdzony")
    if db.get(Category, data.category_id) is None:
        raise HTTPException(422, "Nie ma takiej sekcji")
    expense = Expense(**data.model_dump(exclude={"items", "keep_photo"}), source="receipt", receipt_id=receipt.id)
    receipt.keep_photo = data.keep_photo
    set_items(expense, data.items)
    receipt.status = "confirmed"
    receipt.confirmed_at = datetime.now(timezone.utc)
    db.add(expense)
    db.commit()
    return expense


@router.delete("/{receipt_id}", status_code=204)
def delete_receipt(receipt_id: int, db: Session = Depends(get_db)):
    receipt = get_receipt_or_404(db, receipt_id)
    if receipt.status == "confirmed":
        raise HTTPException(409, "Zatwierdzony paragon usuwa się razem z wydatkiem")
    if receipt.photo_path:
        (get_settings().photos_dir / receipt.photo_path).unlink(missing_ok=True)
    db.delete(receipt)
    db.commit()


@router.patch("/{receipt_id}", response_model=ReceiptOut)
def update_receipt(receipt_id: int, data: ReceiptUpdate, db: Session = Depends(get_db)):
    receipt = get_receipt_or_404(db, receipt_id)
    if data.keep_photo and receipt.photo_path is None:
        raise HTTPException(409, "Zdjęcie zostało już usunięte")
    receipt.keep_photo = data.keep_photo
    db.commit()
    return to_out(receipt)


@router.delete("/{receipt_id}/photo", response_model=ReceiptOut)
def delete_photo(receipt_id: int, db: Session = Depends(get_db)):
    receipt = get_receipt_or_404(db, receipt_id)
    if receipt.status != "confirmed":
        raise HTTPException(409, "Najpierw zatwierdź albo odrzuć paragon")
    if receipt.photo_path:
        (get_settings().photos_dir / receipt.photo_path).unlink(missing_ok=True)
        receipt.photo_path = None
        receipt.photo_deleted_at = datetime.now(timezone.utc)
    receipt.keep_photo = False
    db.commit()
    return to_out(receipt)

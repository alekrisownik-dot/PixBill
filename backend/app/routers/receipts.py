import logging
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..cleanup import photo_delete_after
from ..config import get_settings
from ..db import get_db, new_session
from ..models import Category, Expense, Receipt
from ..ocr import ollama
from ..schemas import ExpenseOut, ReceiptOut

router = APIRouter(prefix="/api/receipts", tags=["receipts"])
log = logging.getLogger(__name__)

ALLOWED_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic"}
MAX_UPLOAD_BYTES = 20 * 1024 * 1024


def to_out(receipt: Receipt) -> ReceiptOut:
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
        expense_id=receipt.expense.id if receipt.expense else None,
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
async def upload_receipt(file: UploadFile, background: BackgroundTasks, db: Session = Depends(get_db)):
    suffix = ALLOWED_TYPES.get(file.content_type or "")
    if suffix is None:
        raise HTTPException(415, "Obsługiwane formaty: JPG, PNG, WEBP, HEIC")
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Zdjęcie jest za duże (max 20 MB)")

    name = f"{uuid.uuid4().hex}{suffix}"
    (get_settings().photos_dir / name).write_bytes(content)
    receipt = Receipt(photo_path=name)
    db.add(receipt)
    db.commit()
    background.add_task(run_ocr, receipt.id)
    return to_out(receipt)


@router.get("", response_model=list[ReceiptOut])
def list_receipts(status: str | None = None, db: Session = Depends(get_db)):
    query = select(Receipt).order_by(Receipt.uploaded_at.desc())
    if status:
        query = query.where(Receipt.status == status)
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


@router.post("/{receipt_id}/confirm", response_model=ExpenseOut, status_code=201)
def confirm_receipt(receipt_id: int, data: ConfirmIn, db: Session = Depends(get_db)):
    receipt = get_receipt_or_404(db, receipt_id)
    if receipt.status == "confirmed":
        raise HTTPException(409, "Paragon jest już zatwierdzony")
    if db.get(Category, data.category_id) is None:
        raise HTTPException(422, "Nie ma takiej sekcji")
    expense = Expense(**data.model_dump(), source="receipt", receipt_id=receipt.id)
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

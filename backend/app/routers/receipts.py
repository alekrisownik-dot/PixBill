import logging
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import categorize
from ..cleanup import photo_delete_after
from ..config import get_settings
from ..db import get_db, new_session
from ..items import fold, set_items
from ..models import Category, Expense, Receipt
from ..ocr import ollama, pdf, tesseract, text_receipt
from ..schemas import ExpenseOut, ItemIn, ReceiptOut, ReceiptUpdate

router = APIRouter(prefix="/api/receipts", tags=["receipts"])
log = logging.getLogger(__name__)

ALLOWED_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic"}
PDF_TYPES = {"application/pdf", "application/x-pdf"}
MAX_UPLOAD_BYTES = 20 * 1024 * 1024


def receipt_expenses(receipt: Receipt) -> list[Expense]:
    return ([receipt.expense] if receipt.expense else []) + list(receipt.split_expenses)


def deposit_of(receipt: Receipt) -> int:
    return sum(
        i.price_grosze
        for expense in receipt_expenses(receipt)
        for i in expense.items
        if "kaucj" in i.product_key and i.price_grosze > 0
    )


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
        amount_grosze=sum(e.amount_grosze for e in receipt_expenses(receipt)) if expense else None,
    )


def find_duplicate(db: Session, result: dict) -> int | None:
    if not result.get("total_grosze") or not result.get("date"):
        return None
    candidates = db.scalars(
        select(Expense).where(
            Expense.amount_grosze == result["total_grosze"],
            Expense.spent_on == date.fromisoformat(result["date"]),
        )
    ).all()
    merchant = fold(result.get("merchant") or "")
    for expense in candidates:
        if not merchant or not expense.merchant or fold(expense.merchant) == merchant:
            return expense.id
    return None


def run_ocr(receipt_id: int) -> None:
    with new_session() as db:
        receipt = db.get(Receipt, receipt_id)
        if receipt is None or receipt.photo_path is None:
            return
        photo = get_settings().photos_dir / receipt.photo_path
        from_text = ollama.has_text(receipt.pdf_text)
        text = receipt.pdf_text if from_text else tesseract.read_text(photo)
        parsed = text_receipt.parse(text) if text else None
        if parsed:
            receipt.ocr_engine = "tekst:pdf" if from_text else "tesseract"
        else:
            receipt.ocr_engine = f"ollama:{get_settings().ollama_model}" + (":pdf" if from_text else "")
        try:
            if parsed:
                result, raw = parsed, text
            elif from_text:
                result, raw = ollama.read_receipt_text(receipt.pdf_text)
            else:
                result, raw = ollama.read_receipt(photo)
        except Exception as exc:
            log.warning("OCR paragonu %s nie powiódł się: %s", receipt_id, exc)
            receipt.status = "failed"
            receipt.ocr_error = str(exc)
        else:
            categorize.assign(db, result)
            result["duplicate_of"] = find_duplicate(db, result)
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
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Plik jest za duży (max 20 MB)")
    pdf_text = None
    if file.content_type in PDF_TYPES or (file.filename or "").lower().endswith(".pdf") or pdf.is_pdf(content):
        try:
            content, pdf_text = pdf.read_pdf(content)
        except pdf.PdfError as exc:
            raise HTTPException(415, str(exc)) from exc
        suffix = ".jpg"
    else:
        suffix = ALLOWED_TYPES.get(file.content_type or "")
        if suffix is None:
            raise HTTPException(415, "Obsługiwane formaty: JPG, PNG, WEBP, HEIC i PDF")

    name = f"{uuid.uuid4().hex}{suffix}"
    (get_settings().photos_dir / name).write_bytes(content)
    receipt = Receipt(photo_path=name, client_id=client_id, pdf_text=pdf_text)
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


class SplitIn(BaseModel):
    category_id: int
    amount_grosze: int = Field(gt=0)
    items: list[ItemIn] = Field(default_factory=list, max_length=200)


class ConfirmIn(BaseModel):
    amount_grosze: int = Field(gt=0)
    spent_on: date
    category_id: int
    description: str = Field(default="", max_length=500)
    merchant: str | None = Field(default=None, max_length=200)
    items: list[ItemIn] = Field(default_factory=list, max_length=200)
    keep_photo: bool = False
    splits: list[SplitIn] = Field(default_factory=list, max_length=20)


@router.post("/{receipt_id}/confirm", response_model=ExpenseOut, status_code=201)
def confirm_receipt(receipt_id: int, data: ConfirmIn, db: Session = Depends(get_db)):
    receipt = get_receipt_or_404(db, receipt_id)
    if receipt.status == "confirmed":
        raise HTTPException(409, "Paragon jest już zatwierdzony")
    splits = data.splits or [SplitIn(category_id=data.category_id, amount_grosze=data.amount_grosze, items=data.items)]
    if sum(s.amount_grosze for s in splits) != data.amount_grosze:
        raise HTTPException(422, "Części paragonu nie sumują się do kwoty")
    for split in splits:
        if db.get(Category, split.category_id) is None:
            raise HTTPException(422, "Nie ma takiej sekcji")
    splits.sort(key=lambda s: s.amount_grosze, reverse=True)
    common = data.model_dump(include={"spent_on", "description", "merchant"})
    expenses = []
    for index, split in enumerate(splits):
        link = {"receipt_id": receipt.id} if index == 0 else {"split_receipt_id": receipt.id}
        expense = Expense(**common, **link, amount_grosze=split.amount_grosze, category_id=split.category_id, source="receipt")
        set_items(expense, split.items)
        db.add(expense)
        expenses.append(expense)
    receipt.keep_photo = data.keep_photo
    receipt.status = "confirmed"
    receipt.confirmed_at = datetime.now(timezone.utc)
    db.commit()
    return expenses[0]


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

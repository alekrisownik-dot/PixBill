import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import new_session
from .models import Receipt
from .recurring import generate_recurring

log = logging.getLogger(__name__)


def photo_delete_after(receipt: Receipt) -> datetime | None:
    if receipt.confirmed_at is None or receipt.photo_path is None or receipt.keep_photo:
        return None
    confirmed = receipt.confirmed_at
    if confirmed.tzinfo is None:
        confirmed = confirmed.replace(tzinfo=timezone.utc)
    return confirmed + timedelta(days=get_settings().photo_retention_days)


def delete_expired_photos(db: Session, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    settings = get_settings()
    receipts = db.scalars(
        select(Receipt).where(Receipt.confirmed_at.is_not(None), Receipt.photo_path.is_not(None))
    ).all()
    deleted = 0
    for receipt in receipts:
        deadline = photo_delete_after(receipt)
        if deadline is None or deadline > now:
            continue
        (settings.photos_dir / receipt.photo_path).unlink(missing_ok=True)
        receipt.photo_path = None
        receipt.photo_deleted_at = now
        deleted += 1
    db.commit()
    return deleted


async def cleanup_loop() -> None:
    interval = get_settings().cleanup_interval_seconds
    while True:
        try:
            with new_session() as db:
                count = delete_expired_photos(db)
                added = generate_recurring(db)
            if count:
                log.info("Usunięto %d zdjęć paragonów", count)
            if added:
                log.info("Dopisano %d opłat stałych", added)
        except Exception:
            log.exception("Błąd zadania w tle")
        await asyncio.sleep(interval)

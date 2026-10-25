from collections.abc import Iterator

from sqlalchemy import create_engine, event, inspect, select, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


_engine = None
_SessionLocal: sessionmaker[Session] | None = None


def get_engine():
    global _engine, _SessionLocal
    if _engine is None:
        settings = get_settings()
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        _engine = create_engine(
            f"sqlite:///{settings.db_path}",
            connect_args={"check_same_thread": False},
        )

        @event.listens_for(_engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _):
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA journal_mode=WAL")
            cur.close()

        _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def new_session() -> Session:
    get_engine()
    assert _SessionLocal is not None
    return _SessionLocal()


def get_db() -> Iterator[Session]:
    db = new_session()
    try:
        yield db
    finally:
        db.close()


DEFAULT_CATEGORIES = [
    ("Spożywcze", "#4caf50", "cart"),
    ("Chemia i dom", "#00bcd4", "home"),
    ("Transport i paliwo", "#ff9800", "car"),
    ("Rachunki", "#9c27b0", "bolt"),
    ("Zdrowie", "#f44336", "heart"),
    ("Rozrywka", "#3f51b5", "film"),
    ("Restauracje", "#795548", "utensils"),
    ("Ubrania", "#e91e63", "shirt"),
    ("Inne", "#9e9e9e", "dots"),
]


def init_db() -> None:
    from .models import Category

    engine = get_engine()
    Base.metadata.create_all(engine)
    _add_missing_columns(engine)
    get_settings().photos_dir.mkdir(parents=True, exist_ok=True)
    with new_session() as db:
        if db.scalar(select(Category.id).limit(1)) is None:
            for position, (name, color, icon) in enumerate(DEFAULT_CATEGORIES):
                db.add(Category(name=name, color=color, icon=icon, position=position))
            db.commit()


NEW_COLUMNS = [
    ("expenses", "recurring_id", "INTEGER REFERENCES recurring_expenses(id)", False),
    ("expenses", "client_id", "VARCHAR(64)", True),
    ("receipts", "client_id", "VARCHAR(64)", True),
    ("receipts", "keep_photo", "BOOLEAN NOT NULL DEFAULT 0", False),
    ("categories", "budget_grosze", "INTEGER", False),
]


def _add_missing_columns(engine) -> None:
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table, column, definition, unique in NEW_COLUMNS:
            if column in {c["name"] for c in inspector.get_columns(table)}:
                continue
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
            if unique:
                conn.execute(text(f"CREATE UNIQUE INDEX IF NOT EXISTS ix_{table}_{column} ON {table} ({column})"))


def reset_engine() -> None:
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None

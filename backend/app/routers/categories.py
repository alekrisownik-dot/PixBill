from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Category
from ..schemas import CategoryIn, CategoryOut, CategoryUpdate

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(include_archived: bool = False, db: Session = Depends(get_db)):
    query = select(Category).order_by(Category.position, Category.name)
    if not include_archived:
        query = query.where(Category.archived.is_(False))
    return db.scalars(query).all()


@router.post("", response_model=CategoryOut, status_code=201)
def create_category(data: CategoryIn, db: Session = Depends(get_db)):
    category = Category(**data.model_dump())
    db.add(category)
    try:
        db.commit()
    except IntegrityError:
        raise HTTPException(409, "Sekcja o tej nazwie już istnieje")
    return category


@router.patch("/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, data: CategoryUpdate, db: Session = Depends(get_db)):
    category = db.get(Category, category_id)
    if category is None:
        raise HTTPException(404, "Nie ma takiej sekcji")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(category, key, value)
    try:
        db.commit()
    except IntegrityError:
        raise HTTPException(409, "Sekcja o tej nazwie już istnieje")
    return category

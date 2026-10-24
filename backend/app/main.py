import asyncio
import logging
from contextlib import asynccontextmanager

from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from .auth import check_password, require_login
from .cleanup import cleanup_loop
from .config import get_settings
from .db import init_db
from .routers import categories, expenses, export, products, receipts, recurring, stats
from .schemas import LoginIn

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    task = asyncio.create_task(cleanup_loop())
    yield
    task.cancel()


app = FastAPI(title="PixBill", lifespan=lifespan)
app.add_middleware(
    SessionMiddleware,
    secret_key=get_settings().session_secret(),
    max_age=60 * 60 * 24 * 90,
    same_site="strict",
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/login", status_code=204)
def login(data: LoginIn, request: Request):
    if not check_password(data.password):
        raise HTTPException(401, "Złe hasło")
    request.session["logged_in"] = True


@app.post("/api/logout", status_code=204)
def logout(request: Request):
    request.session.clear()


for module in (categories, expenses, export, products, receipts, recurring, stats):
    app.include_router(module.router, dependencies=[Depends(require_login)])

app.mount("/", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="static")

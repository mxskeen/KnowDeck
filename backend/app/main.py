from pathlib import Path
from typing import Dict, Optional
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .types import Deck
from .generator import generate_deck, append_slide
from .store import store
from .auth import get_user_id_from_header, quota_key
from .config import settings


app = FastAPI(title="KnowDeck API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"]
)

static_dir = Path(__file__).parent / "static"
static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


class NewDeckRequest(BaseModel):
    topic: str
    level: Optional[str] = "beginner"


class AskRequest(BaseModel):
    question: str
    slide_index: Optional[int] = None
    replace: Optional[bool] = False


@app.get("/health")
def healthz():
    return {"status": "ok"}


@app.get("/api/usage")
def get_usage(request: Request, x_user_id: Optional[str] = Header(default=None)):
    user_id = get_user_id_from_header(x_user_id)
    key = quota_key(request, user_id)
    used, limit = store.get_usage(key, is_authenticated=bool(user_id))
    return {"used": used, "limit": limit}


@app.get("/api/decks/{deck_id}", response_model=Deck)
def get_deck(deck_id: str):
    deck = store.get_deck(deck_id)
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    return deck


@app.post("/api/decks", response_model=Deck)
def create_deck(payload: NewDeckRequest, request: Request, x_user_id: Optional[str] = Header(default=None)):
    user_id = get_user_id_from_header(x_user_id)
    key = quota_key(request, user_id)
    if not store.can_use(key, is_authenticated=bool(user_id)):
        limit = settings.user_daily_limit if user_id else settings.anon_daily_limit
        raise HTTPException(status_code=429, detail=f"Daily limit reached ({limit}). Sign in for more uses.")
    deck = generate_deck(payload.topic, payload.level or "beginner")
    store.save_deck(deck)
    store.increment_use(key)
    return deck


@app.post("/api/decks/{deck_id}/slides", response_model=Deck)
def ask(deck_id: str, payload: AskRequest, request: Request, x_user_id: Optional[str] = Header(default=None)):
    user_id = get_user_id_from_header(x_user_id)
    key = quota_key(request, user_id)
    if not store.can_use(key, is_authenticated=bool(user_id)):
        limit = settings.user_daily_limit if user_id else settings.anon_daily_limit
        raise HTTPException(status_code=429, detail=f"Daily limit reached ({limit}). Sign in for more uses.")
    deck = store.get_deck(deck_id)
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    updated = append_slide(deck, payload.question, payload.slide_index, bool(payload.replace))
    store.save_deck(updated)
    store.increment_use(key)
    return updated 
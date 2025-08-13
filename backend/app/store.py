from __future__ import annotations
from dataclasses import dataclass
from datetime import date
from typing import Dict, Optional

from .types import Deck
from .config import settings

try:
	from supabase import create_client
	SUPABASE = create_client(settings.supabase_url, settings.supabase_key) if settings.supabase_url and settings.supabase_key else None
except Exception:
	SUPABASE = None


@dataclass
class Usage:
	count: int
	day: date


class Store:
	def __init__(self):
		self.decks: Dict[str, Deck] = {}
		self.usage: Dict[str, Usage] = {}

	def get_deck(self, deck_id: str) -> Optional[Deck]:
		if SUPABASE:
			row = SUPABASE.table("deck").select("id, topic, level, slides").eq("id", deck_id).maybe_single().execute().data
			if row:
				return Deck(id=row["id"], topic=row["topic"], level=row["level"], slides=row["slides"])
			return None
		return self.decks.get(deck_id)

	def save_deck(self, deck: Deck):
		if SUPABASE:
			SUPABASE.table("deck").upsert({
				"id": deck.id,
				"topic": deck.topic,
				"level": deck.level,
				"slides": [s.model_dump() for s in deck.slides],
			}).execute()
			return
		self.decks[deck.id] = deck

	def can_use(self, quota_key: str, is_authenticated: bool) -> bool:
		limit = settings.user_daily_limit if is_authenticated else settings.anon_daily_limit
		u = self.usage.get(quota_key)
		if not u or u.day != date.today():
			self.usage[quota_key] = Usage(count=0, day=date.today())
			u = self.usage[quota_key]
		return u.count < limit

	def increment_use(self, quota_key: str):
		u = self.usage.get(quota_key)
		if not u or u.day != date.today():
			self.usage[quota_key] = Usage(count=0, day=date.today())
			u = self.usage[quota_key]
		u.count += 1

	def get_usage(self, quota_key: str, is_authenticated: bool) -> tuple[int, int]:
		limit = settings.user_daily_limit if is_authenticated else settings.anon_daily_limit
		u = self.usage.get(quota_key)
		if not u or u.day != date.today():
			return 0, limit
		return u.count, limit


store = Store() 
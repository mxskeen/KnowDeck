from typing import Optional
from fastapi import Request


def get_user_id_from_header(x_user_id: Optional[str]) -> Optional[str]:
	return x_user_id or None


def quota_key(request: Request, user_id: Optional[str]) -> str:
	return user_id or (request.client.host if request.client else "anon") 
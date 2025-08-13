import os
from dataclasses import dataclass


@dataclass
class Settings:
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_key: str = os.getenv("SUPABASE_ANON_KEY", "")
    clerk_jwks_url: str = os.getenv("CLERK_JWKS_URL", "")
    cors_origins: str = os.getenv("CORS_ORIGINS", "*")
    anon_daily_limit: int = int(os.getenv("ANON_DAILY_LIMIT", "3"))
    user_daily_limit: int = int(os.getenv("USER_DAILY_LIMIT", "10"))
    znapai_api_key: str = os.getenv("ZnapAI_API_KEY", "")
    znapai_model: str = os.getenv("ZnapAI_MODEL", "gpt-4o-mini")


settings = Settings() 
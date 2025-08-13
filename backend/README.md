# KnowDeck API (FastAPI)

Quickstart

```bash
cd /home/maskeen/br1/KnowDeck/backend
poetry install
# optional: Supabase + ZnapAI
# export SUPABASE_URL=... SUPABASE_ANON_KEY=...
# export ZnapAI_API_KEY=... ZnapAI_MODEL=gpt-4.1
poetry run uvicorn app.main:app --env-file .env --host 0.0.0.0 --port 8000
```

Endpoints

- `GET /healthz`
- `GET /api/usage`
- `GET /api/decks/{id}`
- `POST /api/decks` — `{ "topic": "...", "level": "beginner|intermediate|advanced" }`
- `POST /api/decks/{deck_id}/slides` — `{ "question": "..." }`

Generation

- Uses ZnapAI Chat Completions (`ZnapAI_MODEL`, recommended `gpt-4.1` or `gpt-4o`)
- Robust parsing: coerces `body` to string, accepts optional `diagram` (Mermaid) and `code { language, content }`
- Produces 14–15 slides per deck

Auth & quotas

- If client sends `X-User-Id: <clerk_user_id>` → 10 uses/day
- Otherwise IP‑based → 3 uses/day

Persistence

- Supabase table `decks(id uuid pk, topic text, level text, slides jsonb)`
- If not configured, in‑memory store is used

Note

- You chose to disable RLS and rely on server‑side access only. If you later use Supabase Data API from the browser, enable RLS and add policies. See Supabase guidance on API security and RLS [supabase.com/docs/guides/api/securing-your-api](https://supabase.com/docs/guides/api/securing-your-api) and related discussion context [github.com/orgs/supabase/discussions/26584](https://github.com/orgs/supabase/discussions/26584). 
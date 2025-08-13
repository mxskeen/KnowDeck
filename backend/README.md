# KnowDeck API (FastAPI)

Quickstart

```bash
cd /home/maskeen/br1/KnowDeck/backend
poetry install
poetry run uvicorn app.main:app --env-file .env --host 0.0.0.0 --port 8000
```

Endpoints

- `GET /health`
- `GET /api/usage`
- `GET /api/decks/{id}`
- `POST /api/decks` — `{ "topic": "...", "level": "beginner|intermediate|advanced" }`
- `POST /api/decks/{deck_id}/slides` — `{ "question": "..." }`

Generation

- Uses ZnapAI Chat Completions (`ZnapAI_MODEL`, recommended `gpt-4.1` or `gpt-4o`)
- parsing: `body` to string, optional `diagram` (Mermaid), optional `code`, optional `table { headers, rows }`
- Produces 14–15 slides per deck

Mermaid theming (web)

- Configure theme at runtime in the browser console:
  - `localStorage.setItem('MERMAID_THEME','dark')` or `forest` or `neutral` or leave empty for KnowDeck preset
- References: Mermaid theming options and custom looks [mermaid.js.org/theming](https://mermaid.js.org/config/theming.html), community theme examples [github.com/Gordonby/MermaidTheming](https://github.com/Gordonby/MermaidTheming), new looks like neo/hand-drawn [docs.mermaidchart.com](https://docs.mermaidchart.com/blog/posts/mermaid-innovation-introducing-new-looks-for-mermaid-diagrams)

Auth & quotas

- If client sends `X-User-Id: <clerk_user_id>` → 10 uses/day
- Otherwise IP‑based → 3 uses/day

Persistence

- Supabase table `decks(id uuid pk, topic text, level text, slides jsonb)`
- If not configured, in‑memory store is used

 
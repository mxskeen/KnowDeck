# KnowDeck Web

Local dev

```bash
cd /home/maskeen/br1/KnowDeck/frontend
# optional Clerk: store publishable key in localStorage so the inline script can load
# open browser console and run:
# localStorage.setItem('CLERK_PUBLISHABLE_KEY', 'pk_test_...')
python3 -m http.server 5500 --bind 127.0.0.1
```

Usage caps

- Anonymous (no Clerk session): 3 uses/day per IP
- Signed‑in (valid Clerk JWT): 10 uses/day per user 
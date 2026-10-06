# /thesis — notes

Unzip over your project (merges into the same folders). No new npm dependencies.

## Env
- `GEMINI_API_KEY` — same key the journal already uses (AI summaries).
- `DEXSCREENER_BASE_URL` — optional; defaults to https://api.dexscreener.com (for proxies/tests).

## Things to verify on your side
1. **Axiom link** — `lib/axiom.ts`. Axiom keys tokens by *pair address*; the URL `https://axiom.trade/meme/<pairAddress>` is
   not documented, so please click one and confirm. One-line change if wrong. Only built for Solana; other chains hide the link.
2. **Migration time** — DexScreener has no migration field. It's inferred from pair creation times (see `lib/dexscreener.ts`).
   Check `BONDING_CURVE_DEX_IDS` against the `dexId`s you actually see (they're stored on each entry as `pairsAtEntry`).
3. `/journal` is a new route that re-exports the existing root page (`/` still works too).

## Limits
- Tracking runs in the browser (no DB/cron in this app). Keep the page open; minutes missed while it's closed stay "—".
- Entries live in localStorage (`ctj:thesis:v1`), separate from journal trades.

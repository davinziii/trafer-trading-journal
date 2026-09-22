# Ledger — Crypto Trading Journal

A simple personal crypto trading journal: a monthly calendar showing daily PNL or
winrate, a per-day trade list, a watchlist for coins you noted but didn't trade,
an AI-generated Trade Summary (journal analyst feedback by day/week/month), and
a collapsible rich-text notepad. Built with Next.js (App Router), React,
TypeScript, and Tailwind CSS. All data is stored in the browser via
`localStorage`.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

### Enabling the AI Trade Summary

The Trade Summary panel calls the Gemini API from a server-side route so the
API key is never exposed to the browser. To enable it:

```bash
cp .env.example .env.local
# then edit .env.local and set GEMINI_API_KEY=your-key
```

Get a key at https://aistudio.google.com/apikey. Restart `npm run dev` after
adding it. Without a key, the rest of the app (calendar, trades, notepad)
works as normal — only the Trade Summary panel will show an error with a
Retry button.

## How the numbers work

- **Entry / Out** are the coin's **market cap** at entry and exit — not money
  invested. They're used only to determine win vs. loss.
- **Win/Loss** is the raw amount of SOL you enter (always positive, e.g. `3`).
- The signed result is derived, never stored:
  - `Out > Entry` → `+winLoss`
  - `Out < Entry` → `-winLoss`
  - `Out === Entry` → `0` (break-even)
- Editing Entry/Out later automatically updates the displayed sign — the stored
  `winLoss` value never changes.
- **Daily PNL** is the sum of each trade's derived result.
- **Daily winrate** is `wins / (wins + losses)`; break-even trades are excluded
  from both the numerator and denominator.
- **Practice trades**: entering `0` as Win/Loss on purpose marks a trade as
  practice (no real SOL was at stake), regardless of what Entry/Out say. A
  practice trade still shows up in the trade count, but it's excluded from
  wins/losses/winrate, tagged with a "Practice" badge on its card, and the AI
  Trade Summary is told which trades are practice so it doesn't score them
  like real ones.
- **Watchlist notes** (beside the trade list) are for coins you noticed but
  never actually traded — separate from both Trade records and the global
  Notepad. They're included in the AI Trade Summary's context too, but only
  ever as background, never as if they were a trade with a result.

## Project structure

```text
app/
  layout.tsx        Root layout, fonts, global styles
  page.tsx           Top-level state: trades, coin notes, calendar mode/month, selected date
  globals.css        Design tokens (CSS variables) + Tailwind layers
  api/
    trade-summary/    Server route: calls the Gemini API, key never reaches the client

components/
  calendar/          Month grid, day cell, PNL/Winrate toggle, trading-reminder modal
  trades/            Daily trade list (2-row cards: CA/Coin/Why, then
                     Entry/Out/Win-Loss/+/Delete), market-cap/CA/coin-name/
                     win-loss fields, watchlist notes panel, stats bar,
                     Trade Summary (AI journal analyst panel)
  notepad/           Collapsible rich-text notepad + toolbar
  layout/            Header, empty state
  ui/                Small shared primitives (Button, Input)

lib/
  types.ts           Trade / CoinNote / DailyStats / CalendarMode / trade-summary types
  calculations.ts    Pure functions: formatting, trade result, daily/period stats,
                     practice-trade detection, dates, week/month ranges, staleness hashing
  storage.ts         localStorage read/write, isolated behind a small API
                     (trades, coin notes, notepad, and the AI summary cache)
```

`lib/storage.ts` is the only place that touches `localStorage`, so swapping in a
real database later just means rewriting that one file.

### How the Trade Summary caches AI results

Each period (a day, one of the four fixed weeks in a month, or the previous
month) has a cache entry keyed by that period plus a hash of the trades *and*
watchlist notes in it. Switching tabs re-uses the cached result instantly; a
summary is only regenerated when a trade or note in that exact period is
added, edited, or deleted (so the hash changes) — never on every tab click,
and never for unrelated periods. A failed API call never deletes an existing
cached summary.

## Notes

- Dark mode only, by design — no theme switcher.
- No live prices, wallet connections, exchange integrations, authentication, or
  charts — this is intentionally just a personal journal.

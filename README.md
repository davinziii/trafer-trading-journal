# Trafer — Crypto Trading Journal

A simple personal crypto trading journal for reviewing trades, tracking performance, and improving decision-making over time.

Trafer provides a monthly trading calendar with daily PNL and winrate, a per-day trade journal, AI-powered Trade Summaries, and a collapsible rich-text notepad.

Built with **Next.js (App Router), React, TypeScript, and Tailwind CSS**. Trade journal data, notes, and cached AI summaries are stored locally in the browser using `localStorage`.

## Features

* Monthly trading calendar
* Daily PNL and winrate views
* Per-day trade journal
* Market-cap based Entry / Out tracking
* Automatic Win/Loss calculation
* Daily trading statistics
* AI-generated Trade Summaries

  * Daily analysis
  * Weekly analysis
  * Previous-month analysis
  * Identifies strengths, mistakes, and recurring patterns
* Cached AI summaries to avoid unnecessary API calls
* Collapsible rich-text notepad
* Persistent browser storage
* Dark-mode interface

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the development server

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

---

## Enabling AI Trade Summaries

Trafer uses the **Gemini API** to generate Trade Summaries.

The API request is handled through a server-side Next.js route, keeping the Gemini API key out of the client-side application.

### 1. Create your environment file

Copy the example environment file:

```bash
cp .env.example .env.local
```

Then open `.env.local` and add your API key:

```env
GEMINI_API_KEY=your-key
```

**Never commit `.env.local` or your actual API key to Git.**

The `.env.example` file should only contain a placeholder:

```env
GEMINI_API_KEY=
```

### 2. Get a Gemini API key

Get your API key from:

https://aistudio.google.com/apikey

### 3. Restart the development server

After adding or changing the API key:

```bash
npm run dev
```

If no Gemini API key is configured, the rest of the application still works normally. Only the AI Trade Summary feature will be unavailable.

---

## How Trading Numbers Work

Trafer intentionally separates **market-cap movement** from **actual PNL**.

### Entry / Out

**Entry** and **Out** represent the coin's market cap at the time of entry and exit.

They are **not** the amount of money invested or returned.

For example:

```text
Entry: $27K
Out:   $62K
```

These values are used to determine whether the trade was profitable.

### Win/Loss

The **Win/Loss** field is the absolute amount of SOL associated with the trade.

For example:

```text
3
```

The application determines the sign automatically.

```text
Out > Entry  → +3 SOL
Out < Entry  → -3 SOL
Out = Entry  →  0 SOL
```

The stored `winLoss` value remains positive. The signed result is calculated dynamically.

### Daily PNL

Daily PNL is the sum of all calculated trade results for that day.

For example:

```text
+3 SOL
-1.5 SOL
+2 SOL
────────
+3.5 SOL
```

### Daily Winrate

Winrate is calculated as:

```text
wins / (wins + losses)
```

Break-even trades are excluded from the calculation.

For example:

```text
2 wins
1 loss
1 break-even

Winrate = 2 / 3 = 66.7%
```

---

## AI Trade Summary

The Trade Summary acts as a journal analyst rather than a market prediction tool.

It analyzes the information recorded in the journal, including:

* Why I picked it
* Entry market cap
* Out market cap
* Trade result
* Daily/weekly performance
* Repeated behaviors and patterns

The AI can highlight:

* What was done well
* What went wrong
* Possible decision-making mistakes
* What could have been done differently
* Repeated trading patterns
* Areas to focus on improving

The AI does **not** calculate PNL from market-cap movement. It uses the application's existing trade calculations as the source of truth.

### Summary Periods

The Trade Summary supports:

```text
This Day
Week 1
Week 2
Week 3
Week 4
Previous Month
```

The four weekly periods are fixed within the selected calendar month:

```text
Week 1 → Days 1–7
Week 2 → Days 8–14
Week 3 → Days 15–21
Week 4 → Day 22 through the end of the month
```

There is no Week 5.

The **Previous Month** summary automatically refers to the calendar month immediately before the selected month.

For example:

```text
October → Previous Month = September
November → Previous Month = October
```

Historical trade data is never deleted when the Previous Month period changes.

---

## AI Summary Caching

AI summaries are cached locally to avoid unnecessary API requests.

Each summary is associated with its specific period and the underlying trade data.

For example:

```text
Day:
2026-09-17

Week:
2026-09-week-3

Previous Month:
2026-08
```

When the underlying trades have not changed, the existing cached summary is reused instead of making another API request.

A summary becomes stale when the relevant trades are:

* Added
* Edited
* Deleted
* Have their reasoning changed
* Have their Entry changed
* Have their Out changed
* Have their Win/Loss changed

Only affected summaries need to be regenerated.

A failed AI request does not remove an existing cached summary.

---

## Project Structure

```text
app/
├── layout.tsx              Root layout, fonts, and global configuration
├── page.tsx                Top-level application state
├── globals.css             Design tokens and global styles
└── api/
    └── trade-summary/
        └── route.ts        Server route for Gemini API requests

components/
├── calendar/
│   ├── Month grid
│   ├── Day cells
│   └── PNL / Winrate toggle
│
├── trades/
│   ├── Daily trade table
│   ├── Trade rows
│   ├── Market-cap fields
│   ├── Daily statistics
│   └── AI Trade Summary
│
├── notepad/
│   ├── Rich-text editor
│   └── Formatting toolbar
│
├── layout/
│   ├── Header
│   └── Empty states
│
└── ui/
    └── Shared UI primitives

lib/
├── types.ts
│   Trade, DailyStats, CalendarMode,
│   and Trade Summary types
│
├── calculations.ts
│   Formatting, trade results, daily statistics,
│   date calculations, week/month ranges,
│   period statistics, and summary hashing
│
└── storage.ts
    Centralized localStorage persistence for:
    - Trades
    - Notepad
    - AI summary cache
```

`lib/storage.ts` is the application's persistence layer. Keeping browser storage isolated there makes it easier to replace `localStorage` with a database such as Supabase or PostgreSQL in the future.

---

## Data Storage

Trafer currently stores application data locally in the browser using `localStorage`.

This includes:

* Trade records
* Notepad content
* Cached AI summaries

No account or backend database is required for the core journal.

Because the data is stored locally, clearing the browser's site data can remove the journal data.

---

## Design

* Dark mode only
* Desktop-first interface
* Minimal and focused UI
* Collapsible panels
* Responsive trade table
* No unnecessary dashboards or visualizations

---

## What Trafer Does Not Include

Trafer intentionally does not include:

* Live cryptocurrency prices
* Wallet connections
* Exchange integrations
* Trade execution
* Authentication
* Social features
* Automated trading
* News feeds
* Price prediction
* Trading signals
* Charts

The goal is to keep Trafer focused on one thing:

**recording trades and learning from them.**

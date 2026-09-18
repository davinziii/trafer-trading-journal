import { DailyStats, PeriodStats, RequiredField, SummaryRequestTrade, Trade } from "./types";

/* ---------------------------------- formatting ---------------------------------- */

/** Formats a raw market-cap number into a compact display string, e.g. 27000 -> "$27K". */
export function formatMarketCap(value: number): string {
  const n = Number(value);
  if (!isFinite(n)) return "";
  const trim = (x: number) => {
    const r = Math.round(x * 10) / 10;
    return String(r);
  };
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return "$" + trim(n / 1_000_000) + "M";
  if (abs >= 1_000) return "$" + trim(n / 1_000) + "K";
  return "$" + trim(n);
}

/** Formats a signed SOL amount, e.g. 3.5 -> "+3.5 SOL", -2 -> "-2 SOL", 0 -> "0 SOL". */
export function formatSol(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const abs = Math.abs(rounded);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
  return `${sign}${abs} SOL`;
}

/** Formats a 0-100 percentage, trimming to one decimal only when needed. */
export function formatPercent(pct: number | null): string | null {
  if (pct === null) return null;
  const rounded = Math.round(pct * 10) / 10;
  return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)) + "%";
}

/** Truncates a long address/CA into a compact "first4...last4" form for display. */
export function truncateAddress(value: string): string {
  const v = value.trim();
  if (v.length <= 11) return v;
  return `${v.slice(0, 4)}...${v.slice(-4)}`;
}

/**
 * Entry/Out market caps are always in the thousands, so a bare small number
 * is assumed to be shorthand for that: typing 48.6 means $48.6K (48600),
 * same as typing 48600 directly. Anything already 1000 or larger is treated
 * as the literal market cap, so 48600 and 1200000 aren't touched.
 */
export function interpretMarketCapInput(raw: number): number {
  if (!isFinite(raw) || raw <= 0) return 0;
  return raw < 1000 ? raw * 1000 : raw;
}

/** Tailwind text-color utility class for a signed SOL amount. */
export function solColorClass(amount: number): string {
  if (amount > 0) return "text-win";
  if (amount < 0) return "text-loss";
  return "text-neutral";
}

/* ---------------------------------- trade math ---------------------------------- */

/**
 * The signed result of a single trade, derived from entry/out/winLoss.
 * Never persisted — always recomputed so edits to entry/out stay consistent.
 */
export function tradeResult(trade: Pick<Trade, "entry" | "out" | "winLoss">): number {
  const { entry, out, winLoss } = trade;
  if (!isFinite(entry) || !isFinite(out) || !isFinite(winLoss)) return 0;
  if (out > entry) return winLoss;
  if (out < entry) return -winLoss;
  return 0;
}

export type Outcome = "win" | "loss" | "even";

export function tradeOutcome(trade: Pick<Trade, "entry" | "out">): Outcome {
  if (trade.out > trade.entry) return "win";
  if (trade.out < trade.entry) return "loss";
  return "even";
}

/** Whether a trade has all required fields validly filled in. */
export function isTradeStructurallyComplete(t: Trade): boolean {
  return (
    t.ca.trim() !== "" &&
    t.coinName.trim() !== "" &&
    t.reason.trim() !== "" &&
    isFinite(t.entry) &&
    t.entry > 0 &&
    isFinite(t.out) &&
    t.out > 0 &&
    !!t.winLossTouched &&
    isFinite(t.winLoss) &&
    t.winLoss >= 0
  );
}

/** Returns the list of required fields that are still missing/invalid on a trade. */
export function getMissingFields(t: Trade): RequiredField[] {
  const missing: RequiredField[] = [];
  if (t.ca.trim() === "") missing.push("ca");
  if (t.coinName.trim() === "") missing.push("coinName");
  if (t.reason.trim() === "") missing.push("reason");
  if (!isFinite(t.entry) || t.entry <= 0) missing.push("entry");
  if (!isFinite(t.out) || t.out <= 0) missing.push("out");
  if (!t.winLossTouched || !isFinite(t.winLoss) || t.winLoss < 0) missing.push("winLoss");
  return missing;
}

/** Aggregates a day's trades into PNL + winrate stats. Break-even trades are excluded from winrate. */
export function computeDailyStats(dayTrades: Trade[]): DailyStats {
  const complete = dayTrades.filter(isTradeStructurallyComplete);
  let pnl = 0;
  let wins = 0;
  let completed = 0;

  for (const t of complete) {
    pnl += tradeResult(t);
    const outcome = tradeOutcome(t);
    if (outcome === "win") {
      wins++;
      completed++;
    } else if (outcome === "loss") {
      completed++;
    }
  }

  const pct = completed > 0 ? (wins / completed) * 100 : null;
  return { pnl, wins, completed, pct, tradeCount: complete.length };
}

/* ---------------------------------- dates ---------------------------------- */

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Builds a local "YYYY-MM-DD" key from a year/month(0-based)/day, avoiding timezone shifts. */
export function toDateKey(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** "2026-09-17" -> "September 17, 2026" */
export function formatLongDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function makeId(): string {
  return "t_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

/* ---------------------------------- trade summary periods ---------------------------------- */

export type WeekRange = {
  index: 1 | 2 | 3 | 4;
  label: string;
  startDay: number;
  endDay: number;
  startKey: string;
  endKey: string;
};

/**
 * Splits a calendar month into exactly 4 fixed week ranges (1–7, 8–14,
 * 15–21, 22–end), per the app's Trade Summary definition — not rolling
 * 7-day periods. Week 4 always absorbs whatever days remain in the month.
 */
export function getWeekRanges(year: number, month: number): WeekRange[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const bounds: [number, number][] = [
    [1, 7],
    [8, 14],
    [15, 21],
    [22, daysInMonth],
  ];
  return bounds.map(([startDay, endDay], i) => ({
    index: (i + 1) as 1 | 2 | 3 | 4,
    label: `Week ${i + 1}`,
    startDay,
    endDay,
    startKey: toDateKey(year, month, startDay),
    endKey: toDateKey(year, month, endDay),
  }));
}

/** The calendar month immediately before the given one, handling year rollover. */
export function getPreviousMonth(year: number, month: number): { year: number; month: number } {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
}

/** Trades whose date falls within [startKey, endKey] inclusive. Date keys sort lexicographically. */
export function tradesInRange(trades: Trade[], startKey: string, endKey: string): Trade[] {
  return trades.filter((t) => t.date >= startKey && t.date <= endKey);
}

export function tradesInMonth(trades: Trade[], year: number, month: number): Trade[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return tradesInRange(trades, toDateKey(year, month, 1), toDateKey(year, month, daysInMonth));
}

/**
 * Aggregates any set of trades into the fuller stats the Trade Summary
 * needs (wins/losses/break-even split out, rather than the calendar's
 * simpler DailyStats). Built entirely on the existing tradeResult /
 * tradeOutcome / isTradeStructurallyComplete logic above — no separate
 * PNL or win-rate calculation is introduced.
 */
export function computePeriodStats(periodTrades: Trade[]): PeriodStats {
  const complete = periodTrades.filter(isTradeStructurallyComplete);
  let wins = 0;
  let losses = 0;
  let breakEven = 0;
  let pnl = 0;

  for (const t of complete) {
    pnl += tradeResult(t);
    const outcome = tradeOutcome(t);
    if (outcome === "win") wins++;
    else if (outcome === "loss") losses++;
    else breakEven++;
  }

  const decided = wins + losses;
  const winratePct = decided > 0 ? (wins / decided) * 100 : null;
  return { trades: complete.length, wins, losses, breakEven, winratePct, pnl };
}

/**
 * A cheap, stable fingerprint of the fields that would change what an AI
 * summary should say. Used purely to detect staleness so a cached summary
 * can be reused — never for display, and no relation to a trade's id.
 */
export function hashTrades(periodTrades: Trade[]): string {
  const normalized = periodTrades
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((t) => [t.id, t.date, t.coinName, t.reason, t.entry, t.out, t.winLoss, !!t.winLossTouched].join("|"))
    .join("~");

  let h = 0;
  for (let i = 0; i < normalized.length; i++) {
    h = (h * 31 + normalized.charCodeAt(i)) | 0;
  }
  return `${h >>> 0}:${normalized.length}`;
}

/**
 * Maps trades into the compact, structured shape sent to the AI — only
 * structurally-complete trades, with the result/outcome already computed
 * by the existing trade-math above so the AI never recalculates PNL itself.
 */
export function toSummaryRequestTrades(periodTrades: Trade[]): SummaryRequestTrade[] {
  return periodTrades
    .filter(isTradeStructurallyComplete)
    .map((t) => ({
      date: t.date,
      coinName: t.coinName,
      reason: t.reason,
      entry: t.entry,
      out: t.out,
      winLoss: t.winLoss,
      result: tradeResult(t),
      outcome: tradeOutcome(t),
    }));
}

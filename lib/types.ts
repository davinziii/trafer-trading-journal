export type Trade = {
  id: string;
  /** ISO date key, e.g. "2026-09-17" */
  date: string;

  ca: string;
  coinName: string;
  reason: string;

  /** Market cap when the trade was entered. */
  entry: number;
  /** Market cap when the trade was exited. */
  out: number;

  /** Absolute amount of SOL gained or lost, as entered by the user. */
  winLoss: number;
  /** Whether the user has actually interacted with the Win/Loss field. */
  winLossTouched?: boolean;
};

export type CalendarMode = "pnl" | "winrate";

export type DailyStats = {
  /** Signed daily PNL in SOL. */
  pnl: number;
  wins: number;
  completed: number;
  /** Win percentage 0-100, or null when there are no completed trades. */
  pct: number | null;
  /** Number of structurally complete trades for the day. */
  tradeCount: number;
};

export type RequiredField = "ca" | "coinName" | "reason" | "entry" | "out" | "winLoss";

/* ---------------------------------- trade summary (AI) ---------------------------------- */

export type SummaryPeriodType = "day" | "week" | "month";

/** Aggregate stats for an arbitrary set of trades (a day, a week, or a month). */
export type PeriodStats = {
  trades: number;
  wins: number;
  losses: number;
  breakEven: number;
  /** Win percentage over decided (non-break-even) trades, or null if none. */
  winratePct: number | null;
  pnl: number;
};

/** The structured content an AI-generated trade summary is rendered from. */
export type TradeSummaryContent = {
  overview: string;
  performance: PeriodStats;
  whatWentWell: string[];
  whatWentWrong: string[];
  /** "What I Should Have Done" (day) / "Next Week Focus" (week) / "Areas to Improve" (month). */
  recommendations: string[];
  /** Week/month only — left empty for a single day. */
  bestDecisions: string[];
  patterns: string;
};

/** A single trade as sent to the AI: only what it needs, already-calculated result included. */
export type SummaryRequestTrade = {
  date: string;
  coinName: string;
  reason: string;
  entry: number;
  out: number;
  winLoss: number;
  result: number;
  outcome: "win" | "loss" | "even";
};

export type SummaryRequestPayload = {
  period: SummaryPeriodType;
  label: string;
  trades: SummaryRequestTrade[];
  performance: PeriodStats;
};

export type SummaryCacheEntry = {
  /** Hash of the underlying trade data this summary was generated from, for staleness checks. */
  hash: string;
  content: TradeSummaryContent;
  generatedAt: string;
};

/** Keyed by period id, e.g. "day:2026-09-17", "week:2026-09:3", "month:2026-09". */
export type SummaryCache = Record<string, SummaryCacheEntry>;

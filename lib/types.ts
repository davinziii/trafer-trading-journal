export type Trade = {
  id: string;
  /** ISO date key, e.g. "2026-09-17" */
  date: string;

  /** Contract address — optional. */
  ca: string;
  /**
   * The chain the CA was resolved to, once validated:
   * - "solana": detected automatically from address shape (43-44 chars).
   * - "bsc" / "robinhood": both use the same 42-char "0x..." shape, so these
   *   are only ever set from the user's answer in the chain-picker modal.
   * Drives both the dexscreener link and the Win/Loss currency (SOL/BNB/ETH).
   * Cleared back to undefined whenever the CA becomes empty or invalid.
   */
  caChain?: "solana" | "bsc" | "robinhood";
  /**
   * Whether the "remember this for this coin" box was checked when caChain
   * was last set for an EVM-style address. If false, the chain-picker modal
   * asks again the next time this trade's CA field is validated (blurred),
   * even though caChain is already set — so the answer above is used for
   * "right now" but isn't treated as durable until the user opts in.
   */
  caChainRemembered?: boolean;
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

/** The three currencies a trade's Win/Loss can be in, based on its CA's chain. */
export type Currency = "SOL" | "BNB" | "ETH";

/**
 * Signed PNL summed per currency. A currency key is present if and only if
 * at least one completed trade in the period used that currency — so a
 * trader who only ever trades Solana coins only ever sees "SOL", never a
 * "0 BNB" / "0 ETH" they never touched.
 */
export type CurrencyPnl = Partial<Record<Currency, number>>;

export type DailyStats = {
  /** Signed daily PNL, split per currency actually traded that day. */
  pnl: CurrencyPnl;
  wins: number;
  completed: number;
  /** Win percentage 0-100, or null when there are no completed trades. */
  pct: number | null;
  /** Number of structurally complete trades for the day. */
  tradeCount: number;
  /** Trades logged with 0 SOL win/loss on purpose — excluded from wins/completed. */
  practiceCount: number;
};

// "ca" (contract address) is intentionally not in here — it's optional on a trade.
export type RequiredField = "coinName" | "reason" | "entry" | "out" | "winLoss";

/**
 * A note about a coin the trader watched or considered but never actually
 * traded — separate from both Trade (a real entry/exit) and the free-form
 * global Notepad. Scoped per day, same as Trade.
 */
export type CoinNote = {
  id: string;
  /** ISO date key, e.g. "2026-09-17" */
  date: string;
  ca: string;
  coinName: string;
  note: string;
};

/* ---------------------------------- trade summary (AI) ---------------------------------- */

export type SummaryPeriodType = "day" | "week" | "month";

/** Aggregate stats for an arbitrary set of trades (a day, a week, or a month). */
export type PeriodStats = {
  trades: number;
  wins: number;
  losses: number;
  breakEven: number;
  /** Trades logged with 0 SOL win/loss on purpose — excluded from wins/losses. */
  practice: number;
  /** Win percentage over decided (non-break-even, non-practice) trades, or null if none. */
  winratePct: number | null;
  /** Signed PNL, split per currency actually traded in the period. */
  pnl: CurrencyPnl;
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
  /** Which currency winLoss/result are in — depends on the coin's chain (SOL/BNB/ETH). */
  currency: Currency;
  result: number;
  outcome: "win" | "loss" | "even";
  /** True when the trader logged this as a 0 SOL practice trade — no real stake. */
  isPractice: boolean;
};

/** A watched-but-not-traded coin, as sent to the AI. Never has a result/outcome. */
export type SummaryRequestNote = {
  date: string;
  coinName: string;
  ca?: string;
  note: string;
};

export type SummaryRequestPayload = {
  period: SummaryPeriodType;
  label: string;
  trades: SummaryRequestTrade[];
  performance: PeriodStats;
  /** Coins watched/considered but not traded in this period. May be empty. */
  notes: SummaryRequestNote[];
};

export type SummaryCacheEntry = {
  /** Hash of the underlying trade data this summary was generated from, for staleness checks. */
  hash: string;
  content: TradeSummaryContent;
  generatedAt: string;
};

/** Keyed by period id, e.g. "day:2026-09-17", "week:2026-09:3", "month:2026-09". */
export type SummaryCache = Record<string, SummaryCacheEntry>;

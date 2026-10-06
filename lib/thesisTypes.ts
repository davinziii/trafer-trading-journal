/**
 * Types for the /thesis page. Deliberately separate from lib/types.ts so
 * thesis records can never be confused with real journal Trades — they have
 * their own storage key, their own cache, and their own calendar data.
 */

export const STRATEGY_ID = "mins-after-migration";
export const STRATEGY_LABEL = "Mins after migration strat";

/** Suggestions only — TYPE is free text and is never classified automatically. */
export const TYPE_SUGGESTIONS = ["CTO", "AI", "Meme", "Animal", "Celebrity", "Meta", "Community", "Other"];

/** Minutes after the entry snapshot at which the market is observed. */
export const HOLD_MINUTES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type HoldMinute = (typeof HOLD_MINUTES)[number];
export type SnapshotKey = `${HoldMinute}m`;

/** Which DexScreener field the market cap came from. fdv is only a fallback. */
export type MarketCapSource = "marketCap" | "fdv";

export type MissReason =
  /** The tab wasn't open/running when the snapshot was due (and DexScreener has no history to backfill). */
  | "window-elapsed"
  /** The snapshot was due, but every fetch attempt inside its window failed. */
  | "fetch-failed";

export type ThesisSnapshot = {
  /** When this snapshot was scheduled to be taken (entryTimestamp + N min). ISO. */
  dueAt: string;
  /** When the data was actually fetched. ISO. Absent if the slot was missed. */
  timestamp?: string;
  /** timestamp - dueAt, in ms. Lets analysis discount late captures later. */
  driftMs?: number;
  /** Raw USD price at capture time. */
  price?: number;
  /** Raw market cap at capture time (same DexScreener field as the entry). */
  marketCap?: number;
  marketCapSource?: MarketCapSource;
  /**
   * Cached PNL % at capture time. Always recomputable from raw values —
   * code reads it through snapshotPnl(), never directly.
   */
  pnl?: number;
  /** Set when the slot closed without data. Never "filled in" with a guess. */
  missed?: MissReason;
};

/** A trimmed copy of each DexScreener pair seen at entry — kept so timing can be recomputed later. */
export type PairBrief = {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseAddress: string;
  /** ms epoch, straight from DexScreener's pairCreatedAt. */
  pairCreatedAt?: number;
  liquidityUsd?: number;
  marketCap?: number;
  fdv?: number;
  priceUsd?: number;
  labels?: string[];
};

/**
 * How pre-migration age was derived. The UI always labels the field
 * "Pre-Migration Age"; this says how trustworthy that number is.
 * - "migration-timestamp": migrationAt − tokenCreatedAt, both from DexScreener pairs.
 * - "assumed-delay": token age at entry − the POST-MIGRATION TIME the user entered. Approximation;
 *   N/A until the user has entered that time.
 * - "creation-unknown": token looks migrated but its pre-migration pair isn't visible, so
 *   the age can't be known. Shown as N/A — never as 0m.
 * - "unknown": no usable timestamps at all.
 */
export type PreMigrationBasis = "migration-timestamp" | "assumed-delay" | "creation-unknown" | "unknown";

export type EntryTiming = {
  tokenCreatedAt?: string;
  migrationAt?: string;
  /** now(at entry) − tokenCreatedAt, ms. */
  tokenAgeAtEntryMs?: number;
  /**
   * Pre-migration age in ms, clamped at 0 — only set when a real migration timestamp was found.
   * For the "assumed-delay" basis it depends on the user's POST-MIGRATION TIME, so it's derived on
   * demand by resolvePreMigrationAgeMs() rather than stored.
   */
  preMigrationAgeMs?: number;
  preMigrationBasis: PreMigrationBasis;
  /** entry − migrationAt in ms, when a migration timestamp is known (measured, approximate). */
  msSinceMigrationAtEntry?: number;
};

export type ThesisEntry = {
  id: string;
  strategyId: string;
  /** Local ISO date key (YYYY-MM-DD) the entry was recorded on — drives the calendar. */
  date: string;

  contractAddress: string;
  chainId: string;
  /** The DexScreener pair used for the entry snapshot AND every later snapshot. */
  pairAddress: string;
  dexId?: string;

  ticker: string;
  name?: string;
  /** Manually entered by the user. Never auto-classified. */
  type: string;
  /**
   * POST-MIGRATION TIME: minutes after migration at which the user entered. Manually entered
   * (the strategy's variable). If blank, the measured value (msSinceMigrationAtEntry) is used
   * when DexScreener provided one.
   */
  postMigrationMins?: number;
  /** Free-text notes the user adds per coin. */
  notes?: string;

  // Token timing (see EntryTiming). Raw inputs are kept in pairsAtEntry.
  tokenCreatedAt?: string;
  migrationAt?: string;
  tokenAgeAtEntryMs?: number;
  preMigrationAgeMs?: number;
  preMigrationBasis: PreMigrationBasis;
  msSinceMigrationAtEntry?: number;
  pairsAtEntry: PairBrief[];

  // Entry snapshot — IMMUTABLE after creation.
  entryPrice?: number;
  entryMarketCap: number;
  entryMarketCapSource: MarketCapSource;
  entryLiquidityUsd?: number;
  /** ISO, client clock at the moment the lookup response arrived. All due times derive from this. */
  entryTimestamp: string;
  /** ms epoch from the server at fetch time — the clock token age was measured against. */
  entryServerTime: number;

  /** Keyed "1m".."10m". A key is present once the slot is resolved (captured or missed). */
  snapshots: Partial<Record<SnapshotKey, ThesisSnapshot>>;

  createdAt: string;
  /** Set once all 10 slots are resolved. */
  completedAt?: string;
};

export type HighestPnl = {
  percentage: number;
  minute: number;
  /** How many of the 10 snapshots actually had a usable PNL. */
  capturedCount: number;
  /** True when fewer than 10 snapshots were captured, so the peak may be understated. */
  partial: boolean;
};

/* ------------------------------ API contracts ------------------------------ */

export type TokenLookup = {
  ca: string;
  chainId: string;
  pairAddress: string;
  dexId: string;
  ticker: string;
  name?: string;
  price?: number;
  marketCap: number;
  marketCapSource: MarketCapSource;
  liquidityUsd?: number;
  pairs: PairBrief[];
  /** Server clock (ms epoch) at the moment DexScreener was queried. */
  fetchedAt: number;
};

export type PairQuote = {
  price?: number;
  marketCap?: number;
  marketCapSource?: MarketCapSource;
  liquidityUsd?: number;
  fetchedAt: number;
};

export type ApiErrorCode =
  | "invalid_address"
  | "not_found"
  | "no_market_cap"
  | "rate_limited"
  | "upstream_error"
  | "network_error"
  | "timeout";

export type ApiFailure = { ok: false; error: ApiErrorCode; message: string };
export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

/* ------------------------------ AI summary ------------------------------ */

export type ThesisSummaryScope = "day" | "all";

export type ThesisSummaryContent = {
  overview: string;
  /** Plain facts, every number copied from the supplied stats. */
  observed: string[];
  working: string[];
  failing: string[];
  winnerTraits: string[];
  loserTraits: string[];
  /** Interpretation — explicitly hedged. */
  interpretation: string[];
  improvements: string[];
  /** Suggested hypotheses to test next. */
  hypotheses: string[];
  caveats: string;
  /** Numbers in the AI's text that could not be matched to the supplied stats. Empty = all verified. */
  unverifiedNumbers?: string[];
};

export type ThesisSummaryCacheEntry = {
  hash: string;
  content: ThesisSummaryContent;
  generatedAt: string;
};

/** Keyed "day:2026-10-06" or "all". */
export type ThesisSummaryCache = Record<string, ThesisSummaryCacheEntry>;

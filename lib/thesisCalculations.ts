import { toDateKey } from "./calculations";
import { computeEntryTiming } from "./dexscreener";
import {
  HOLD_MINUTES,
  HighestPnl,
  HoldMinute,
  PairQuote,
  SnapshotKey,
  STRATEGY_ID,
  ThesisEntry,
  ThesisSnapshot,
  TokenLookup,
} from "./thesisTypes";

/* ---------------------------------- ids / keys ---------------------------------- */

export function makeThesisId(): string {
  return "th_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

export function snapshotKey(minute: HoldMinute): SnapshotKey {
  return `${minute}m` as SnapshotKey;
}

/* ---------------------------------- PNL ---------------------------------- */

/** PNL % = ((marketCapAtTime / entryMarketCap) − 1) × 100 */
export function computePnl(entryMarketCap: number, marketCapAtTime: number): number | undefined {
  if (!isFinite(entryMarketCap) || entryMarketCap <= 0) return undefined;
  if (!isFinite(marketCapAtTime) || marketCapAtTime <= 0) return undefined;
  return (marketCapAtTime / entryMarketCap - 1) * 100;
}

/**
 * PNL for one snapshot, recomputed from the raw numbers (the cached `pnl` field is never
 * trusted). Returns undefined — never a guess — when the slot is missed, has no market cap,
 * or its market-cap source differs from the entry's (marketCap vs fdv aren't comparable).
 */
export function snapshotPnl(entry: ThesisEntry, snap: ThesisSnapshot | undefined): number | undefined {
  if (!snap || snap.missed || snap.marketCap === undefined) return undefined;
  if (snap.marketCapSource && snap.marketCapSource !== entry.entryMarketCapSource) return undefined;
  return computePnl(entry.entryMarketCap, snap.marketCap);
}

export function pnlAt(entry: ThesisEntry, minute: HoldMinute): number | undefined {
  return snapshotPnl(entry, entry.snapshots[snapshotKey(minute)]);
}

/* ---------------------------------- scheduling (timestamp-driven) ---------------------------------- */

/**
 * How late a capture may be and still count as "the N-minute snapshot". After this the slot
 * is closed as missed: DexScreener's free API has no price history, so a late fetch would be
 * the price NOW, not the price at minute N. Keep below 60s so windows never overlap.
 */
export const CAPTURE_WINDOW_MS = 30_000;

export function dueTimeMs(entry: ThesisEntry, minute: HoldMinute): number {
  return Date.parse(entry.entryTimestamp) + minute * 60_000;
}

export function isResolved(entry: ThesisEntry, minute: HoldMinute): boolean {
  return entry.snapshots[snapshotKey(minute)] !== undefined;
}

export function isComplete(entry: ThesisEntry): boolean {
  return HOLD_MINUTES.every((m) => isResolved(entry, m));
}

export type SlotState = "captured" | "missed" | "capturing" | "pending";

/** UI state for one slot, from timestamps only (never from "how many timer ticks happened"). */
export function slotState(entry: ThesisEntry, minute: HoldMinute, nowMs: number): SlotState {
  const snap = entry.snapshots[snapshotKey(minute)];
  if (snap) return snap.missed ? "missed" : "captured";
  return nowMs >= dueTimeMs(entry, minute) ? "capturing" : "pending";
}

export type TrackingPlan = {
  /** Slots that are due and still inside their capture window. */
  capture: HoldMinute[];
  /** Slots that are due, unresolved, and past their window — to be closed as missed. */
  miss: HoldMinute[];
};

/**
 * Decides, purely from `nowMs` and the entry's own timestamps, what should happen next.
 * This is why a throttled background tab (or a tab that comes back after 6 minutes) behaves
 * correctly: every unresolved slot is classified by how overdue it is.
 */
export function planTracking(entry: ThesisEntry, nowMs: number, windowMs = CAPTURE_WINDOW_MS): TrackingPlan {
  const capture: HoldMinute[] = [];
  const miss: HoldMinute[] = [];
  for (const m of HOLD_MINUTES) {
    if (isResolved(entry, m)) continue;
    const late = nowMs - dueTimeMs(entry, m);
    if (late < 0) continue;
    if (late <= windowMs) capture.push(m);
    else miss.push(m);
  }
  return { capture, miss };
}

/** Applies a successful quote to one slot. Pure — returns a new entry. */
export function withCapturedSnapshot(
  entry: ThesisEntry,
  minute: HoldMinute,
  quote: PairQuote,
  capturedAtMs: number
): ThesisEntry {
  const key = snapshotKey(minute);
  if (entry.snapshots[key]) return entry; // already resolved (e.g. by another tab) — never overwrite
  const dueAt = dueTimeMs(entry, minute);
  const snap: ThesisSnapshot = {
    dueAt: new Date(dueAt).toISOString(),
    timestamp: new Date(capturedAtMs).toISOString(),
    driftMs: capturedAtMs - dueAt,
    price: quote.price,
    marketCap: quote.marketCap,
    marketCapSource: quote.marketCapSource,
    pnl: quote.marketCap !== undefined ? computePnl(entry.entryMarketCap, quote.marketCap) : undefined,
  };
  return markCompleteIfDone({ ...entry, snapshots: { ...entry.snapshots, [key]: snap } }, capturedAtMs);
}

export function withMissedSnapshot(
  entry: ThesisEntry,
  minute: HoldMinute,
  reason: "window-elapsed" | "fetch-failed",
  nowMs: number
): ThesisEntry {
  const key = snapshotKey(minute);
  if (entry.snapshots[key]) return entry;
  const snap: ThesisSnapshot = { dueAt: new Date(dueTimeMs(entry, minute)).toISOString(), missed: reason };
  return markCompleteIfDone({ ...entry, snapshots: { ...entry.snapshots, [key]: snap } }, nowMs);
}

function markCompleteIfDone(entry: ThesisEntry, nowMs: number): ThesisEntry {
  if (entry.completedAt || !isComplete(entry)) return entry;
  return { ...entry, completedAt: new Date(nowMs).toISOString() };
}

/* ---------------------------------- highest PNL ---------------------------------- */

export function capturedCount(entry: ThesisEntry): number {
  return HOLD_MINUTES.filter((m) => pnlAt(entry, m) !== undefined).length;
}

/**
 * Highest observed PNL across the 1–10 minute snapshots, and the minute it happened
 * (earliest minute wins ties). Returns undefined until every slot is resolved — "do not
 * calculate Highest PNL until enough data exists" — and also when no slot has usable data.
 */
export function highestPnl(entry: ThesisEntry): HighestPnl | undefined {
  if (!isComplete(entry)) return undefined;
  let best: { percentage: number; minute: number } | undefined;
  let count = 0;
  for (const m of HOLD_MINUTES) {
    const p = pnlAt(entry, m);
    if (p === undefined) continue;
    count++;
    if (!best || p > best.percentage) best = { percentage: p, minute: m };
  }
  if (!best) return undefined;
  return { ...best, capturedCount: count, partial: count < HOLD_MINUTES.length };
}

/* ---------------------------------- entry construction ---------------------------------- */

/**
 * Builds the immutable entry snapshot from a lookup. `clientNowMs` is the client clock when
 * the response arrived — every snapshot due time derives from it. Token age was already
 * measured against the server clock (lookup.fetchedAt), so a skewed local clock can't
 * corrupt the age numbers.
 */
export function buildEntry(
  lookup: TokenLookup,
  clientNowMs: number,
  initial: { postMigrationMins?: number; type?: string; notes?: string } = {}
): ThesisEntry {
  const timing = computeEntryTiming(lookup.pairs, lookup.ca, lookup.fetchedAt);
  const now = new Date(clientNowMs);
  return {
    id: makeThesisId(),
    strategyId: STRATEGY_ID,
    date: toDateKey(now.getFullYear(), now.getMonth(), now.getDate()),
    contractAddress: lookup.ca,
    chainId: lookup.chainId,
    pairAddress: lookup.pairAddress,
    dexId: lookup.dexId,
    ticker: lookup.ticker,
    name: lookup.name,
    type: initial.type?.trim() ?? "",
    postMigrationMins: initial.postMigrationMins,
    notes: initial.notes,
    ...timing,
    pairsAtEntry: lookup.pairs,
    entryPrice: lookup.price,
    entryMarketCap: lookup.marketCap,
    entryMarketCapSource: lookup.marketCapSource,
    entryLiquidityUsd: lookup.liquidityUsd,
    entryTimestamp: now.toISOString(),
    entryServerTime: lookup.fetchedAt,
    snapshots: {},
    createdAt: now.toISOString(),
  };
}

/* ---------------------------------- post-migration time / pre-migration age ---------------------------------- */

/** Parses what the user typed in a minutes field. Empty/invalid/negative → undefined (cleared). */
export function parseMins(raw: string): number | undefined {
  const n = parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 24 * 60 ? Math.round(n * 10) / 10 : undefined;
}

/**
 * POST-MIGRATION TIME for an entry: what the user typed, else the DexScreener-measured value
 * (flagged as such), else undefined. The user's number always wins.
 */
export function postMigrationTime(entry: ThesisEntry): { mins: number; source: "user" | "measured" } | undefined {
  if (entry.postMigrationMins !== undefined) return { mins: entry.postMigrationMins, source: "user" };
  if (entry.msSinceMigrationAtEntry !== undefined && entry.msSinceMigrationAtEntry >= 0) {
    return { mins: Math.round(entry.msSinceMigrationAtEntry / 6_000) / 10, source: "measured" };
  }
  return undefined;
}

/**
 * Pre-migration age in ms, derived from raw timestamps every time (never a stale cached string):
 *  - real migration timestamp → migrationAt − tokenCreatedAt (stored at entry);
 *  - otherwise → token age at entry − POST-MIGRATION TIME, clamped at 0 (changes when the user edits it);
 *  - otherwise undefined → shown as N/A. Never invented, never negative.
 */
export function resolvePreMigrationAgeMs(entry: ThesisEntry): number | undefined {
  if (entry.preMigrationBasis === "migration-timestamp") return entry.preMigrationAgeMs;
  if (entry.preMigrationBasis === "assumed-delay" && entry.tokenAgeAtEntryMs !== undefined) {
    const post = postMigrationTime(entry);
    if (!post) return undefined;
    return Math.max(0, entry.tokenAgeAtEntryMs - post.mins * 60_000);
  }
  return undefined;
}

/** Recomputes timing from the stored raw pairs — for when the inference logic improves. */
export function recomputeTiming(entry: ThesisEntry) {
  return computeEntryTiming(entry.pairsAtEntry, entry.contractAddress, entry.entryServerTime);
}

/* ---------------------------------- formatting ---------------------------------- */

/** Concise duration: 0m, 6m, 14m, 1h 12m. Rounds to the nearest minute. */
export function formatAge(ms: number | undefined): string {
  if (ms === undefined || !isFinite(ms)) return "N/A";
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Same thing from minutes (used by analysis labels). */
export function formatMinutes(min: number): string {
  return formatAge(min * 60_000);
}

/** POST-MIGRATION TIME display: "4m", "4.5m", "1h 5m". Undefined → "—". */
export function formatPostMins(mins: number | undefined): string {
  if (mins === undefined || !isFinite(mins)) return "—";
  if (mins >= 60) return formatAge(mins * 60_000);
  return `${Number.isInteger(mins) ? mins : mins.toFixed(1)}m`;
}

/** +500%, -35%, 0%. One decimal under 10%, none above; thousands separators. */
export function formatSignedPct(pct: number | undefined | null): string {
  if (pct === undefined || pct === null || !isFinite(pct)) return "—";
  const abs = Math.abs(pct);
  const rounded = abs < 10 ? Math.round(abs * 10) / 10 : Math.round(abs);
  if (rounded === 0) return "0%";
  const body = rounded.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return `${pct > 0 ? "+" : "-"}${body}%`;
}

/** Unsigned percent for rates (win rate etc.), 0–100 in → "63%". */
export function formatRate(rate: number | undefined | null): string {
  if (rate === undefined || rate === null || !isFinite(rate)) return "—";
  return `${Math.round(rate * 100)}%`;
}

/** Text-colour class for a PNL. Reuses the journal's existing win/loss/neutral tokens. */
export function pnlTextClass(pct: number | undefined | null): string {
  if (pct === undefined || pct === null || !isFinite(pct)) return "text-faint";
  const rounded = Math.abs(pct) < 10 ? Math.round(pct * 10) / 10 : Math.round(pct);
  if (rounded > 0) return "text-win";
  if (rounded < 0) return "text-loss";
  return "text-neutral";
}

/** Background + text classes for the Highest PNL pill. */
export function pnlPillClass(pct: number): string {
  if (pct > 0) return "bg-win/10 text-win";
  if (pct < 0) return "bg-loss/10 text-loss";
  return "bg-surface-3 text-neutral";
}

export function holdLabel(minute: number): string {
  return minute === 1 ? "1min" : `${minute}mins`;
}

/** Cheap stable string hash — used only to detect stale AI summaries. */
export function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `${h >>> 0}:${s.length}`;
}

/** Human explanation of how the Pre-Migration Age shown for an entry was derived. */
export function preMigrationNote(entry: ThesisEntry): string {
  switch (entry.preMigrationBasis) {
    case "migration-timestamp":
      return "Migration time inferred from DexScreener pair creation times (approximate): migration − token creation.";
    case "assumed-delay":
      return "No migration timestamp available. Approximation: token age at entry − POST-MIGRATION TIME. N/A until that time is entered.";
    case "creation-unknown":
      return "Looks like a migrated token, but its pre-migration pair isn't visible on DexScreener, so the true age can't be determined.";
    default:
      return "DexScreener didn't return creation timestamps for this token.";
  }
}

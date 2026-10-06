/**
 * Pure helpers for turning raw DexScreener responses into thesis data.
 * No network calls in here — the API routes do the fetching and call these,
 * which keeps everything unit-testable with fixtures.
 *
 * Endpoints used (free, no key, 300 req/min for pair endpoints):
 *   GET https://api.dexscreener.com/latest/dex/tokens/{tokenAddress}
 *   GET https://api.dexscreener.com/latest/dex/pairs/{chainId}/{pairAddress}
 *   GET https://api.dexscreener.com/latest/dex/search?q={text}
 * All return { schemaVersion, pairs: Pair[] | null }.
 */

import { EntryTiming, MarketCapSource, PairBrief } from "./thesisTypes";

/* ------------------------------ raw response shape ------------------------------ */

/** Only the fields we read. Everything is optional because DexScreener omits fields freely. */
export type RawPair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  labels?: string[];
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string | number;
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
};

/* ------------------------------ configuration ------------------------------ */

/**
 * dexIds that are a launchpad's *bonding curve*, i.e. the pair that exists BEFORE migration.
 * A token with one of these AND a regular AMM pair has migrated; the AMM pair's creation
 * time is then (approximately) the migration time. Extend this if DexScreener lists other
 * launchpads — the raw dexIds seen at entry are stored on every entry (pairsAtEntry).
 */
export const BONDING_CURVE_DEX_IDS = new Set(["pumpfun", "moonshot", "launchlab"]);

/** AMM dexIds a pump.fun token lands on after migrating. Used only for the "creation unknown" case. */
const PUMP_MIGRATION_DEX_IDS = new Set(["pumpswap", "raydium"]);

/* ------------------------------ address validation ------------------------------ */

export type AddressKind = "solana" | "evm";

/** Base58 (no 0, O, I, l), 32–44 chars. Solana mints are not always 43–44 chars. */
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_RE = /^0x[a-fA-F0-9]{40}$/;

export function cleanAddress(raw: string): string {
  return raw.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
}

export function validateAddress(raw: string): { ok: true; ca: string; kind: AddressKind } | { ok: false } {
  const ca = cleanAddress(raw);
  if (EVM_RE.test(ca)) return { ok: true, ca, kind: "evm" };
  if (SOLANA_RE.test(ca)) return { ok: true, ca, kind: "solana" };
  return { ok: false };
}

/** Solana addresses are case-sensitive; EVM addresses are not. */
export function sameAddress(a: string, b: string): boolean {
  if (a.startsWith("0x") && b.startsWith("0x")) return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

/* ------------------------------ number parsing ------------------------------ */

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

function positive(v: unknown): number | undefined {
  const n = num(v);
  return n !== undefined && n > 0 ? n : undefined;
}

/**
 * Market cap for a pair. DexScreener's marketCap is preferred; fdv is a labelled fallback
 * (for fixed-supply memecoins they're normally identical, but it's recorded so a mismatch
 * between entry and later snapshots can be detected instead of silently mixed).
 */
export function pickMarketCap(p: RawPair): { value: number; source: MarketCapSource } | undefined {
  const mc = positive(p.marketCap);
  if (mc !== undefined) return { value: mc, source: "marketCap" };
  const fdv = positive(p.fdv);
  if (fdv !== undefined) return { value: fdv, source: "fdv" };
  return undefined;
}

export function toPairBrief(p: RawPair): PairBrief | undefined {
  if (!p.pairAddress || !p.chainId || !p.dexId) return undefined;
  return {
    chainId: p.chainId,
    dexId: p.dexId,
    pairAddress: p.pairAddress,
    baseAddress: p.baseToken?.address ?? "",
    pairCreatedAt: positive(p.pairCreatedAt),
    liquidityUsd: num(p.liquidity?.usd),
    marketCap: positive(p.marketCap),
    fdv: positive(p.fdv),
    priceUsd: positive(p.priceUsd),
    labels: p.labels,
  };
}

/* ------------------------------ pair selection ------------------------------ */

export function isBondingCurve(dexId: string | undefined): boolean {
  return !!dexId && BONDING_CURVE_DEX_IDS.has(dexId.toLowerCase());
}

/**
 * Pairs for the given CA. Matches the token as the *base* token. If nothing matches that way
 * the user may have pasted a pair address, so pairs whose pairAddress equals the input are
 * accepted too (their base token becomes the token).
 */
export function pairsForAddress(pairs: RawPair[], ca: string): RawPair[] {
  const asBase = pairs.filter((p) => p.baseToken?.address && sameAddress(p.baseToken.address, ca));
  if (asBase.length > 0) return asBase;
  return pairs.filter((p) => p.pairAddress && sameAddress(p.pairAddress, ca));
}

/**
 * Picks the most relevant pair, deterministically:
 *   1. must have a usable USD price,
 *   2. must have a market cap (or fdv),
 *   3. post-migration (non-bonding-curve) pairs outrank bonding-curve pairs — after migration
 *      the bonding curve is dead, even if its stale numbers still look big,
 *   4. then highest USD liquidity,
 *   5. then the most recently created pair as a stable final tiebreak (no randomness).
 * Returns undefined if no pair is usable.
 */
export function selectBestPair(candidates: RawPair[]): RawPair | undefined {
  const usable = candidates.filter((p) => p.pairAddress && p.chainId && positive(p.priceUsd) !== undefined);
  if (usable.length === 0) return undefined;

  const withMc = usable.filter((p) => pickMarketCap(p) !== undefined);
  const pool = withMc.length > 0 ? withMc : usable;

  const sorted = pool.slice().sort((a, b) => {
    const aBond = isBondingCurve(a.dexId) ? 1 : 0;
    const bBond = isBondingCurve(b.dexId) ? 1 : 0;
    if (aBond !== bBond) return aBond - bBond;
    const liqDiff = (num(b.liquidity?.usd) ?? 0) - (num(a.liquidity?.usd) ?? 0);
    if (liqDiff !== 0) return liqDiff;
    return (num(b.pairCreatedAt) ?? 0) - (num(a.pairCreatedAt) ?? 0);
  });
  return sorted[0];
}

/* ------------------------------ timing inference ------------------------------ */

function iso(ms: number | undefined): string | undefined {
  return ms === undefined ? undefined : new Date(ms).toISOString();
}

/**
 * Works out token creation / migration / pre-migration age from the pair list.
 *
 * What DexScreener does and doesn't tell us (this is inference, not a documented field —
 * DexScreener has NO migration timestamp field):
 *  - pairCreatedAt of a *bonding-curve* pair ≈ token creation.
 *  - pairCreatedAt of the first AMM pair created *after* a bonding-curve pair ≈ migration.
 *  Both are approximate: DexScreener can lag in indexing a new pool by seconds.
 *
 * Cases:
 *  A. bonding pair + later AMM pair visible → migration known, creation known.
 *     preMigrationAge = migrationAt − tokenCreatedAt.
 *  B. no bonding pair visible, but it looks like a migrated pump.fun token (mint ends in
 *     "pump" and the pair is a PumpSwap/Raydium pool) → the AMM pair's creation time is
 *     probably the migration, and the real creation time is NOT visible. Pre-migration age
 *     is unknowable here → "creation-unknown" (displayed N/A, never 0m).
 *  C. otherwise → the earliest pair's creation is the best available token creation time.
 *     Pre-migration age then = tokenAge − the user's POST-MIGRATION TIME (clamped at 0), which
 *     is applied later by resolvePreMigrationAgeMs() because the user enters it themselves.
 *  D. no timestamps → unknown.
 *
 * `nowMs` must be the same clock DexScreener data was fetched on (server time).
 */
export function computeEntryTiming(allPairs: PairBrief[], ca: string, nowMs: number): EntryTiming {
  const mine = allPairs.filter((p) => p.baseAddress && sameAddress(p.baseAddress, ca));
  const pool = mine.length > 0 ? mine : allPairs;
  const dated = pool.filter((p) => p.pairCreatedAt !== undefined);
  if (dated.length === 0) return { preMigrationBasis: "unknown" };

  const bonding = dated.filter((p) => isBondingCurve(p.dexId));
  const amm = dated.filter((p) => !isBondingCurve(p.dexId));

  // Case A
  if (bonding.length > 0 && amm.length > 0) {
    const createdAt = Math.min(...bonding.map((p) => p.pairCreatedAt as number));
    const laterAmm = amm.filter((p) => (p.pairCreatedAt as number) >= createdAt);
    if (laterAmm.length > 0) {
      const migrationAt = Math.min(...laterAmm.map((p) => p.pairCreatedAt as number));
      return {
        tokenCreatedAt: iso(createdAt),
        migrationAt: iso(migrationAt),
        tokenAgeAtEntryMs: nowMs - createdAt,
        preMigrationAgeMs: Math.max(0, migrationAt - createdAt),
        preMigrationBasis: "migration-timestamp",
        msSinceMigrationAtEntry: nowMs - migrationAt,
      };
    }
  }

  // Case B
  const earliest = Math.min(...dated.map((p) => p.pairCreatedAt as number));
  const looksMigratedPump =
    bonding.length === 0 &&
    ca.endsWith("pump") &&
    amm.length > 0 &&
    amm.every((p) => PUMP_MIGRATION_DEX_IDS.has(p.dexId.toLowerCase()));
  if (looksMigratedPump) {
    return {
      migrationAt: iso(earliest),
      preMigrationBasis: "creation-unknown",
      msSinceMigrationAtEntry: nowMs - earliest,
    };
  }

  // Case C
  return {
    tokenCreatedAt: iso(earliest),
    tokenAgeAtEntryMs: nowMs - earliest,
    preMigrationBasis: "assumed-delay",
  };
}

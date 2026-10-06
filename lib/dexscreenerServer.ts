/**
 * Server-only DexScreener client, used by the /api/thesis/* routes. Going through our own
 * route (rather than calling DexScreener from the browser) keeps the client→server→external
 * pattern the Gemini route already uses, avoids any CORS dependence, and gives one place to
 * normalise errors and rate limits.
 */
import {
  RawPair,
  pairsForAddress,
  pickMarketCap,
  selectBestPair,
  sameAddress,
  toPairBrief,
  validateAddress,
} from "./dexscreener";
import { ApiFailure, ApiResult, PairBrief, PairQuote, TokenLookup } from "./thesisTypes";

// Overridable (e.g. to point at a proxy or a local mock while testing). Defaults to the public API.
const BASE = process.env.DEXSCREENER_BASE_URL || "https://api.dexscreener.com";
const TIMEOUT_MS = 8_000;

type Fetched = { ok: true; pairs: RawPair[]; fetchedAt: number } | { ok: false; failure: ApiFailure };

function fail(error: "rate_limited" | "upstream_error" | "network_error" | "timeout", message: string): Fetched {
  return { ok: false, failure: { ok: false, error, message } };
}

/** One GET against DexScreener. `cache: "no-store"` is essential — a cached price would be a fabricated snapshot. */
async function getPairs(path: string, retries = 1): Promise<Fetched> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE}${path}`, {
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      const fetchedAt = Date.now();
      if (res.status === 429) return fail("rate_limited", "DexScreener rate limit hit. Wait a few seconds and try again.");
      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        return fail("upstream_error", `DexScreener returned an error (HTTP ${res.status}).`);
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return fail("upstream_error", "DexScreener returned an unreadable response.");
      }
      const raw = (body as { pairs?: unknown; pair?: unknown } | null) ?? {};
      let pairs: RawPair[] = [];
      if (Array.isArray(raw.pairs)) pairs = raw.pairs as RawPair[];
      else if (raw.pair && typeof raw.pair === "object") pairs = [raw.pair as RawPair];
      return { ok: true, pairs, fetchedAt };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      return aborted
        ? fail("timeout", "DexScreener took too long to respond.")
        : fail("network_error", "Couldn't reach DexScreener. Check the connection and try again.");
    } finally {
      clearTimeout(timer);
    }
  }
  return fail("network_error", "Couldn't reach DexScreener.");
}

/** Finds a token by CA and builds the entry-snapshot ingredients. */
export async function lookupToken(rawCa: string): Promise<ApiResult<TokenLookup>> {
  const v = validateAddress(rawCa);
  if (!v.ok) {
    return { ok: false, error: "invalid_address", message: "That doesn't look like a valid contract address." };
  }
  const { ca } = v;

  let res = await getPairs(`/latest/dex/tokens/${encodeURIComponent(ca)}`);
  if (!res.ok) return res.failure;
  let matches = pairsForAddress(res.pairs, ca);

  // Fallback: search also resolves pair addresses.
  if (matches.length === 0) {
    const search = await getPairs(`/latest/dex/search?q=${encodeURIComponent(ca)}`, 0);
    if (!search.ok) return search.failure;
    res = search;
    matches = pairsForAddress(search.pairs, ca);
  }
  if (matches.length === 0) {
    return { ok: false, error: "not_found", message: "Token not found on DexScreener." };
  }

  const best = selectBestPair(matches);
  if (!best) {
    return {
      ok: false,
      error: "not_found",
      message: "Token found, but none of its pairs have a usable price on DexScreener.",
    };
  }
  const mc = pickMarketCap(best);
  if (!mc) {
    return {
      ok: false,
      error: "no_market_cap",
      message: "DexScreener has no market cap for this token yet, so an entry snapshot can't be recorded.",
    };
  }

  // Keep every pair for the *resolved token* (not just the winner): timing inference needs them.
  const tokenAddress = best.baseToken?.address ?? ca;
  const sameToken = res.pairs.filter((p) => p.baseToken?.address && sameAddress(p.baseToken.address, tokenAddress));
  const pairs: PairBrief[] = (sameToken.length > 0 ? sameToken : matches)
    .map(toPairBrief)
    .filter((p): p is PairBrief => !!p);

  const price = parseFloat(String(best.priceUsd));
  return {
    ok: true,
    data: {
      ca: tokenAddress,
      chainId: best.chainId as string,
      pairAddress: best.pairAddress as string,
      dexId: best.dexId ?? "",
      ticker: best.baseToken?.symbol?.trim() || "—",
      name: best.baseToken?.name?.trim() || undefined,
      price: Number.isFinite(price) && price > 0 ? price : undefined,
      marketCap: mc.value,
      marketCapSource: mc.source,
      liquidityUsd: typeof best.liquidity?.usd === "number" ? best.liquidity.usd : undefined,
      pairs,
      fetchedAt: res.fetchedAt,
    },
  };
}

/**
 * Current quote for the SAME pair the entry used. Falls back to the token endpoint if the
 * pair endpoint returns nothing, but only ever reads that same pairAddress — never a
 * different pair, which would make snapshots incomparable to the entry.
 */
export async function quotePair(chainId: string, pairAddress: string, ca: string): Promise<ApiResult<PairQuote>> {
  if (!/^[A-Za-z0-9]{20,64}$/.test(pairAddress) || !/^[a-z0-9-]{2,32}$/.test(chainId)) {
    return { ok: false, error: "invalid_address", message: "Invalid pair reference." };
  }
  let res = await getPairs(`/latest/dex/pairs/${chainId}/${pairAddress}`);
  if (!res.ok) return res.failure;
  let pair = res.pairs.find((p) => p.pairAddress && sameAddress(p.pairAddress, pairAddress));

  if (!pair) {
    const v = validateAddress(ca);
    if (v.ok) {
      const fallback = await getPairs(`/latest/dex/tokens/${encodeURIComponent(v.ca)}`, 0);
      if (fallback.ok) {
        res = fallback;
        pair = fallback.pairs.find((p) => p.pairAddress && sameAddress(p.pairAddress, pairAddress));
      }
    }
  }
  if (!pair) return { ok: false, error: "not_found", message: "Pair not returned by DexScreener." };

  const mc = pickMarketCap(pair);
  const price = parseFloat(String(pair.priceUsd));
  return {
    ok: true,
    data: {
      price: Number.isFinite(price) && price > 0 ? price : undefined,
      marketCap: mc?.value,
      marketCapSource: mc?.source,
      liquidityUsd: typeof pair.liquidity?.usd === "number" ? pair.liquidity.usd : undefined,
      fetchedAt: res.fetchedAt,
    },
  };
}

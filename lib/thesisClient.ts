import { ApiFailure, ApiResult, PairQuote, ThesisEntry, TokenLookup } from "./thesisTypes";

/** Browser-side wrappers around the /api/thesis/* routes. Always resolve; never throw. */
async function getJson<T>(url: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const body = (await res.json()) as ApiResult<T>;
    if (body && typeof body === "object" && "ok" in body) return body;
    return { ok: false, error: "upstream_error", message: `Unexpected response (HTTP ${res.status}).` };
  } catch {
    const failure: ApiFailure = {
      ok: false,
      error: "network_error",
      message: "Couldn't reach the server. Check your connection and try again.",
    };
    return failure;
  }
}

export function fetchTokenLookup(ca: string): Promise<ApiResult<TokenLookup>> {
  return getJson<TokenLookup>(`/api/thesis/token?ca=${encodeURIComponent(ca)}`);
}

export function fetchPairQuote(entry: ThesisEntry): Promise<ApiResult<PairQuote>> {
  const q = new URLSearchParams({ chain: entry.chainId, pair: entry.pairAddress, ca: entry.contractAddress });
  return getJson<PairQuote>(`/api/thesis/pair?${q.toString()}`);
}

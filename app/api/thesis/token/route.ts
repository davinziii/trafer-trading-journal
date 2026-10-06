import { NextRequest, NextResponse } from "next/server";
import { lookupToken } from "@/lib/dexscreenerServer";
import type { ApiErrorCode } from "@/lib/thesisTypes";

// Never cache: a stale response would be a fabricated entry snapshot.
export const dynamic = "force-dynamic";

const STATUS: Record<ApiErrorCode, number> = {
  invalid_address: 400,
  not_found: 404,
  no_market_cap: 422,
  rate_limited: 429,
  upstream_error: 502,
  network_error: 502,
  timeout: 504,
};

export async function GET(req: NextRequest) {
  const ca = req.nextUrl.searchParams.get("ca") ?? "";
  const result = await lookupToken(ca);
  return NextResponse.json(result, {
    status: result.ok ? 200 : STATUS[result.error],
    headers: { "Cache-Control": "no-store" },
  });
}

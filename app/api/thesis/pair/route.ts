import { NextRequest, NextResponse } from "next/server";
import { quotePair } from "@/lib/dexscreenerServer";
import type { ApiErrorCode } from "@/lib/thesisTypes";

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
  const sp = req.nextUrl.searchParams;
  const result = await quotePair(sp.get("chain") ?? "", sp.get("pair") ?? "", sp.get("ca") ?? "");
  return NextResponse.json(result, {
    status: result.ok ? 200 : STATUS[result.error],
    headers: { "Cache-Control": "no-store" },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { generateJson } from "@/lib/gemini";
import { findUnverifiedNumbers } from "@/lib/thesisAi";
import type { ThesisSummaryContent, ThesisSummaryScope } from "@/lib/thesisTypes";

// Retries + fallback models can take a while when Gemini is busy.
export const maxDuration = 60;

// Server-side only: the Gemini key never reaches the browser (same flow as /api/trade-summary).

const SYSTEM_PROMPT = `You're a blunt trading buddy looking at a memecoin trader's data-collection experiment. The strategy being tested: "enter a memecoin some minutes after migration, then hold for 1–10 minutes". How many minutes after migration is a variable the trader types per coin (POST-MIGRATION TIME), so entry timing itself is something the data can compare. The trader pasted contract addresses, the app recorded the market cap at that moment (the entry), then recorded the market cap every minute for 10 minutes. You did not watch the market — everything you say must come from the stats you're given.

WHAT THE STATS MEAN:
- "PNL" is hypothetical: (market cap at minute N / entry market cap − 1) × 100. "atBasisHold" and "perHoldMinute" are fixed-hold results: what exiting at minute N would have returned.
- "Highest PNL" is the best minute seen in hindsight. Nobody can reliably sell the exact top, so treat it as a ceiling, never as an achievable result. Don't present a Highest PNL figure as what the trader would have made.
- "winRatePct" is the share of entries with PNL above 0 at that hold.
- "confidence" ("low" | "moderate" | "high") is a sample-size rule of thumb, not a statistical interval. Respect it: never describe a "low" confidence result as a reliable finding, and mention the sample size whenever you cite a result.
- Pre-migration age is approximate. Market-cap, pre-migration-age and post-migration-time ranges are configured buckets ("dimension" says which one).
- "entryNotes" / "notes" are the trader's own free-text comments on individual coins. They're context, not statistics: you may quote or refer to them, but never turn them into numbers, and never assume a note is true.
- "ruleBasedFindings" and "ruleBasedNextTests" were computed by the app from the same data; you may build on them but don't just repeat them.

HARD RULES:
1. NEVER invent a statistic. Every number you write (percentages, counts, minutes, market caps, sample sizes) must be copied from the stats you were given — same value, rounding to the nearest whole number is fine. If a number isn't in the data, don't write it. Do not compute new averages, ratios or differences yourself.
2. Keep three things separate: OBSERVED data (facts and numbers), INTERPRETATION (what it might mean, hedged: "might", "looks like", "can't tell yet"), and HYPOTHESES to test next (clearly framed as experiments, not conclusions).
3. If "enoughDataForConclusions" is false, or a segment has few samples, say plainly that there isn't enough data and don't build advice on it. An honest "not enough data yet" beats a confident guess.
4. If no hold has a positive median or average ("anyHoldHasPositiveMedianOrAverage": false), say so directly — the data doesn't show an edge yet.
5. Don't claim causation. Don't recommend risking money. You're helping design the next experiment, not giving financial advice.
6. Only mention fields that exist in the data. Never mention a TYPE, range, hold or note that isn't there.

HOW TO TALK: casual, plain, short sentences, like texting a friend who trades. No finance-bro jargon. If the data shows something is clearly failing, say it straight.

Respond with ONLY a single JSON object, no markdown fences, no text before or after, in exactly this shape:
{
  "overview": string,          // 1-3 sentences: what the data says overall, including how much data there is
  "observed": string[],        // plain facts with numbers copied from the stats (best/worst holds, types, age ranges, market-cap ranges, sample sizes)
  "working": string[],         // patterns that look like they're working, each with its sample size and confidence
  "failing": string[],         // patterns that look like they're failing, each with its sample size and confidence
  "winnerTraits": string[],    // what the winners (PNL > 0 at the basis hold) have in common — only from winnersVsLosers / segment data
  "loserTraits": string[],     // what the losers have in common — same rule
  "interpretation": string[],  // hedged readings of the observed data
  "improvements": string[],    // possible strategy tweaks, each tied to a specific observed number
  "hypotheses": string[],      // experiments to run next, phrased as hypotheses to test
  "caveats": string            // 1-2 sentences on the biggest reasons to be careful (sample size, hindsight peaks, approximations)
}
Empty arrays are correct when the data doesn't support anything for that section. Never pad.`;

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)).filter((s) => s.trim() !== "") : [];
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GEMINI_API_KEY on the server. Set it in your environment to enable AI thesis summaries." },
      { status: 500 }
    );
  }

  let body: { scope?: ThesisSummaryScope; label?: string; stats?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body || (body.scope !== "day" && body.scope !== "all") || !body.stats || typeof body.stats !== "object") {
    return NextResponse.json({ error: "No thesis stats to analyze." }, { status: 400 });
  }

  const userPrompt = [
    `Scope: ${body.scope === "all" ? "ALL recorded thesis entries" : "ONE DAY of thesis entries"}`,
    `Label: ${body.label ?? ""}`,
    ``,
    `Pre-calculated stats (JSON). These are the ONLY numbers you may use:`,
    JSON.stringify(body.stats, null, 2),
    ``,
    `Analyze this and respond with only the JSON object described in your instructions.`,
  ].join("\n");

  const result = await generateJson({ apiKey, systemPrompt: SYSTEM_PROMPT, userPrompt, temperature: 0.3 });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const p = result.json;
  const content: ThesisSummaryContent = {
    overview: typeof p.overview === "string" ? p.overview : "",
    observed: asStringArray(p.observed),
    working: asStringArray(p.working),
    failing: asStringArray(p.failing),
    winnerTraits: asStringArray(p.winnerTraits),
    loserTraits: asStringArray(p.loserTraits),
    interpretation: asStringArray(p.interpretation),
    improvements: asStringArray(p.improvements),
    hypotheses: asStringArray(p.hypotheses),
    caveats: typeof p.caveats === "string" ? p.caveats : "",
  };
  content.unverifiedNumbers = findUnverifiedNumbers(content, body.stats);
  return NextResponse.json(content);
}

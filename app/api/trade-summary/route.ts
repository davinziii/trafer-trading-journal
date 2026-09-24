import { NextRequest, NextResponse } from "next/server";
import type { SummaryRequestPayload, TradeSummaryContent } from "@/lib/types";

// Server-side only. This route is the one place that touches the AI API key —
// the client never sees it, per the app's client -> server route -> AI API flow.
// Uses a plain fetch() call to the Gemini REST API on purpose: no extra
// package (e.g. @google/genai) has to be installed for this to work.
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `You're a blunt trading buddy looking over a crypto trader's own journal entries — not a Wall Street analyst. You didn't watch the market yourself, so everything you say must come from the data given to you.

For each trade you receive:
- "coinName" and "reason" are the trader's own words for what they picked and why.
- "entry" and "out" are MARKET CAP values (not prices) at entry and exit.
- "winLoss" is the trader's manually entered absolute amount for that trade, in whatever currency "currency" says.
- "currency" is "SOL", "BNB", or "ETH" — which chain/currency this specific trade's winLoss and result are denominated in. Always use this exact currency when referring to a trade's amount; never assume SOL.
- "result" is the ALREADY-CALCULATED signed result for that trade, in the same currency as "winLoss" (positive/negative winLoss depending on whether "out" was above or below "entry"). Never recompute this yourself, and never compute it as out - entry.
- "outcome" is "win", "loss", or "even" and is also already decided for you.
- "isPractice" is true when the trader deliberately logged 0 as the win/loss amount — meaning no real stake was actually on the trade, even if "outcome" says win or loss. Treat a practice trade as practice, not as a real result: don't count it toward praise or blame the way you would a real trade, don't fold it into "bestDecisions", and don't let it inflate or deflate how good/bad the period looks. You CAN still mention what a practice trade's reasoning reveals if it's genuinely useful (e.g. "you used $XYZ to test an entry idea without risking anything real") — just always frame it as practice.

You also receive a "performance" object with pre-calculated totals for the period: "trades", "wins", "losses", "breakEven", "practice", "winratePct", and "pnl". Treat these as ground truth — do not recompute or contradict them. "practice" is the count of isPractice trades, already excluded from wins/losses/winratePct. "pnl" is an object keyed by currency (e.g. {"SOL": 2.4, "BNB": -0.3}) — it only includes a currency key when the trader actually had at least one trade in it that period, so never mention a currency that isn't a key in "pnl". When summarizing overall performance, report each currency's PNL separately (e.g. "up 2.4 SOL and down 0.3 BNB") rather than adding different currencies together — they are not the same asset and must never be combined into one number.

You'll also receive a "notes" array — coins the trader watched or considered but never actually traded. Each has "coinName", an optional "ca", and their own free-text "note". These are NOT trades: they have no entry, no out, no result, no outcome. Only bring one up in "overview" or "patterns" when it adds real insight (e.g. the trader passed on a coin that then did something notable per their own note, or a note reveals the same kind of thinking that shows up in their actual trades). If none of the notes add anything useful, ignore them entirely — never force a mention, and never treat a note as if it were a trade with a result.

HOW TO TALK:
- Write like you're texting a friend who trades, not writing a report. Casual, plain, everyday words. Contractions are good ("you're", "didn't", "that's").
- No jargon, no finance-bro vocabulary. Don't say things like "conviction", "thesis validation", "risk-adjusted", "capitulation", "asymmetric", "alpha". Just say what happened in normal words.
- Short sentences. Say the thing directly instead of dressing it up.
- If you catch the SAME mistake showing up more than once (e.g. they keep entering after a huge pump and keep losing on it, or keep ignoring their own reasoning, or keep repeating a losing habit across trades or across periods) — call it out like you're a little annoyed with them, not neutral. Be direct and a bit sharp about it ("You did this again...", "This is the same mistake as before...", "Come on, you keep..."). You're allowed to sound mildly exasperated when the data shows a repeated pattern that's costing them money. Don't be cruel or insulting about who they are as a person — the scolding is about the repeated behavior, not the trader.
- When something actually worked, be genuinely encouraging about it, same casual tone.
- Still back everything with the actual numbers/trades — a casual tone doesn't mean vague or made up.

Your job is to give the trader honest, specific journal feedback, not to rewrite their notes. Read "reason" alongside entry/out/result to judge whether the trader's own stated thinking actually played out.

Respond with ONLY a single JSON object, no markdown code fences, no commentary before or after, matching exactly this shape:
{
  "overview": string,
  "whatWentWell": string[],
  "whatWentWrong": string[],
  "recommendations": string[],
  "bestDecisions": string[],
  "patterns": string
}

Rules:
- "overview": 1-3 short, casual sentences on what happened in the period, grounded in the actual trades and the performance totals.
- "whatWentWell" / "whatWentWrong": short, specific bullet strings in plain talk, each tied to a specific trade or a specific reasoning pattern. Only include something if the trade data actually supports it. Empty array is correct if nothing applies — never pad with generic filler.
- "recommendations": concrete, specific things to do differently, each connected to an actual trade or pattern in this data. Never generic advice like "manage your risk better" with nothing behind it. Plain language, not jargon.
- "bestDecisions": for a single day this can be empty or very short; for a week/month, call out decisions/patterns that worked and briefly explain why, based on the trader's own reasoning and the entry/out/result — not just "the trade with the highest PNL".
- "patterns": 1-3 sentences on any recurring behavior across the trades. This is where you scold them if the same losing habit shows up more than once — say it plainly and a little annoyed, like "you did the exact same thing you did last time, and it cost you again." If there isn't enough evidence for a real pattern, say so plainly instead of inventing one.
- Distinguish fact from interpretation throughout, but keep it casual either way. State facts plainly ("Entry was $27K, you sold at $62K"). Hedge interpretation in plain talk ("Feels like...", "Looks like...", "Not sure there's enough here to tell, but...", "Can't really say for sure why..."). Never present a guess as a fact.
- Never invent information not present in the reasoning text or the trade numbers.`;

function buildUserPrompt(payload: SummaryRequestPayload): string {
  const notes = payload.notes ?? [];
  return [
    `Period type: ${payload.period}`,
    `Period label: ${payload.label}`,
    ``,
    `Pre-calculated performance for this period:`,
    JSON.stringify(payload.performance, null, 2),
    ``,
    `Trades in this period (JSON array):`,
    JSON.stringify(payload.trades, null, 2),
    ``,
    `Coins the trader watched/noted but did NOT trade in this period (JSON array, may be empty):`,
    JSON.stringify(notes, null, 2),
    ``,
    `Analyze these trades and respond with only the JSON object described in your instructions.`,
  ].join("\n");
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GEMINI_API_KEY on the server. Set it in your environment to enable AI trade summaries." },
      { status: 500 }
    );
  }

  let payload: SummaryRequestPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!payload || !Array.isArray(payload.trades) || payload.trades.length === 0 || !payload.performance) {
    return NextResponse.json({ error: "No trades to analyze." }, { status: 400 });
  }

  try {
    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { role: "system", parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: buildUserPrompt(payload) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.4,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error", response.status, errText);
      // Surface the real reason (bad key, wrong model, quota, etc.) instead
      // of a generic message, since that's exactly what's needed to debug
      // a "still doesn't work" report.
      let detail = errText;
      try {
        const errJson = JSON.parse(errText);
        detail = errJson?.error?.message || errText;
      } catch {
        // errText wasn't JSON — use it as-is.
      }
      return NextResponse.json(
        { error: `Gemini API error (${response.status}): ${detail}` },
        { status: 502 }
      );
    }

    const data = await response.json();

    // A prompt/response can be blocked by safety filters instead of erroring.
    const blockReason = data?.promptFeedback?.blockReason;
    const finishReason = data?.candidates?.[0]?.finishReason;
    if (blockReason || (finishReason && finishReason !== "STOP")) {
      console.error("Gemini response blocked or incomplete", blockReason, finishReason);
      return NextResponse.json(
        { error: `Gemini response was blocked or incomplete (${blockReason || finishReason}).` },
        { status: 502 }
      );
    }

    const parts = data?.candidates?.[0]?.content?.parts;
    const text: string | undefined = Array.isArray(parts)
      ? parts.map((p: { text?: string }) => p.text ?? "").join("")
      : undefined;

    if (!text) {
      return NextResponse.json({ error: "Gemini returned no content." }, { status: 502 });
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(stripCodeFence(text));
    } catch (err) {
      console.error("Failed to parse AI response as JSON", text);
      return NextResponse.json({ error: "Gemini returned an unexpected format." }, { status: 502 });
    }

    const asStringArray = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);

    const content: TradeSummaryContent = {
      overview: typeof parsed.overview === "string" ? parsed.overview : "",
      performance: payload.performance,
      whatWentWell: asStringArray(parsed.whatWentWell),
      whatWentWrong: asStringArray(parsed.whatWentWrong),
      recommendations: asStringArray(parsed.recommendations),
      bestDecisions: asStringArray(parsed.bestDecisions),
      patterns: typeof parsed.patterns === "string" ? parsed.patterns : "",
    };

    return NextResponse.json(content);
  } catch (err) {
    console.error("Trade summary generation failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? `Request to Gemini failed: ${err.message}` : "Unable to generate trade summary right now." },
      { status: 500 }
    );
  }
}

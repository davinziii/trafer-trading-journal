/**
 * Shared Gemini REST helper for every AI summary (journal Trade Summary and thesis summaries).
 * Server-side only, so the API key never reaches the browser. Plain fetch on purpose — no SDK.
 *
 * Free-tier Gemini often answers 503 "high demand" or 429 "quota" for a while. Those are
 * temporary, so each model is retried with a short backoff, and if it stays busy the next
 * model in the chain is tried. Override the chain with GEMINI_MODEL / GEMINI_FALLBACK_MODELS.
 */
// Newest flash first; the lite model is a fast last resort (lower quality, but rarely overloaded).
// (gemini-2.5-flash is closed to new keys; gemini-3.6-flash was hanging under load when this was set.)
const DEFAULT_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"];

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Tries per model (first call + retries) before moving to the next model. */
const ATTEMPTS_PER_MODEL = 2;
/** Give up entirely after this long, so the route finishes inside its time limit. */
const TOTAL_BUDGET_MS = 50_000;
/** A model that hasn't answered by now is treated as overloaded and skipped (not retried). */
const REQUEST_TIMEOUT_MS = 20_000;

/** Statuses that mean "busy / try again shortly" rather than "your request is wrong". */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export type GeminiJsonResult =
  | { ok: true; json: Record<string, unknown>; model: string }
  | { ok: false; status: number; error: string };

function modelChain(): string[] {
  const primary = process.env.GEMINI_MODEL?.trim();
  const fallbacks = process.env.GEMINI_FALLBACK_MODELS?.split(",").map((m) => m.trim()).filter(Boolean);
  const chain = [...(primary ? [primary] : []), ...(fallbacks ?? DEFAULT_MODELS)];
  return Array.from(new Set(chain));
}

function stripCodeFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function errorDetail(errText: string): string {
  try {
    return JSON.parse(errText)?.error?.message || errText;
  } catch {
    return errText;
  }
}

type Attempt =
  | { kind: "ok"; json: Record<string, unknown> }
  /** Busy/overloaded/rate-limited/network — worth retrying or trying another model. */
  | { kind: "retry"; status: number; detail: string }
  /** This model can't be used (unknown model, unsupported) — skip to the next one. */
  | { kind: "skip"; status: number; detail: string }
  /** Won't get better on any model (bad key, bad request, blocked, unparseable). */
  | { kind: "fatal"; status: number; error: string };

async function callOnce(
  model: string,
  opts: { apiKey: string; systemPrompt: string; userPrompt: string; temperature: number; maxOutputTokens: number },
  timeoutMs: number
): Promise<Attempt> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: "POST",
      // Key in a header rather than the URL so it can't end up in request logs.
      headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        systemInstruction: { role: "system", parts: [{ text: opts.systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: opts.userPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: opts.temperature,
          maxOutputTokens: opts.maxOutputTokens,
        },
      }),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    // A hung model won't answer faster on a retry — move on. Other network blips are worth one retry.
    if (timedOut) return { kind: "skip", status: 0, detail: `no answer within ${Math.round(timeoutMs / 1000)}s` };
    return { kind: "retry", status: 0, detail: err instanceof Error ? err.message : "network error" };
  }

  if (!response.ok) {
    const detail = errorDetail(await response.text());
    console.error(`Gemini API error [${model}]`, response.status, detail);
    if (RETRYABLE.has(response.status)) return { kind: "retry", status: response.status, detail };
    if (response.status === 404) return { kind: "skip", status: 404, detail };
    return { kind: "fatal", status: 502, error: `Gemini API error (${response.status}): ${detail}` };
  }

  const data = await response.json();
  const blockReason = data?.promptFeedback?.blockReason;
  const finishReason = data?.candidates?.[0]?.finishReason;
  if (blockReason || (finishReason && finishReason !== "STOP")) {
    console.error(`Gemini response blocked or incomplete [${model}]`, blockReason, finishReason);
    // Running out of output tokens is model-specific (thinking models spend tokens before answering).
    if (finishReason === "MAX_TOKENS") return { kind: "skip", status: 502, detail: "response was cut off (MAX_TOKENS)" };
    return { kind: "fatal", status: 502, error: `Gemini response was blocked or incomplete (${blockReason || finishReason}).` };
  }

  const parts = data?.candidates?.[0]?.content?.parts;
  const text: string | undefined = Array.isArray(parts) ? parts.map((p: { text?: string }) => p.text ?? "").join("") : undefined;
  if (!text) return { kind: "skip", status: 502, detail: "returned no content" };

  try {
    return { kind: "ok", json: JSON.parse(stripCodeFence(text)) };
  } catch {
    console.error(`Failed to parse AI response as JSON [${model}]`, text);
    return { kind: "skip", status: 502, detail: "returned an unexpected format" };
  }
}

export async function generateJson(opts: {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<GeminiJsonResult> {
  const call = {
    ...opts,
    temperature: opts.temperature ?? 0.3,
    // Generous on purpose: newer Flash models "think" first and that counts against this limit.
    maxOutputTokens: opts.maxOutputTokens ?? 8192,
  };
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const tried: string[] = [];
  let lastStatus = 503;
  let lastDetail = "";

  for (const model of modelChain()) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 3_000) break;
      const res = await callOnce(model, call, Math.min(REQUEST_TIMEOUT_MS, remaining));
      if (res.kind === "ok") {
        if (tried.length) console.warn(`Gemini: succeeded on ${model} after: ${tried.join(", ")}`);
        return { ok: true, json: res.json, model };
      }
      if (res.kind === "fatal") return { ok: false, status: res.status, error: res.error };

      tried.push(`${model} (${res.status || "no answer"})`);
      lastStatus = res.status || lastStatus;
      lastDetail = res.detail;
      if (res.kind === "skip") break;
      // Back off before retrying the same model: ~1.5s, then ~3s, with jitter.
      if (attempt < ATTEMPTS_PER_MODEL) await sleep(1500 * attempt + Math.random() * 500);
    }
  }

  const busy = lastStatus === 503 || lastStatus === 429 || lastStatus === 0;
  const models = Array.from(new Set(tried)).join(", ");
  return {
    ok: false,
    status: 503,
    error: busy
      ? `Gemini is busy right now (free tier). Tried ${models}. Please try again in a minute.`
      : `Gemini couldn't produce a summary (${lastDetail}). Tried ${models}.`,
  };
}

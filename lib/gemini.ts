/**
 * Shared Gemini REST helper for the thesis AI summaries. Same model, same plain-fetch
 * approach and same error surfacing as app/api/trade-summary/route.ts (which is left
 * untouched so the journal's AI keeps working exactly as before) — server-side only, so the
 * API key never reaches the browser.
 */
export const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export type GeminiJsonResult =
  | { ok: true; json: Record<string, unknown> }
  | { ok: false; status: number; error: string };

function stripCodeFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

export async function generateJson(opts: {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<GeminiJsonResult> {
  try {
    const response = await fetch(`${GEMINI_URL}?key=${opts.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { role: "system", parts: [{ text: opts.systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: opts.userPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: opts.temperature ?? 0.3,
          maxOutputTokens: opts.maxOutputTokens ?? 3072,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error", response.status, errText);
      let detail = errText;
      try {
        detail = JSON.parse(errText)?.error?.message || errText;
      } catch {
        // not JSON — use as-is
      }
      return { ok: false, status: 502, error: `Gemini API error (${response.status}): ${detail}` };
    }

    const data = await response.json();
    const blockReason = data?.promptFeedback?.blockReason;
    const finishReason = data?.candidates?.[0]?.finishReason;
    if (blockReason || (finishReason && finishReason !== "STOP")) {
      console.error("Gemini response blocked or incomplete", blockReason, finishReason);
      return { ok: false, status: 502, error: `Gemini response was blocked or incomplete (${blockReason || finishReason}).` };
    }
    const parts = data?.candidates?.[0]?.content?.parts;
    const text: string | undefined = Array.isArray(parts)
      ? parts.map((p: { text?: string }) => p.text ?? "").join("")
      : undefined;
    if (!text) return { ok: false, status: 502, error: "Gemini returned no content." };

    try {
      return { ok: true, json: JSON.parse(stripCodeFence(text)) };
    } catch {
      console.error("Failed to parse AI response as JSON", text);
      return { ok: false, status: 502, error: "Gemini returned an unexpected format." };
    }
  } catch (err) {
    console.error("Gemini request failed", err);
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? `Request to Gemini failed: ${err.message}` : "Unable to generate a summary right now.",
    };
  }
}

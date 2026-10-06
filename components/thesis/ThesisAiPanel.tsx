"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { storage } from "@/lib/storage";
import { hashString } from "@/lib/thesisCalculations";
import { ThesisSummaryCache, ThesisSummaryContent, ThesisSummaryScope } from "@/lib/thesisTypes";

type Props = {
  scope: ThesisSummaryScope;
  /** Cache key, e.g. "all" or "day:2026-10-06". */
  cacheKey: string;
  label: string;
  /** The structured stats the AI is allowed to use. Never the raw database. */
  stats: Record<string, unknown>;
  /** If set, generation is blocked and this is shown instead. */
  blockedReason?: string;
  buttonLabel?: string;
};

/**
 * AI analysis for thesis data. Same pattern as the journal's Trade Summary: manual button,
 * result cached against a hash of the underlying data, a failed call never deletes an
 * existing cached result, errors get a Retry. Calls /api/thesis-summary (server-side key).
 */
export function ThesisAiPanel({ scope, cacheKey, label, stats, blockedReason, buttonLabel = "Get AI analysis" }: Props) {
  const [cache, setCache] = useState<ThesisSummaryCache | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => setCache(storage.readThesisSummaryCache()), []);

  const hash = useMemo(() => hashString(JSON.stringify(stats)), [stats]);
  const entry = cache?.[cacheKey];
  const stale = !!entry && entry.hash !== hash;

  const generate = async () => {
    if (inFlight.current || blockedReason) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/thesis-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, label, stats }),
      });
      let data: any;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Server returned a non-JSON response (status ${res.status}). Check the dev server console for the real error.`);
      }
      if (!res.ok) throw new Error(data?.error || `Request failed (status ${res.status}).`);
      setCache((prev) => {
        const next = { ...(prev ?? {}), [cacheKey]: { hash, content: data as ThesisSummaryContent, generatedAt: new Date().toISOString() } };
        storage.writeThesisSummaryCache(next);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate an analysis right now.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {!entry && (
        <div className="rounded-lg border border-dashed border-border py-6 px-4 text-center">
          <p className="text-sm text-faint mb-3">
            {blockedReason ??
              "Generate an AI read of the numbers above. It only sees the calculated stats, and any figure it writes that can't be traced back to them gets flagged."}
          </p>
          {!blockedReason && (
            <Button onClick={generate} disabled={loading}>
              {loading ? "Analyzing…" : buttonLabel}
            </Button>
          )}
        </div>
      )}

      {entry && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[11px] text-faint">
              Generated {new Date(entry.generatedAt).toLocaleString()}
              {stale && <span className="text-loss ml-2">Data has changed since then.</span>}
            </span>
            <Button variant="ghost" onClick={generate} disabled={loading || !!blockedReason} className="!text-xs !py-1">
              {loading ? "Analyzing…" : stale ? "Regenerate" : "Refresh"}
            </Button>
          </div>
          <AiBody content={entry.content} />
        </>
      )}

      {loading && !entry && <Skeleton />}

      {error && (
        <div className="rounded-md border border-danger/40 bg-surface-2 px-3 py-2 flex items-center justify-between gap-3">
          <span className="text-sm text-loss">{error}</span>
          <button onClick={generate} className="flex items-center gap-1 text-xs font-medium text-dim hover:text-ink transition-colors flex-shrink-0">
            <RotateCw size={12} /> Retry
          </button>
        </div>
      )}
    </div>
  );
}

function AiBody({ content }: { content: ThesisSummaryContent }) {
  return (
    <div className="space-y-4">
      {content.unverifiedNumbers && content.unverifiedNumbers.length > 0 && (
        <div className="rounded-md border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss leading-snug">
          Heads up: the AI wrote {content.unverifiedNumbers.length === 1 ? "a number" : "numbers"} that couldn&apos;t be matched to your stats (
          {content.unverifiedNumbers.slice(0, 6).join(", ")}). Trust the tables above over the text below for those.
        </div>
      )}
      {content.overview && (
        <div>
          <div className="text-xs mb-1 text-faint">Overview</div>
          <p className="text-sm leading-relaxed text-ink">{content.overview}</p>
        </div>
      )}
      <Bullets title="Observed data" items={content.observed} tone="neutral" />
      <Bullets title="What's working" items={content.working} tone="win" />
      <Bullets title="What's failing" items={content.failing} tone="loss" />
      <Bullets title="What winners have in common" items={content.winnerTraits} tone="win" />
      <Bullets title="What losers have in common" items={content.loserTraits} tone="loss" />
      <Bullets title="Interpretation (a reading, not a fact)" items={content.interpretation} tone="neutral" />
      <Bullets title="Possible improvements" items={content.improvements} tone="neutral" />
      <Bullets title="Suggested hypotheses to test next" items={content.hypotheses} tone="rate" />
      {content.caveats && (
        <div>
          <div className="text-xs mb-1 text-faint">Caveats</div>
          <p className="text-sm leading-relaxed text-dim">{content.caveats}</p>
        </div>
      )}
    </div>
  );
}

function Bullets({ title, items, tone }: { title: string; items: string[]; tone: "win" | "loss" | "neutral" | "rate" }) {
  if (!items || items.length === 0) return null;
  const dot = tone === "win" ? "bg-win" : tone === "loss" ? "bg-loss" : tone === "rate" ? "bg-rate" : "bg-neutral";
  return (
    <div>
      <div className="text-xs mb-1.5 text-faint">{title}</div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-ink">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2" aria-live="polite" aria-busy="true">
      <p className="text-xs text-faint mb-2">Analyzing thesis data…</p>
      <div className="animate-pulse space-y-2">
        <div className="h-3 rounded bg-surface-3 w-5/6" />
        <div className="h-3 rounded bg-surface-3 w-full" />
        <div className="h-3 rounded bg-surface-3 w-2/3" />
      </div>
    </div>
  );
}

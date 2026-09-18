"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, RotateCw } from "lucide-react";
import {
  SummaryCache,
  SummaryPeriodType,
  SummaryRequestPayload,
  Trade,
  TradeSummaryContent,
} from "@/lib/types";
import {
  MONTHS,
  computePeriodStats,
  formatLongDate,
  formatPercent,
  formatSol,
  getPreviousMonth,
  getWeekRanges,
  hashTrades,
  solColorClass,
  toDateKey,
  toSummaryRequestTrades,
  tradesInMonth,
  tradesInRange,
} from "@/lib/calculations";
import { storage } from "@/lib/storage";
import { Button } from "@/components/ui/Button";

type TradeInsightsProps = {
  trades: Trade[];
  selectedDate: string;
};

type TabId = "day" | "week1" | "week2" | "week3" | "week4" | "prevMonth";

const TABS: { id: TabId; label: string }[] = [
  { id: "day", label: "This day" },
  { id: "week1", label: "Week 1" },
  { id: "week2", label: "Week 2" },
  { id: "week3", label: "Week 3" },
  { id: "week4", label: "Week 4" },
  { id: "prevMonth", label: "Previous Month" },
];

const SECTION_LABELS: Record<
  SummaryPeriodType,
  { performance: string; well: string; wrong: string; recs: string; patterns: string; best: string }
> = {
  day: {
    performance: "Performance",
    well: "What I Did Well",
    wrong: "What I Did Wrong",
    recs: "What I Should Have Done",
    patterns: "Patterns Detected",
    best: "Best Decisions",
  },
  week: {
    performance: "Weekly Overview",
    well: "What Went Well",
    wrong: "What Went Wrong",
    recs: "Next Week Focus",
    patterns: "Patterns",
    best: "Best Decisions",
  },
  month: {
    performance: "Monthly Overview",
    well: "Overall Strengths",
    wrong: "Overall Weaknesses & Recurring Mistakes",
    recs: "Areas to Improve",
    patterns: "Biggest Lessons",
    best: "Recurring Successful Patterns",
  },
};

function noTradesMessage(periodType: SummaryPeriodType): { primary: string; secondary?: string } {
  if (periodType === "day") {
    return { primary: "No trades recorded for this day.", secondary: "Add trades to generate a daily trade summary." };
  }
  if (periodType === "week") return { primary: "No summary for this week." };
  return { primary: "No summary for this month." };
}

export function TradeInsights({ trades, selectedDate }: TradeInsightsProps) {
  const [open, setOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("day");

  // null = not yet loaded from storage; {} = loaded and empty.
  const [cache, setCache] = useState<SummaryCache | null>(null);
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
  const [errorKeys, setErrorKeys] = useState<Record<string, string>>({});
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setCache(storage.readSummaryCache());
  }, []);

  const [y, m] = selectedDate.split("-").map(Number);
  const year = y;
  const month = m - 1;

  // Real calendar "today" — used only to decide whether a week has fully
  // played out yet, not to pick which date is displayed.
  const todayKey = useMemo(() => {
    const now = new Date();
    return toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const weekRanges = useMemo(() => getWeekRanges(year, month), [year, month]);
  const prevMonth = useMemo(() => getPreviousMonth(year, month), [year, month]);

  // Everything needed to render/fetch the currently active tab, derived
  // purely from the selected date's month — never a hardcoded "today".
  const period = useMemo(() => {
    if (activeTab === "day") {
      const periodTrades = trades.filter((t) => t.date === selectedDate);
      return {
        type: "day" as SummaryPeriodType,
        key: `day:${selectedDate}`,
        label: formatLongDate(selectedDate),
        trades: periodTrades,
        complete: true,
        completeAfterLabel: undefined as string | undefined,
      };
    }
    if (activeTab === "prevMonth") {
      const periodTrades = tradesInMonth(trades, prevMonth.year, prevMonth.month);
      return {
        type: "month" as SummaryPeriodType,
        key: `month:${prevMonth.year}-${String(prevMonth.month + 1).padStart(2, "0")}`,
        label: `${MONTHS[prevMonth.month]} ${prevMonth.year}`,
        trades: periodTrades,
        complete: true,
        completeAfterLabel: undefined as string | undefined,
      };
    }
    const idx = Number(activeTab.replace("week", "")) as 1 | 2 | 3 | 4;
    const range = weekRanges[idx - 1];
    const periodTrades = tradesInRange(trades, range.startKey, range.endKey);
    // A week is only "done" once every one of its days has actually
    // occurred — not just because it has 7 days' worth of trades in it.
    const complete = todayKey > range.endKey;
    return {
      type: "week" as SummaryPeriodType,
      key: `week:${year}-${String(month + 1).padStart(2, "0")}:${idx}`,
      label: `Week ${idx} — ${MONTHS[month]} ${range.startDay}\u2013${range.endDay}, ${year}`,
      trades: periodTrades,
      complete,
      completeAfterLabel: complete ? undefined : formatLongDate(range.endKey),
    };
  }, [activeTab, trades, selectedDate, year, month, weekRanges, prevMonth, todayKey]);

  const stats = useMemo(() => computePeriodStats(period.trades), [period.trades]);
  const currentHash = useMemo(() => hashTrades(period.trades), [period.trades]);

  const ensureSummary = useCallback(async (periodKey: string, payload: SummaryRequestPayload, hash: string) => {
    if (inFlightRef.current.has(periodKey)) return;
    inFlightRef.current.add(periodKey);
    setLoadingKeys((prev) => new Set(prev).add(periodKey));
    setErrorKeys((prev) => {
      if (!(periodKey in prev)) return prev;
      const next = { ...prev };
      delete next[periodKey];
      return next;
    });

    try {
      const res = await fetch("/api/trade-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data: any;
      try {
        data = await res.json();
      } catch {
        // The server returned something that wasn't JSON at all (e.g. a
        // framework error page) — give a message that says so plainly
        // instead of letting the parse error itself surface.
        throw new Error(
          `Server returned a non-JSON response (status ${res.status}). Check the dev server console for the real error.`
        );
      }
      if (!res.ok) throw new Error(data?.error || `Request failed (status ${res.status}).`);

      setCache((prev) => {
        const base = prev ?? {};
        const next = { ...base, [periodKey]: { hash, content: data as TradeSummaryContent, generatedAt: new Date().toISOString() } };
        storage.writeSummaryCache(next);
        return next;
      });
    } catch (err) {
      setErrorKeys((prev) => ({
        ...prev,
        [periodKey]: err instanceof Error ? err.message : "Unable to generate trade summary right now.",
      }));
    } finally {
      inFlightRef.current.delete(periodKey);
      setLoadingKeys((prev) => {
        const next = new Set(prev);
        next.delete(periodKey);
        return next;
      });
    }
  }, []);

  // Auto-regenerates only for periods where that makes sense: a month, or
  // a week that has actually fully played out. Day summaries are manual —
  // triggered only by the "Get Summary" button below — and a week never
  // auto-generates while it's still in progress, only once every day in
  // it has passed.
  useEffect(() => {
    if (cache === null) return;
    if (period.type === "day") return;
    if (period.type === "week" && !period.complete) return;
    if (period.trades.length === 0) return;
    const existing = cache[period.key];
    if (existing && existing.hash === currentHash) return;

    const payload: SummaryRequestPayload = {
      period: period.type,
      label: period.label,
      trades: toSummaryRequestTrades(period.trades),
      performance: stats,
    };
    ensureSummary(period.key, payload, currentHash);
  }, [cache, period.key, period.type, period.complete, period.label, period.trades, stats, currentHash, ensureSummary]);

  const entry = cache?.[period.key];
  const isLoading = loadingKeys.has(period.key);
  const error = errorKeys[period.key];
  const labels = SECTION_LABELS[period.type];
  const empty = noTradesMessage(period.type);

  const generate = () => {
    const payload: SummaryRequestPayload = {
      period: period.type,
      label: period.label,
      trades: toSummaryRequestTrades(period.trades),
      performance: stats,
    };
    ensureSummary(period.key, payload, currentHash);
  };

  return (
    <div
      onClick={() => setOpen((o) => !o)}
      className="w-full flex-1 min-w-0 rounded-xl border border-border-soft bg-surface p-5 cursor-pointer"
    >
      {/* No onClick here — the click bubbles up to the card's onClick above,
          so the whole card stays the single source of truth for toggling. */}
      <button
        className="flex items-center gap-2 text-dim hover:text-ink transition-colors"
        aria-expanded={open}
      >
        <ChevronDown
          size={15}
          className="transition-transform"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        />
        <span className="font-serif text-base text-ink">Trade Summary</span>
      </button>

      {open && (
        <>
          {/* Stops tab clicks from bubbling up and collapsing the card. */}
          <div className="flex flex-wrap gap-1 mt-4" onClick={(e) => e.stopPropagation()}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`text-xs font-medium px-2.5 py-1.5 rounded-md transition-colors ${
                  activeTab === tab.id ? "bg-surface-3 text-ink" : "text-faint hover:text-dim"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="border-t border-border-soft mt-3 pt-3">
            <h3 className="font-serif text-lg text-ink mb-3">{period.label}</h3>

            {period.trades.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-8 text-center">
                <p className="text-sm text-faint">{empty.primary}</p>
                {empty.secondary && <p className="text-xs text-faint mt-1">{empty.secondary}</p>}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-xs mb-2 text-faint">{labels.performance}</div>
                  <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
                    <div>
                      <div className="text-xs mb-0.5 text-faint">PNL</div>
                      <div className={`font-mono text-lg font-medium ${solColorClass(stats.pnl)}`}>
                        {formatSol(stats.pnl)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs mb-0.5 text-faint">Winrate</div>
                      <div className="font-mono text-lg font-medium text-rate">
                        {stats.wins + stats.losses > 0 ? `${stats.wins} / ${stats.wins + stats.losses}` : "—"}
                        {formatPercent(stats.winratePct) ? (
                          <span className="text-sm ml-2">{formatPercent(stats.winratePct)}</span>
                        ) : null}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs mb-0.5 text-faint">Trades</div>
                      <div className="font-mono text-lg font-medium text-ink">{stats.trades}</div>
                    </div>
                    {stats.breakEven > 0 && (
                      <div>
                        <div className="text-xs mb-0.5 text-faint">Break-even</div>
                        <div className="font-mono text-lg font-medium text-neutral">{stats.breakEven}</div>
                      </div>
                    )}
                  </div>
                </div>

                {period.type === "day" && !entry ? (
                  <div className="rounded-lg border border-dashed border-border py-6 text-center">
                    <p className="text-sm text-faint mb-3">
                      Generate an AI trading-journal summary for this day. Once generated, it stays
                      as-is — it won't be regenerated even if you edit trades later.
                    </p>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        generate();
                      }}
                      disabled={isLoading}
                    >
                      {isLoading ? "Analyzing…" : "Get Summary"}
                    </Button>
                  </div>
                ) : period.type === "week" && !period.complete ? (
                  <div className="rounded-lg border border-dashed border-border py-6 text-center">
                    <p className="text-sm text-faint">
                      This week isn't finished yet — a summary will be generated automatically once{" "}
                      {period.completeAfterLabel ?? "the week ends"} has passed.
                    </p>
                  </div>
                ) : (
                  <>
                    {entry && <SummaryBody content={entry.content} labels={labels} />}
                    {isLoading && !entry && <LoadingSkeleton />}
                    {isLoading && entry && <p className="text-xs text-faint">Refreshing analysis…</p>}
                  </>
                )}

                {error && (
                  <div className="rounded-md border border-danger/40 bg-surface-2 px-3 py-2 flex items-center justify-between gap-3">
                    <span className="text-sm text-loss">{error}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        generate();
                      }}
                      className="flex items-center gap-1 text-xs font-medium text-dim hover:text-ink transition-colors flex-shrink-0"
                    >
                      <RotateCw size={12} /> Retry
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom collapse button so the user doesn't have to scroll back
              up to the header to close the card. */}
          <div className="mt-4 pt-3 border-t border-border-soft flex justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              className="flex items-center gap-1.5 text-xs font-medium text-faint hover:text-ink transition-colors"
            >
              <ChevronDown size={13} className="rotate-180" />
              Collapse
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryBody({
  content,
  labels,
}: {
  content: TradeSummaryContent;
  labels: (typeof SECTION_LABELS)[SummaryPeriodType];
}) {
  return (
    <div className="space-y-4">
      {content.overview && (
        <div>
          <div className="text-xs mb-1 text-faint">Overview</div>
          <p className="text-sm leading-relaxed text-ink">{content.overview}</p>
        </div>
      )}

      <BulletSection title={labels.well} items={content.whatWentWell} tone="win" />
      <BulletSection title={labels.wrong} items={content.whatWentWrong} tone="loss" />
      <BulletSection title={labels.best} items={content.bestDecisions} tone="win" />
      <BulletSection title={labels.recs} items={content.recommendations} tone="neutral" />

      {content.patterns && (
        <div>
          <div className="text-xs mb-1 text-faint">{labels.patterns}</div>
          <p className="text-sm leading-relaxed text-dim">{content.patterns}</p>
        </div>
      )}
    </div>
  );
}

function BulletSection({ title, items, tone }: { title: string; items: string[]; tone: "win" | "loss" | "neutral" }) {
  if (!items || items.length === 0) return null;
  const dotClass = tone === "win" ? "bg-win" : tone === "loss" ? "bg-loss" : "bg-neutral";
  return (
    <div>
      <div className="text-xs mb-1.5 text-faint">{title}</div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-ink">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2" aria-live="polite" aria-busy="true">
      <p className="text-xs text-faint mb-2">Analyzing trades…</p>
      <div className="animate-pulse space-y-2">
        <div className="h-3 rounded bg-surface-3 w-5/6" />
        <div className="h-3 rounded bg-surface-3 w-full" />
        <div className="h-3 rounded bg-surface-3 w-2/3" />
      </div>
    </div>
  );
}

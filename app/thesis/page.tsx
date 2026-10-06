"use client";

import { useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { TradingCalendar } from "@/components/calendar/TradingCalendar";
import { CalendarControls } from "@/components/calendar/CalendarControls";
import type { CalendarDayLabel } from "@/components/calendar/CalendarDay";
import { CoinAdder } from "@/components/thesis/CoinAdder";
import { ThesisTable } from "@/components/thesis/ThesisTable";
import { DailySummary } from "@/components/thesis/DailySummary";
import { TradeSummaryPanel } from "@/components/thesis/TradeSummaryPanel";
import { useNow, useThesisStore } from "@/components/thesis/useThesisStore";
import { useThesisTracker } from "@/components/thesis/useThesisTracker";
import { formatLongDate, toDateKey } from "@/lib/calculations";
import { sameAddress } from "@/lib/dexscreener";
import { formatSignedPct, highestPnl, isComplete } from "@/lib/thesisCalculations";
import { STRATEGY_LABEL, ThesisEntry } from "@/lib/thesisTypes";

type ThesisCalendarMode = "peak" | "count";

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export default function ThesisPage() {
  const { entries, loaded, commit } = useThesisStore();
  const { isLeader } = useThesisTracker(entries, commit);

  const [mode, setMode] = useState<ThesisCalendarMode>("peak");
  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const t = new Date();
    return toDateKey(t.getFullYear(), t.getMonth(), t.getDate());
  });

  const anyTracking = useMemo(() => entries.some((e) => !isComplete(e)), [entries]);
  const now = useNow(anyTracking);

  const dayEntries = useMemo(
    () => entries.filter((e) => e.date === selectedDate).sort((a, b) => b.entryTimestamp.localeCompare(a.entryTimestamp)),
    [entries, selectedDate]
  );

  const dayTracking = dayEntries.filter((e) => !isComplete(e)).length;

  // Calendar cell text per date: average Highest PNL of finished entries, or the entry count.
  const dayLabels = useMemo(() => {
    const byDate: Record<string, ThesisEntry[]> = {};
    for (const e of entries) (byDate[e.date] ??= []).push(e);
    const out: Record<string, CalendarDayLabel[]> = {};
    for (const [date, list] of Object.entries(byDate)) {
      const countLabel: CalendarDayLabel = { text: `${list.length} coin${list.length === 1 ? "" : "s"}`, tone: "rate" };
      if (mode === "count") {
        out[date] = [countLabel];
        continue;
      }
      const peaks = list.map((e) => highestPnl(e)).filter((h): h is NonNullable<typeof h> => !!h);
      if (peaks.length === 0) {
        out[date] = [{ text: list.every((e) => !isComplete(e)) ? "tracking" : countLabel.text, tone: "neutral" }];
      } else {
        const avg = peaks.reduce((s, h) => s + h.percentage, 0) / peaks.length;
        out[date] = [{ text: formatSignedPct(avg), tone: avg > 0 ? "win" : avg < 0 ? "loss" : "neutral" }];
      }
    }
    return out;
  }, [entries, mode]);

  const onCreate = (entry: ThesisEntry): boolean => {
    let added = false;
    commit((prev) => {
      if (prev.some((e) => sameAddress(e.contractAddress, entry.contractAddress))) return prev;
      added = true;
      return [...prev, entry];
    });
    if (added) {
      // Jump to the day the new entry belongs to so it's visible straight away.
      setSelectedDate(entry.date);
      const [y, m] = entry.date.split("-").map(Number);
      setCurrentMonth(new Date(y, m - 1, 1));
    }
    return added;
  };

  return (
    <div className="min-h-screen bg-bg">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="flex-1 min-w-0 w-full rounded-xl border border-border-soft bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-1">
              <h2 className="font-serif text-3xl text-ink">Thesis</h2>
              <span className="text-sm text-dim">{STRATEGY_LABEL}</span>
            </div>
            <p className="text-sm text-faint mb-5 leading-relaxed">
              If I entered a memecoin some minutes after migration, what would have happened if I held it for 1–10 minutes? Paste a CA to
              record the entry and start collecting real market data.
            </p>
            <CoinAdder onCreate={onCreate} />
            <p className="text-[11px] text-faint mt-4 leading-snug border-t border-border-soft pt-3">
              Keep this page open while a coin is tracking (a separate window is fine). Snapshots are taken from the clock, not from timer ticks, but
              DexScreener has no price history — a minute missed while the page was closed stays blank (—) rather than being guessed.
              {!isLeader && <span className="text-loss"> Tracking is currently running in another tab.</span>}
            </p>
          </div>

          <TradingCalendar
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            dayLabels={dayLabels}
            controls={
              <CalendarControls<ThesisCalendarMode>
                mode={mode}
                setMode={setMode}
                options={[
                  { key: "count", label: "Coins" },
                  { key: "peak", label: "Avg peak" },
                ]}
              />
            }
          />
        </div>

        <div className="mt-6 rounded-xl border border-border-soft bg-surface/40 p-3 sm:p-5">
          <div className="flex items-baseline justify-between flex-wrap gap-3 mb-4">
            <h2 className="font-serif text-2xl text-ink">{formatLongDate(selectedDate)}</h2>
            <div className="flex items-center gap-2 text-xs">
              {dayTracking > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-accent-soft px-2 py-1 font-medium text-accent">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                  {dayTracking} tracking
                </span>
              )}
              <span className="rounded-md bg-surface-2 px-2 py-1 text-dim">
                {dayEntries.length} {dayEntries.length === 1 ? "coin" : "coins"}
              </span>
            </div>
          </div>
          {!loaded ? (
            <div className="h-24 animate-pulse rounded-lg bg-surface-2/40" />
          ) : dayEntries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-faint">
              No thesis entries recorded for this day.
            </div>
          ) : (
            <ThesisTable entries={dayEntries} commit={commit} now={now} />
          )}
        </div>

        <DailySummary dateKey={selectedDate} entries={dayEntries} />
        <TradeSummaryPanel entries={entries} />
      </main>
    </div>
  );
}

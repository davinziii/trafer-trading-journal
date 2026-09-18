"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { CalendarMode, Trade } from "@/lib/types";
import { MONTHS, WEEKDAYS, computeDailyStats, toDateKey } from "@/lib/calculations";
import { CalendarControls } from "./CalendarControls";
import { CalendarDay } from "./CalendarDay";

type TradingCalendarProps = {
  trades: Trade[];
  mode: CalendarMode;
  setMode: (mode: CalendarMode) => void;
  currentMonth: Date;
  setCurrentMonth: (date: Date) => void;
  selectedDate: string | null;
  onSelectDate: (dateKey: string) => void;
};

export function TradingCalendar({
  trades,
  mode,
  setMode,
  currentMonth,
  setCurrentMonth,
  selectedDate,
  onSelectDate,
}: TradingCalendarProps) {
  const [open, setOpen] = useState(true);
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const statsByDate = useMemo(() => {
    const grouped: Record<string, Trade[]> = {};
    for (const t of trades) {
      (grouped[t.date] ??= []).push(t);
    }
    const result: Record<string, ReturnType<typeof computeDailyStats>> = {};
    for (const key of Object.keys(grouped)) {
      result[key] = computeDailyStats(grouped[key]);
    }
    return result;
  }, [trades]);

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const emptyStats = { pnl: 0, wins: 0, completed: 0, pct: null, tradeCount: 0 };

  return (
    <div
      onClick={() => setOpen((o) => !o)}
      className="w-full max-w-sm rounded-xl border border-border-soft bg-surface p-[17px] cursor-pointer transition-all"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* No onClick here — the click bubbles up to the card's onClick above,
            so the whole card stays the single source of truth for toggling. */}
        <button
          className="flex items-center gap-1.5 text-dim hover:text-ink transition-colors"
          aria-expanded={open}
        >
          <ChevronDown
            size={15}
            className="transition-transform"
            style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
          />
          <span className="font-serif text-base text-ink">Calendar</span>
        </button>
        {/* Stops clicks on the mode toggle from bubbling up and triggering the whole-card toggle above. */}
        <div onClick={(e) => e.stopPropagation()}>
          <CalendarControls mode={mode} setMode={setMode} />
        </div>
      </div>

      {open && (
        <>
          <div
            className="flex items-center justify-center gap-2 mt-4 mb-3"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
              className="p-1 rounded-md text-dim hover:text-ink transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft size={15} />
            </button>
            <h2 className="font-serif text-base w-36 text-center text-ink">
              {MONTHS[month]} {year}
            </h2>
            <button
              onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
              className="p-1 rounded-md text-dim hover:text-ink transition-colors"
              aria-label="Next month"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[10px] pb-1 text-faint">
                {w[0]}
              </div>
            ))}
          </div>

          {/* Stops day-cell clicks from bubbling up and collapsing the card
              when the user is just selecting a date. */}
          <div className="grid grid-cols-7 gap-1" onClick={(e) => e.stopPropagation()}>
            {cells.map((d, i) => {
              const dateKey = d !== null ? toDateKey(year, month, d) : null;
              return (
                <CalendarDay
                  key={i}
                  day={d}
                  dateKey={dateKey}
                  stats={(dateKey && statsByDate[dateKey]) || emptyStats}
                  mode={mode}
                  isSelected={dateKey === selectedDate}
                  isToday={dateKey === todayKey}
                  onSelect={onSelectDate}
                />
              );
            })}
          </div>

          {/* Bottom collapse button so the user doesn't have to scroll back
              up to the header to close the card. */}
          <div className="mt-3 pt-3 border-t border-border-soft flex justify-center">
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

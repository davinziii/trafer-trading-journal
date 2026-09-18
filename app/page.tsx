"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarMode, Trade } from "@/lib/types";
import { storage } from "@/lib/storage";
import { toDateKey } from "@/lib/calculations";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/layout/EmptyState";
import { TradingCalendar } from "@/components/calendar/TradingCalendar";
import { TradeInsights } from "@/components/trades/TradeInsights";
import { DailyTrades } from "@/components/trades/DailyTrades";
import { Notepad } from "@/components/notepad/Notepad";

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export default function Home() {
  const [trades, setTradesState] = useState<Trade[]>([]);
  const [mode, setMode] = useState<CalendarMode>("pnl");
  const [currentMonth, setCurrentMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(() => {
    const today = new Date();
    return toDateKey(today.getFullYear(), today.getMonth(), today.getDate());
  });
  const [notepadOpen, setNotepadOpen] = useState(true);

  // Loaded flag prevents the initial empty state from overwriting saved data
  // before it has actually been read back from localStorage.
  const hasLoaded = useRef(false);

  useEffect(() => {
    setTradesState(storage.readTrades());
    hasLoaded.current = true;
  }, []);

  // Writes to localStorage happen inside the same state update as the
  // change itself, not in a separate effect a tick later. That way every
  // coin/trade edit is guaranteed to be on disk the moment it's applied,
  // with nothing that a refresh could ever race ahead of.
  const setTrades = useCallback((updater: Trade[] | ((prev: Trade[]) => Trade[])) => {
    setTradesState((prev) => {
      const next = typeof updater === "function" ? (updater as (p: Trade[]) => Trade[])(prev) : updater;
      if (hasLoaded.current) storage.writeTrades(next);
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      <Header />
      <main className="max-w-7xl mx-auto px-6 lg:px-10 py-8">
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <Notepad open={notepadOpen} setOpen={setNotepadOpen} />

          <div className="flex-1 min-w-0 w-full">
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              {selectedDate && <TradeInsights trades={trades} selectedDate={selectedDate} />}
              <TradingCalendar
                trades={trades}
                mode={mode}
                setMode={setMode}
                currentMonth={currentMonth}
                setCurrentMonth={setCurrentMonth}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
              />
            </div>

            {selectedDate ? (
              <DailyTrades dateKey={selectedDate} trades={trades} onChange={setTrades} />
            ) : (
              <EmptyState />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

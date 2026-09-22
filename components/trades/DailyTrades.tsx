"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CoinNote, Trade, RequiredField } from "@/lib/types";
import {
  computeDailyStats,
  formatLongDate,
  getMissingFields,
  isTradeStructurallyComplete,
  makeId,
} from "@/lib/calculations";
import { TradeList } from "./TradeList";
import { TradeSummary } from "./TradeSummary";
import { CoinNotesPanel } from "./CoinNotesPanel";
import { Button } from "@/components/ui/Button";

type DailyTradesProps = {
  dateKey: string;
  trades: Trade[];
  onChange: (trades: Trade[]) => void;
  coinNotes: CoinNote[];
  onChangeCoinNotes: (notes: CoinNote[]) => void;
};

function makeBlankTrade(dateKey: string): Trade {
  return {
    id: makeId(),
    date: dateKey,
    ca: "",
    coinName: "",
    reason: "",
    entry: 0,
    out: 0,
    winLoss: 0,
    winLossTouched: false,
  };
}

export function DailyTrades({ dateKey, trades, onChange, coinNotes, onChangeCoinNotes }: DailyTradesProps) {
  const [rowErrors, setRowErrors] = useState<Record<string, RequiredField[]>>({});

  const dayTrades = useMemo(() => trades.filter((t) => t.date === dateKey), [trades, dateKey]);
  const stats = useMemo(() => computeDailyStats(dayTrades), [dayTrades]);

  // Kept in sync so the deferred Enter-key check below always reads the
  // latest trades, even though the callback that schedules it was created
  // during an earlier render.
  const tradesRef = useRef(trades);
  useEffect(() => {
    tradesRef.current = trades;
  }, [trades]);

  const updateTrade = useCallback(
    (updated: Trade) => {
      onChange(trades.map((t) => (t.id === updated.id ? updated : t)));
      setRowErrors((prev) => {
        if (!prev[updated.id]) return prev;
        const next = { ...prev };
        delete next[updated.id];
        return next;
      });
    },
    [trades, onChange]
  );

  const deleteTrade = useCallback(
    (id: string) => {
      onChange(trades.filter((t) => t.id !== id));
      setRowErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [trades, onChange]
  );

  const handleAddCoin = () => {
    if (dayTrades.length > 0) {
      const last = dayTrades[dayTrades.length - 1];
      const missing = getMissingFields(last);
      if (missing.length > 0) {
        setRowErrors((prev) => ({ ...prev, [last.id]: missing }));
        return;
      }
    }
    onChange([...trades, makeBlankTrade(dateKey)]);
  };

  // Explicit per-row "Add" button: validates that specific row (so the
  // person gets immediate feedback on what's missing), confirms it's saved,
  // and starts a new blank row for the next coin.
  const handleAddFromRow = useCallback(
    (trade: Trade) => {
      const missing = getMissingFields(trade);
      if (missing.length > 0) {
        setRowErrors((prev) => ({ ...prev, [trade.id]: missing }));
        return;
      }
      setRowErrors((prev) => {
        if (!prev[trade.id]) return prev;
        const next = { ...prev };
        delete next[trade.id];
        return next;
      });
      onChange([...trades, makeBlankTrade(dateKey)]);
    },
    [trades, onChange, dateKey]
  );

  // Pressing Enter inside a row blurs the active field first (so a
  // Market-cap/Win-Loss value being typed gets committed), then checks the
  // row again a tick later so it sees that committed value rather than a
  // stale one. If the row is fully filled in, it starts a new blank row.
  const handleRowEnter = useCallback(
    (tradeId: string) => {
      setTimeout(() => {
        const current = tradesRef.current.find((t) => t.id === tradeId);
        if (current && isTradeStructurallyComplete(current)) {
          onChange([...tradesRef.current, makeBlankTrade(dateKey)]);
        }
      }, 0);
    },
    [dateKey, onChange]
  );

  return (
    <div className="mt-6 rounded-xl border border-border-soft bg-surface/40 p-5">
      <div className="flex items-baseline justify-between flex-wrap gap-3 mb-4">
        <h2 className="font-serif text-2xl text-ink">{formatLongDate(dateKey)}</h2>
        <Button onClick={handleAddCoin}>+ Add Coin</Button>
      </div>

      <div className="mb-5">
        <TradeSummary stats={stats} />
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <CoinNotesPanel dateKey={dateKey} notes={coinNotes} onChange={onChangeCoinNotes} />
        <div className="flex-1 min-w-0 w-full">
          {dayTrades.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-faint">
              No trades recorded.
            </div>
          ) : (
            <TradeList
              trades={dayTrades}
              onUpdate={updateTrade}
              onDelete={deleteTrade}
              onRowEnter={handleRowEnter}
              onAddRow={handleAddFromRow}
              rowErrors={rowErrors}
            />
          )}
        </div>
        
      </div>
    </div>
  );
}

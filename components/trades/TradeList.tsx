"use client";

import { Trade, RequiredField } from "@/lib/types";
import { TradeCard } from "./TradeCard";

type TradeListProps = {
  trades: Trade[];
  onUpdate: (trade: Trade) => void;
  onDelete: (id: string) => void;
  onRowEnter: (tradeId: string) => void;
  onAddRow: (trade: Trade) => void;
  rowErrors: Record<string, RequiredField[]>;
};

export function TradeList({ trades, onUpdate, onDelete, onRowEnter, onAddRow, rowErrors }: TradeListProps) {
  return (
    <div className="space-y-2">
      {trades.map((t) => (
        <TradeCard
          key={t.id}
          trade={t}
          onUpdate={onUpdate}
          onDelete={() => onDelete(t.id)}
          onEnterComplete={() => onRowEnter(t.id)}
          onAdd={() => onAddRow(t)}
          errors={rowErrors[t.id]}
        />
      ))}
    </div>
  );
}

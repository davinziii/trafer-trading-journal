"use client";

import { Trade, RequiredField } from "@/lib/types";
import { TradeRow } from "./TradeRow";

type TradeTableProps = {
  trades: Trade[];
  onUpdate: (trade: Trade) => void;
  onDelete: (id: string) => void;
  onRowEnter: (tradeId: string) => void;
  onAddRow: (trade: Trade) => void;
  rowErrors: Record<string, RequiredField[]>;
};

const COLUMNS = ["CA", "Coin", "Why I picked it", "Entry", "Out", "Win / Loss", "", ""];

export function TradeTable({ trades, onUpdate, onDelete, onRowEnter, onAddRow, rowErrors }: TradeTableProps) {
  return (
    <div className="overflow-x-auto scrollbar-thin -mx-1 px-1">
      <table className="min-w-full border-separate" style={{ borderSpacing: "0 2px" }}>
        <thead>
          <tr className="text-left">
            {COLUMNS.map((h) => (
              <th key={h} className="text-xs font-medium pb-2 pr-2 text-faint">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <TradeRow
              key={t.id}
              trade={t}
              onUpdate={onUpdate}
              onDelete={() => onDelete(t.id)}
              onEnterComplete={() => onRowEnter(t.id)}
              onAdd={() => onAddRow(t)}
              errors={rowErrors[t.id]}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

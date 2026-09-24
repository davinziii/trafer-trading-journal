"use client";

import { ReactNode } from "react";
import { Trade, RequiredField } from "@/lib/types";
import { formatAmount, currencyForChain, isPracticeTrade, solColorClass, tradeResult } from "@/lib/calculations";
import { MarketCapField } from "./MarketCapField";
import { CAField } from "./CAField";
import { CoinNameField } from "./CoinNameField";
import { AutoResizeTextarea } from "./AutoResizeTextarea";
import { WinLossField } from "./WinLossField";

type TradeCardProps = {
  trade: Trade;
  onUpdate: (trade: Trade) => void;
  onDelete: () => void;
  onEnterComplete: () => void;
  onAdd: () => void;
  errors?: RequiredField[];
};

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[10px] uppercase tracking-wide text-faint">{label}</span>
      {children}
    </div>
  );
}

export function TradeCard({ trade, onUpdate, onDelete, onEnterComplete, onAdd, errors = [] }: TradeCardProps) {
  const result = tradeResult(trade);
  const hasResultInputs = trade.entry > 0 && trade.out > 0;
  const practice = isPracticeTrade(trade);
  const currency = currencyForChain(trade.caChain);
  const err = (field: RequiredField) => errors.includes(field);

  // Enter inside any single-line field blurs it first (so a Market-cap or
  // Win/Loss value mid-edit gets committed), then asks the parent to check
  // whether the row is now fully filled in. The "why I picked it" textarea
  // is excluded so Enter still just makes a new line there.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement;
    if (target.tagName === "TEXTAREA") return;
    e.preventDefault();
    target.blur();
    onEnterComplete();
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      className="rounded-lg border border-border-soft bg-surface-2/40 p-3 space-y-2.5"
    >
      {/* Row 1: CA, Coin, Why I picked it */}
      <div className="flex flex-wrap items-start gap-2">
        <Field label="CA">
          <CAField
            value={trade.ca}
            chain={trade.caChain}
            chainRemembered={trade.caChainRemembered}
            onChange={(v) => onUpdate({ ...trade, ca: v })}
            onChainChange={(newChain, remembered) =>
              onUpdate({ ...trade, caChain: newChain, caChainRemembered: remembered })
            }
          />
        </Field>
        <Field label="Coin">
          <CoinNameField
            value={trade.coinName}
            error={err("coinName")}
            onChange={(v) => onUpdate({ ...trade, coinName: v })}
          />
        </Field>
        <Field label="Why I picked it" className="flex-1 min-w-[12rem]">
          <AutoResizeTextarea
            value={trade.reason}
            placeholder="Why I picked it"
            error={err("reason")}
            className="w-full"
            onChange={(e) => onUpdate({ ...trade, reason: e.target.value })}
          />
        </Field>
      </div>

      {/* Row 2: Entry, Out, Win/Loss, +, Delete */}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Entry">
          <MarketCapField value={trade.entry} error={err("entry")} onChange={(n) => onUpdate({ ...trade, entry: n })} />
        </Field>
        <Field label="Out">
          <MarketCapField value={trade.out} error={err("out")} onChange={(n) => onUpdate({ ...trade, out: n })} />
        </Field>
        <Field label="Win / Loss">
          <div className="flex items-center gap-1.5">
            <WinLossField
              value={trade.winLoss}
              touched={trade.winLossTouched}
              error={err("winLoss")}
              onChange={(n) => onUpdate({ ...trade, winLoss: n, winLossTouched: true })}
            />
            <span
              className={`font-mono text-sm font-medium whitespace-nowrap ${
                hasResultInputs ? solColorClass(result) : "text-faint"
              }`}
            >
              {hasResultInputs ? formatAmount(result, currency) : currency}
            </span>
          </div>
        </Field>

        {practice && (
          <span className="self-center text-[10px] font-medium uppercase tracking-wide text-rate bg-rate/10 border border-rate/30 rounded px-1.5 py-1 whitespace-nowrap">
            Practice
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5 self-center">
          <button
            onClick={onAdd}
            className="text-xs font-medium rounded-md px-2.5 py-1.5 text-faint hover:text-win hover:bg-win/10 transition-colors"
          >
            + Add More
          </button>
          <button
            onClick={onDelete}
            className="text-xs font-medium rounded-md px-2.5 py-1.5 text-faint hover:text-loss hover:bg-loss/10 transition-colors"
          >
            - Delete
          </button>
        </div>
      </div>
    </div>
  );
}

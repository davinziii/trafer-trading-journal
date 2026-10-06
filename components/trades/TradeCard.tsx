"use client";

import { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Trade, RequiredField } from "@/lib/types";
import {
  formatAmount,
  currencyForChain,
  isPracticeTrade,
  isTradeStructurallyComplete,
  solColorClass,
  tradeOutcome,
  tradeResult,
} from "@/lib/calculations";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
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

const label = "text-[10px] font-medium uppercase tracking-wide text-faint";

const FIELD_NAMES: Record<RequiredField, string> = {
  coinName: "coin",
  reason: "why you picked it",
  entry: "entry MC",
  out: "out MC",
  winLoss: "win / loss",
};

type Status = { text: string; className: string };

function statusFor(trade: Trade): Status {
  if (!isTradeStructurallyComplete(trade)) return { text: "Draft", className: "bg-surface-3 text-faint" };
  if (isPracticeTrade(trade)) return { text: "Practice", className: "bg-rate/10 text-rate" };
  const outcome = tradeOutcome(trade);
  if (outcome === "win") return { text: "Win", className: "bg-win/10 text-win" };
  if (outcome === "loss") return { text: "Loss", className: "bg-loss/10 text-loss" };
  return { text: "Even", className: "bg-surface-3 text-neutral" };
}

function Field({ label: text, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className={`${label} mb-1`}>{text}</div>
      {children}
    </div>
  );
}

/** Tile on the bottom strip (Entry MC / Out MC / Win-Loss / Result). */
function Tile({ title, extra, className = "", children }: { title: string; extra?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-md border px-3 py-2 flex flex-col justify-center min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className={label}>{title}</span>
        {extra}
      </div>
      {children}
    </div>
  );
}

/**
 * One trade as a two-part card, mirroring the thesis coin cards:
 *   top    — coin, contract address, status, actions; then the "why I picked it" note at full width
 *   bottom — Entry MC → Out MC → Win/Loss → Result, the numbers that decide the trade
 */
export function TradeCard({ trade, onUpdate, onDelete, onEnterComplete, onAdd, errors = [] }: TradeCardProps) {
  const result = tradeResult(trade);
  const hasResultInputs = trade.entry > 0 && trade.out > 0;
  const currency = currencyForChain(trade.caChain);
  const err = (field: RequiredField) => errors.includes(field);
  const status = statusFor(trade);
  const mcChange = hasResultInputs ? ((trade.out - trade.entry) / trade.entry) * 100 : undefined;

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

  const resultTone = !hasResultInputs
    ? "border-border-soft bg-surface-2"
    : result > 0
    ? "border-win/30 bg-win/10"
    : result < 0
    ? "border-loss/30 bg-loss/10"
    : "border-border-soft bg-surface-2";

  return (
    <article
      onKeyDown={handleKeyDown}
      className={`rounded-lg border bg-surface transition-colors ${errors.length > 0 ? "border-danger/50" : "border-border-soft hover:border-border"}`}
    >
      {/* TOP — identity + reason */}
      <div className="px-3 sm:px-4 pt-3.5 pb-3 space-y-3">
        <div className="flex flex-wrap items-end gap-x-4 sm:gap-x-5 gap-y-3">
          <Field label="Coin" className="order-1">
            <CoinNameField
              value={trade.coinName}
              error={err("coinName")}
              className="w-28 sm:w-32"
              onChange={(v) => onUpdate({ ...trade, coinName: v })}
            />
          </Field>
          <Field label="Contract" className="order-3 basis-full sm:order-2 sm:basis-auto">
            <CAField
              value={trade.ca}
              chain={trade.caChain}
              chainRemembered={trade.caChainRemembered}
              onChange={(v) => onUpdate({ ...trade, ca: v })}
              onChainChange={(newChain, remembered) => onUpdate({ ...trade, caChain: newChain, caChainRemembered: remembered })}
            />
          </Field>
          <div className="order-2 sm:order-3 ml-auto flex items-center gap-1 h-[34px]">
            <span className={`mr-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${status.className}`}>
              {status.text}
            </span>
            <button
              type="button"
              onClick={onAdd}
              aria-label="Save this coin and add another"
              title="Save this coin and add another"
              className="p-1.5 rounded-md text-faint hover:text-win hover:bg-surface-3 transition-colors"
            >
              <Plus size={16} />
            </button>
            <ConfirmDeleteButton onConfirm={onDelete} label="Delete trade" />
          </div>
        </div>

        <Field label="Why I picked it">
          <AutoResizeTextarea
            value={trade.reason}
            placeholder="What made you take this trade?"
            error={err("reason")}
            className="w-full"
            onChange={(e) => onUpdate({ ...trade, reason: e.target.value })}
          />
        </Field>
      </div>

      {/* BOTTOM — Entry MC → Out MC → Win/Loss → Result */}
      <div className="border-t border-border-soft bg-bg/50 rounded-b-lg px-3 sm:px-4 py-3">
        <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
          <Tile title="Entry MC" className="border-border-soft bg-surface">
            <MarketCapField
              value={trade.entry}
              error={err("entry")}
              className="w-full"
              onChange={(n) => onUpdate({ ...trade, entry: n })}
            />
          </Tile>
          <Tile
            title="Out MC"
            className="border-border-soft bg-surface"
            extra={
              mcChange !== undefined && (
                <span className={`font-mono text-[10px] font-medium ${solColorClass(mcChange)}`} title="Market-cap change from entry to out">
                  {mcChange > 0 ? "+" : ""}
                  {Math.abs(mcChange) < 10 ? mcChange.toFixed(1) : Math.round(mcChange)}%
                </span>
              )
            }
          >
            <MarketCapField value={trade.out} error={err("out")} className="w-full" onChange={(n) => onUpdate({ ...trade, out: n })} />
          </Tile>
          <Tile title="Win / Loss" className="border-border-soft bg-surface">
            <div className="flex items-center gap-1.5">
              <WinLossField
                value={trade.winLoss}
                touched={trade.winLossTouched}
                error={err("winLoss")}
                className="w-full min-w-0"
                onChange={(n) => onUpdate({ ...trade, winLoss: n, winLossTouched: true })}
              />
              <span className="text-xs text-faint">{currency}</span>
            </div>
          </Tile>
          <Tile title="Result" className={resultTone}>
            <div className={`font-mono text-lg font-semibold leading-[34px] ${hasResultInputs ? solColorClass(result) : "text-faint"}`}>
              {hasResultInputs ? formatAmount(result, currency) : "—"}
            </div>
          </Tile>
        </div>

        {errors.length > 0 && (
          <p role="alert" className="mt-2 text-xs text-loss">
            Fill in {errors.map((f) => FIELD_NAMES[f]).join(", ")} before adding another coin.
          </p>
        )}
      </div>
    </article>
  );
}

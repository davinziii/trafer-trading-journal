"use client";

import { Plus, Trash2 } from "lucide-react";
import { Trade, RequiredField } from "@/lib/types";
import { currencyForChain, formatAmount, solColorClass, tradeResult } from "@/lib/calculations";
import { MarketCapField } from "./MarketCapField";
import { CAField } from "./CAField";
import { CoinNameField } from "./CoinNameField";
import { AutoResizeTextarea } from "./AutoResizeTextarea";
import { WinLossField } from "./WinLossField";

type TradeRowProps = {
  trade: Trade;
  onUpdate: (trade: Trade) => void;
  onDelete: () => void;
  onEnterComplete: () => void;
  onAdd: () => void;
  errors?: RequiredField[];
};

export function TradeRow({ trade, onUpdate, onDelete, onEnterComplete, onAdd, errors = [] }: TradeRowProps) {
  const result = tradeResult(trade);
  const hasResultInputs = trade.entry > 0 && trade.out > 0;
  const currency = currencyForChain(trade.caChain);
  const err = (field: RequiredField) => errors.includes(field);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement;
    if (target.tagName === "TEXTAREA") return;
    e.preventDefault();
    target.blur();
    onEnterComplete();
  };

  return (
    <tr className="align-top" onKeyDown={handleKeyDown}>
      <td className="py-1.5 pr-2">
        <CAField
          value={trade.ca}
          chain={trade.caChain}
          chainRemembered={trade.caChainRemembered}
          onChange={(v) => onUpdate({ ...trade, ca: v })}
          onChainChange={(newChain, remembered) =>
            onUpdate({ ...trade, caChain: newChain, caChainRemembered: remembered })
          }
        />
      </td>
      <td className="py-1.5 pr-2">
        <CoinNameField
          value={trade.coinName}
          error={err("coinName")}
          onChange={(v) => onUpdate({ ...trade, coinName: v })}
        />
      </td>
      <td className="py-1.5 pr-2 min-w-[18rem]">
        <AutoResizeTextarea
          value={trade.reason}
          placeholder="Why I picked it"
          error={err("reason")}
          className="w-full min-w-[18rem]"
          onChange={(e) => onUpdate({ ...trade, reason: e.target.value })}
        />
      </td>
      <td className="py-1.5 pr-2">
        <MarketCapField
          value={trade.entry}
          error={err("entry")}
          onChange={(n) => onUpdate({ ...trade, entry: n })}
        />
      </td>
      <td className="py-1.5 pr-2">
        <MarketCapField
          value={trade.out}
          error={err("out")}
          onChange={(n) => onUpdate({ ...trade, out: n })}
        />
      </td>
      <td className="py-1.5 pr-2">
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
      </td>
      <td className="py-1.5 pl-1">
        <button
          onClick={onAdd}
          aria-label="Save this coin and add another"
          title="Save this coin and add another"
          className="p-1.5 rounded-md text-faint hover:text-win transition-colors"
        >
          <Plus size={15} />
        </button>
      </td>
      <td className="py-1.5 pl-1">
        <button
          onClick={onDelete}
          aria-label="Remove trade"
          className="p-1.5 rounded-md text-faint hover:text-loss transition-colors"
        >
          <Trash2 size={15} />
        </button>
      </td>
    </tr>
  );
}
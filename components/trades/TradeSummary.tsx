import { ReactNode } from "react";
import { DailyStats } from "@/lib/types";
import { formatAmount, formatPercent, pnlEntries, solColorClass } from "@/lib/calculations";

type TradeSummaryProps = {
  stats: DailyStats;
};

function StatTile({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-border-soft bg-surface px-3 py-2 min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-wide text-faint mb-0.5">{title}</div>
      <div className="font-mono text-lg font-medium leading-tight">{children}</div>
    </div>
  );
}

export function TradeSummary({ stats }: TradeSummaryProps) {
  const pctLabel = formatPercent(stats.pct);
  const pnlList = stats.tradeCount ? pnlEntries(stats.pnl) : [];

  return (
    <div className={`grid gap-2 grid-cols-2 ${stats.practiceCount > 0 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
      <StatTile title="PNL">
        {pnlList.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {pnlList.map(([currency, amount]) => (
              <span key={currency} className={solColorClass(amount)}>
                {formatAmount(amount, currency)}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-faint">—</span>
        )}
      </StatTile>
      <StatTile title="Winrate">
        {stats.completed > 0 ? (
          <span className="text-rate">
            {stats.wins} / {stats.completed}
            {pctLabel && <span className="text-sm ml-2 opacity-80">{pctLabel}</span>}
          </span>
        ) : (
          <span className="text-faint">—</span>
        )}
      </StatTile>
      <StatTile title="Trades">
        <span className="text-ink">{stats.tradeCount}</span>
      </StatTile>
      {stats.practiceCount > 0 && (
        <StatTile title="Practice">
          <span className="text-rate">{stats.practiceCount}</span>
        </StatTile>
      )}
    </div>
  );
}

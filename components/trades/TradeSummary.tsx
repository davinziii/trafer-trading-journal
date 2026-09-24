import { DailyStats } from "@/lib/types";
import { formatAmount, formatPercent, pnlEntries, solColorClass } from "@/lib/calculations";

type TradeSummaryProps = {
  stats: DailyStats;
};

export function TradeSummary({ stats }: TradeSummaryProps) {
  const pctLabel = formatPercent(stats.pct);
  const pnlList = stats.tradeCount ? pnlEntries(stats.pnl) : [];

  return (
    <div className="rounded-lg border border-border-soft bg-surface px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
      <div>
        <div className="text-xs mb-0.5 text-faint">PNL</div>
        {pnlList.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {pnlList.map(([currency, amount]) => (
              <div key={currency} className={`font-mono text-lg font-medium ${solColorClass(amount)}`}>
                {formatAmount(amount, currency)}
              </div>
            ))}
          </div>
        ) : (
          <div className="font-mono text-lg font-medium text-faint">—</div>
        )}
      </div>
      <div>
        <div className="text-xs mb-0.5 text-faint">Winrate</div>
        <div className={`font-mono text-lg font-medium ${pctLabel ? "text-rate" : "text-faint"}`}>
          {stats.completed > 0 ? `${stats.wins} / ${stats.completed}` : "—"}
          {pctLabel ? <span className="text-sm ml-2">{pctLabel}</span> : null}
        </div>
      </div>
      <div>
        <div className="text-xs mb-0.5 text-faint">Trades</div>
        <div className="font-mono text-lg font-medium text-ink">{stats.tradeCount}</div>
      </div>
      {stats.practiceCount > 0 && (
        <div>
          <div className="text-xs mb-0.5 text-faint">Practice</div>
          <div className="font-mono text-lg font-medium text-rate">{stats.practiceCount}</div>
        </div>
      )}
    </div>
  );
}

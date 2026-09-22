import { DailyStats } from "@/lib/types";
import { formatPercent, formatSol, solColorClass } from "@/lib/calculations";

type TradeSummaryProps = {
  stats: DailyStats;
};

export function TradeSummary({ stats }: TradeSummaryProps) {
  const pctLabel = formatPercent(stats.pct);

  return (
    <div className="rounded-lg border border-border-soft bg-surface px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
      <div>
        <div className="text-xs mb-0.5 text-faint">PNL</div>
        <div className={`font-mono text-lg font-medium ${stats.tradeCount ? solColorClass(stats.pnl) : "text-faint"}`}>
          {stats.tradeCount ? formatSol(stats.pnl) : "—"}
        </div>
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

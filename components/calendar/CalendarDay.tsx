import { CalendarMode, DailyStats } from "@/lib/types";
import { formatAmount, formatPercent, pnlEntries, solColorClass } from "@/lib/calculations";

type CalendarDayProps = {
  day: number | null;
  dateKey: string | null;
  stats: DailyStats;
  mode: CalendarMode;
  isSelected: boolean;
  isToday: boolean;
  onSelect: (dateKey: string) => void;
};

export function CalendarDay({ day, dateKey, stats, mode, isSelected, isToday, onSelect }: CalendarDayProps) {
  if (day === null || dateKey === null) {
    return <div className="aspect-day" />;
  }

  const pnlList = mode === "pnl" && stats.tradeCount > 0 ? pnlEntries(stats.pnl) : [];
  const winrateLabel = mode === "winrate" && stats.completed > 0 ? formatPercent(stats.pct) : null;

  return (
    <button
      onClick={() => onSelect(dateKey)}
      className={`day-cell aspect-day rounded-md border text-left p-1 flex flex-col justify-between transition-colors ${
        isSelected
          ? "border-accent bg-accent-soft"
          : "border-border-soft bg-surface-2 hover:bg-surface-3"
      }`}
    >
      <span
        className={`font-mono text-[10px] ${
          isSelected ? "text-accent" : isToday ? "text-ink font-semibold" : "text-dim"
        }`}
      >
        {day}
      </span>
      {pnlList.length > 0 ? (
        <span className="flex flex-col leading-tight min-w-0">
          {pnlList.map(([currency, amount]) => (
            <span
              key={currency}
              className={`font-mono text-[9px] font-medium truncate ${solColorClass(amount)}`}
            >
              {formatAmount(amount, currency)}
            </span>
          ))}
        </span>
      ) : winrateLabel ? (
        <span className="font-mono text-[9px] font-medium leading-tight truncate text-rate">{winrateLabel}</span>
      ) : (
        <span />
      )}
    </button>
  );
}

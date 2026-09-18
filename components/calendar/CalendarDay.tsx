import { CalendarMode, DailyStats } from "@/lib/types";
import { formatPercent, formatSol, solColorClass } from "@/lib/calculations";

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

  let display: string | null = null;
  let colorClass = "text-faint";

  if (mode === "pnl" && stats.tradeCount > 0) {
    display = formatSol(stats.pnl);
    colorClass = solColorClass(stats.pnl);
  } else if (mode === "winrate" && stats.completed > 0) {
    display = formatPercent(stats.pct);
    colorClass = "text-rate";
  }

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
      {display ? (
        <span className={`font-mono text-[9px] font-medium leading-tight truncate ${colorClass}`}>{display}</span>
      ) : (
        <span />
      )}
    </button>
  );
}

import { CalendarMode, DailyStats } from "@/lib/types";
import { formatAmount, formatPercent, pnlEntries, solColorClass } from "@/lib/calculations";

/** Custom per-day text (used by /thesis). When provided it replaces the journal's PNL/winrate text. */
export type CalendarDayLabel = { text: string; tone: "win" | "loss" | "neutral" | "rate" };

type CalendarDayProps = {
  /** Optional. When set, these labels are shown instead of the journal's PNL/winrate figures. */
  labels?: CalendarDayLabel[];
  day: number | null;
  dateKey: string | null;
  stats: DailyStats;
  mode: CalendarMode;
  isSelected: boolean;
  isToday: boolean;
  onSelect: (dateKey: string) => void;
};

const TONE_CLASS: Record<CalendarDayLabel["tone"], string> = {
  win: "text-win",
  loss: "text-loss",
  neutral: "text-neutral",
  rate: "text-rate",
};

export function CalendarDay({ labels, day, dateKey, stats, mode, isSelected, isToday, onSelect }: CalendarDayProps) {
  if (day === null || dateKey === null) {
    return <div className="aspect-day" />;
  }

  const pnlList = mode === "pnl" && stats.tradeCount > 0 ? pnlEntries(stats.pnl) : [];
  const winrateLabel = mode === "winrate" && stats.completed > 0 ? formatPercent(stats.pct) : null;

  return (
    <button
      onClick={() => onSelect(dateKey)}
      className={`day-cell aspect-day rounded-md border text-left py-1 px-[3px] flex flex-col justify-between transition-colors ${
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
      {labels ? (
        labels.length > 0 ? (
          <span className="flex flex-col leading-tight min-w-0">
            {labels.map((l, i) => (
              <span key={i} className={`font-mono text-[9px] font-medium truncate ${TONE_CLASS[l.tone]}`}>
                {l.text}
              </span>
            ))}
          </span>
        ) : (
          <span />
        )
      ) : pnlList.length > 0 ? (
        <span className="flex flex-col leading-tight min-w-0">
          {pnlList.map(([currency, amount]) => {
            // Currency as a tiny suffix so the number itself fits the narrow cell; full value in the tooltip.
            const full = formatAmount(amount, currency);
            return (
              <span
                key={currency}
                title={full}
                className={`font-mono text-[9px] font-medium tracking-tighter truncate ${solColorClass(amount)}`}
              >
                {full.slice(0, -currency.length - 1)}
                <span className="text-[7px] opacity-70 ml-px">{currency}</span>
              </span>
            );
          })}
        </span>
      ) : winrateLabel ? (
        <span className="font-mono text-[9px] font-medium leading-tight truncate text-rate">{winrateLabel}</span>
      ) : (
        <span />
      )}
    </button>
  );
}

import { CalendarMode } from "@/lib/types";

type CalendarControlsProps = {
  mode: CalendarMode;
  setMode: (mode: CalendarMode) => void;
};

const OPTIONS: { key: CalendarMode; label: string }[] = [
  { key: "winrate", label: "Winrate" },
  { key: "pnl", label: "PNL" },
];

export function CalendarControls({ mode, setMode }: CalendarControlsProps) {
  return (
    <div className="inline-flex rounded-md border border-border bg-surface-2">
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          onClick={() => setMode(opt.key)}
          className={`text-xs font-medium px-3 py-1.5 rounded transition-colors ${
            mode === opt.key ? "bg-surface-3 text-ink" : "text-faint"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

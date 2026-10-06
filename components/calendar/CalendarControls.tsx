import { CalendarMode } from "@/lib/types";

export type CalendarOption<T extends string> = { key: T; label: string };

type CalendarControlsProps<T extends string = CalendarMode> = {
  mode: T;
  setMode: (mode: T) => void;
  /** Defaults to the journal's Winrate / PNL toggle. /thesis passes its own. */
  options?: CalendarOption<T>[];
};

const OPTIONS: CalendarOption<CalendarMode>[] = [
  { key: "winrate", label: "Winrate" },
  { key: "pnl", label: "PNL" },
];

export function CalendarControls<T extends string = CalendarMode>({ mode, setMode, options }: CalendarControlsProps<T>) {
  const opts = (options ?? (OPTIONS as unknown as CalendarOption<T>[]));
  return (
    <div className="inline-flex rounded-md border border-border bg-surface-2">
      {opts.map((opt) => (
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

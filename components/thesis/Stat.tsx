import { ReactNode } from "react";

/** Label-over-value tile, matching the journal's stats bar (text-xs label, mono value). */
export function Stat({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div title={hint}>
      <div className="text-xs mb-0.5 text-faint">{label}</div>
      <div className="font-mono text-lg font-medium text-ink">{children}</div>
    </div>
  );
}

import { Confidence } from "@/lib/thesisAnalysis";

const STYLE: Record<Confidence, string> = {
  low: "text-loss bg-loss/10 border-loss/30",
  moderate: "text-rate bg-rate/10 border-rate/30",
  high: "text-win bg-win/10 border-win/30",
};
const LABEL: Record<Confidence, string> = { low: "Low confidence", moderate: "Moderate", high: "High" };

/** Sample-size rule of thumb — not a statistical confidence interval (hence the tooltip). */
export function ConfidenceBadge({ level, n }: { level: Confidence; n?: number }) {
  return (
    <span
      title="Rule of thumb from sample size and whether the average and median agree. Not a statistical confidence interval."
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide whitespace-nowrap ${STYLE[level]}`}
    >
      {LABEL[level]}
      {n !== undefined && <span className="ml-1 normal-case opacity-80">· n={n}</span>}
    </span>
  );
}

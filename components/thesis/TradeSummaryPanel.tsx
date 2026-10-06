"use client";

import { ReactNode, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatMarketCap } from "@/lib/calculations";
import {
  Analysis,
  CFG,
  Desc,
  HoldStat,
  RangeMode,
  SegStat,
  analyze,
  segPhrase,
} from "@/lib/thesisAnalysis";
import { buildAllPayload } from "@/lib/thesisAi";
import { formatAge, formatPostMins, formatRate, formatSignedPct, holdLabel, pnlTextClass } from "@/lib/thesisCalculations";
import { HOLD_MINUTES, ThesisEntry } from "@/lib/thesisTypes";
import { ConfidenceBadge } from "./Confidence";
import { ThesisAiPanel } from "./ThesisAiPanel";

const dash = <span className="text-faint">—</span>;
const P = ({ v }: { v: number | undefined | null }) =>
  v === undefined || v === null ? dash : <span className={pnlTextClass(v)}>{formatSignedPct(v)}</span>;
const mins = (m: number) => (m === 1 ? "1 min" : `${m} mins`);

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border-soft bg-surface p-4">
      <h4 className="font-serif text-base text-ink">{title}</h4>
      {subtitle && <p className="text-[11px] leading-snug text-faint mt-0.5 mb-3">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border py-5 px-4 text-center text-sm text-faint">{children}</div>;
}

function ModeToggle({ mode, onChange, label }: { mode: RangeMode; onChange: (m: RangeMode) => void; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 text-[11px] text-faint">
      {label}
      <span className="inline-flex rounded-md border border-border bg-surface-2">
        {(["fixed", "auto"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onChange(m)}
            className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${mode === m ? "bg-surface-3 text-ink" : "text-faint"}`}
            title={m === "auto" ? "Data-driven ranges (quantile cut points rounded to tidy numbers). Needs ~20+ entries." : "Preset ranges"}
          >
            {m === "fixed" ? "Preset" : "Auto"}
          </button>
        ))}
      </span>
    </div>
  );
}

export function TradeSummaryPanel({ entries }: { entries: ThesisEntry[] }) {
  const [open, setOpen] = useState(true);
  const [ageMode, setAgeMode] = useState<RangeMode>("fixed");
  const [postMode, setPostMode] = useState<RangeMode>("fixed");
  const [mcMode, setMcMode] = useState<RangeMode>("fixed");

  const a = useMemo(() => analyze(entries, { ageMode, postMode, mcMode }), [entries, ageMode, postMode, mcMode]);
  // AI sees the analysis with *preset* ranges only, so toggling a display option never makes the cached AI text look stale.
  const aiStats = useMemo(() => buildAllPayload(analyze(entries), entries), [entries]);

  return (
    <section className="mt-6 rounded-xl border border-border-soft bg-surface/40 p-5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-dim hover:text-ink transition-colors mb-1"
        aria-expanded={open}
      >
        <ChevronDown size={16} className="transition-transform" style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }} />
        <span className="font-serif text-xl text-ink">Trade Summary</span>
      </button>
      <p className="text-xs text-faint mb-4 ml-6">
        Every day combined — what the data says actually works. Conclusions are gated by sample size and never hardcoded.
      </p>

      {open && (
        <div className="space-y-4">
          <DataBar a={a} />
          <WhatWorks a={a} />
          <BestEntryCard a={a} />
          <EntryTimingCard a={a} postMode={postMode} setPostMode={setPostMode} />
          <HoldCard a={a} />
          <div className="space-y-4">
            <SegmentCard
              title="TYPE performance"
              subtitle="Your manually entered TYPE. Categories with fewer than 3 samples are hidden."
              segs={a.types.shown}
              hidden={a.types.hiddenCount}
              a={a}
              emptyText="No TYPE has 3+ samples yet."
            />
            <SegmentCard
              title="Pre-migration age"
              subtitle="How old the token was before migration (approximate)."
              segs={a.ages.shown}
              hidden={a.ages.hiddenCount}
              a={a}
              emptyText="No age range has 3+ samples yet."
              toggle={<ModeToggle label="Ranges" mode={ageMode} onChange={setAgeMode} />}
              note={a.config.ageMode !== ageMode ? "Not enough data for Auto ranges yet — using presets." : undefined}
            />
            <SegmentCard
              title="Entry market cap"
              subtitle="Market cap recorded at the moment you pasted the CA."
              segs={a.mcs.shown}
              hidden={a.mcs.hiddenCount}
              a={a}
              emptyText="No market-cap range has 3+ samples yet."
              toggle={<ModeToggle label="Ranges" mode={mcMode} onChange={setMcMode} />}
              note={a.config.mcMode !== mcMode ? "Not enough data for Auto ranges yet — using presets." : undefined}
            />
            <WinnersLosers a={a} />
          </div>
          <TimeCard a={a} />
          <NextTests a={a} />
          <Card
            title="AI Trade Summary"
            subtitle="Reads the calculated stats above (never the raw database). Observed data, interpretation and hypotheses are kept separate."
          >
            <ThesisAiPanel
              scope="all"
              cacheKey="all"
              label="All thesis entries"
              stats={aiStats}
              blockedReason={!a.enoughData ? "Not enough data yet. Keep collecting thesis entries." : undefined}
            />
          </Card>
        </div>
      )}
    </section>
  );
}

/* ------------------------------ sections ------------------------------ */

function DataBar({ a }: { a: Analysis }) {
  const c = a.counts;
  return (
    <div className="rounded-lg border border-border-soft bg-surface px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
      <div>
        <div className="text-xs mb-0.5 text-faint">Analysed entries</div>
        <div className="font-mono text-lg font-medium text-ink">
          {c.analyzed}
          <span className="text-xs text-faint ml-1">/ {c.total} recorded</span>
        </div>
      </div>
      {c.tracking > 0 && (
        <div>
          <div className="text-xs mb-0.5 text-faint">Still tracking</div>
          <div className="font-mono text-lg font-medium text-ink">{c.tracking}</div>
        </div>
      )}
      {c.sparse > 0 && (
        <div title={`A finished entry needs ${CFG.MIN_SNAPSHOTS_PER_ENTRY} of its 10 snapshots to count.`}>
          <div className="text-xs mb-0.5 text-faint">Too many missed snapshots</div>
          <div className="font-mono text-lg font-medium text-loss">{c.sparse}</div>
        </div>
      )}
      <div className="flex-1 min-w-[12rem]">
        <div className="text-xs mb-1 text-faint">
          Progress to first conclusions ({CFG.MIN_TOTAL}) and a solid sample ({CFG.TARGET_SAMPLES})
        </div>
        <div className="h-1.5 rounded bg-surface-3 overflow-hidden">
          <div className="h-full bg-accent" style={{ width: `${Math.min(100, (c.analyzed / CFG.TARGET_SAMPLES) * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

function WhatWorks({ a }: { a: Analysis }) {
  return (
    <Card title="What Actually Works">
      {!a.enoughData ? (
        <Empty>
          <p className="text-ink">Not enough data yet. Keep collecting thesis entries.</p>
          <p className="text-xs mt-1">
            {a.counts.analyzed} of {CFG.MIN_TOTAL} finished entries so far.
          </p>
        </Empty>
      ) : a.findings.length === 0 ? (
        <Empty>No hold or setup has enough samples to call yet. Keep collecting entries.</Empty>
      ) : (
        <ul className="space-y-2">
          {a.findings.map((f) => (
            <li key={f.id} className="flex flex-wrap items-start gap-x-3 gap-y-1">
              <span className="text-[11px] uppercase tracking-wide text-faint w-36 flex-shrink-0 pt-0.5">{f.label}</span>
              <span className="text-sm text-ink flex-1 min-w-[14rem] leading-relaxed">{f.text}</span>
              <ConfidenceBadge level={f.confidence} n={f.n} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SetupLine({ label, seg, a }: { label: string; seg?: SegStat; a: Analysis }) {
  if (!seg || !seg.atBasis || !a.bestEntry) return null;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="text-[11px] uppercase tracking-wide text-faint w-28 flex-shrink-0">{label}</span>
      <span className="text-ink flex-1 min-w-[12rem]">
        {segPhrase(seg)} — median <P v={seg.atBasis.median} /> at {mins(a.bestEntry.basisMinute)}, win rate {formatRate(seg.atBasis.winRate)}
      </span>
      <ConfidenceBadge level={seg.confidence} n={seg.n} />
    </li>
  );
}

function BestEntryCard({ a }: { a: Analysis }) {
  const be = a.bestEntry;
  return (
    <Card
      title="Best Entry"
      subtitle="Which entry conditions have done best, ranked by median PNL at the best holding time. Only setups with 5+ samples that beat the overall median can appear."
    >
      {!a.enoughData ? (
        <Empty>Not enough data yet. Keep collecting thesis entries.</Empty>
      ) : !be ? (
        <Empty>No pre-migration age, post-migration time, entry-MC range, type or combination has both enough samples and a result better than average yet.</Empty>
      ) : (
        <>
          <p className="text-xs text-faint mb-2">
            Overall median at a {mins(be.basisMinute)} hold: <P v={be.baselineMedian} /> ({be.baselineN} entries)
          </p>
          <ul className="space-y-2.5">
            <SetupLine label="Best combination" seg={be.combo} a={a} />
            <SetupLine label="Pre-migration age" seg={be.age} a={a} />
            <SetupLine label="Post-migration time" seg={be.post} a={a} />
            <SetupLine label="Entry MC" seg={be.mc} a={a} />
            <SetupLine label="Type" seg={be.type} a={a} />
          </ul>
          <p className="text-[11px] text-faint mt-3 leading-snug">
            Many slices of the data are compared, so the top slice usually looks better than it will going forward. Treat it as something to re-test, not a rule.
          </p>
        </>
      )}
    </Card>
  );
}

function EntryTimingCard({ a, postMode, setPostMode }: { a: Analysis; postMode: RangeMode; setPostMode: (m: RangeMode) => void }) {
  const t = a.entryTiming;
  return (
    <Card
      title="Best Time to Get In"
      subtitle="Compares the POST-MIGRATION TIME you entered on each coin (minutes after migration at entry)."
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ModeToggle label="Ranges" mode={postMode} onChange={setPostMode} />
      </div>
      {t.best ? (
        <p className="text-sm text-ink mb-3 leading-relaxed">
          Best so far: <b className="font-medium">{t.best.seg.label} after migration</b> — median <P v={(t.best.seg.atBasis as Desc).median} /> at a{" "}
          {mins(a.basisMinute as number)} hold
          {t.best.runnerUp && (
            <>
              {" "}
              vs <P v={(t.best.runnerUp.atBasis as Desc).median} /> for {t.best.runnerUp.label}
            </>
          )}
          . <ConfidenceBadge level={t.best.seg.confidence} n={t.best.seg.n} />
        </p>
      ) : (
        <p className="text-sm text-dim mb-3">{t.noVerdictReason ?? "No verdict yet."}</p>
      )}
      {t.ranges.length > 0 ? (
        <SegmentTable segs={t.ranges} a={a} firstCol="After migration" />
      ) : (
        <Empty>No post-migration range has 3+ samples yet.</Empty>
      )}
      {a.config.postMode !== postMode && <p className="text-[11px] text-faint mt-2">Not enough data for Auto ranges yet — using presets.</p>}

      {a.enoughData && (
        <details className="mt-4 group">
          <summary className="cursor-pointer text-xs font-medium text-faint hover:text-ink transition-colors">
            What if I&apos;d entered later than I did?
          </summary>
          <p className="text-[11px] text-faint leading-snug mt-2 mb-2">
            Computed from each coin&apos;s own tracked minutes: enter N minutes after your logged entry, exit H minutes after that (median PNL, samples in small text).
            Entries <i>earlier</i> than your logged entry can&apos;t be evaluated — nothing before the paste moment was recorded.
          </p>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="text-xs font-mono border-separate" style={{ borderSpacing: "2px" }}>
              <thead>
                <tr className="text-faint font-sans">
                  <th className="px-2 text-left font-medium">Extra delay ↓ / hold →</th>
                  {[1, 2, 3, 4, 5].map((h) => (
                    <th key={h} className="px-2 font-medium">
                      {holdLabel(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3, 4, 5].map((d) => (
                  <tr key={d}>
                    <td className="px-2 text-faint font-sans">{d === 0 ? "as logged" : `+${d} min`}</td>
                    {[1, 2, 3, 4, 5].map((h) => {
                      const cell = t.laterMatrix.find((c) => c.delay === d && c.hold === h);
                      const dsc = cell?.desc;
                      return (
                        <td key={h} className="px-2 py-1 bg-surface-2 rounded text-right">
                          {dsc && dsc.n >= CFG.MIN_SEGMENT_SHOW ? (
                            <>
                              <P v={dsc.median} /> <span className="text-[9px] text-faint">n={dsc.n}</span>
                            </>
                          ) : (
                            dash
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Card>
  );
}

function HoldCard({ a }: { a: Analysis }) {
  const p = a.picks;
  const tags = new Map<number, string[]>();
  const tag = (h: HoldStat | undefined, label: string) => {
    if (!h) return;
    tags.set(h.minute, [...(tags.get(h.minute) ?? []), label]);
  };
  tag(p.bestHolding, "Best hold");
  tag(p.bestExit, "Best exit");
  tag(p.highestAvg, "Top avg");
  tag(p.highestWinRate, "Top win rate");
  tag(p.mostConsistent, "Most consistent");
  tag(p.bestRiskReward, "Best risk/reward");

  return (
    <Card
      title="Best Time to Get Out"
      subtitle="Fixed-hold results: what exiting exactly N minutes after entry would have returned. Highest PNL is hindsight and is not used for these picks."
    >
      {a.counts.analyzed === 0 ? (
        <Empty>No finished entries yet.</Empty>
      ) : (
        <>
          {a.enoughData && (
            <div className="mb-3 space-y-1.5 text-sm">
              {!p.anyPositive && (
                <p className="text-loss">No holding duration has a positive median or average yet — the data doesn&apos;t show an edge so far.</p>
              )}
              <PickLine label="Best exit (highest median)" h={p.bestExit} />
              <PickLine label="Best holding time (balanced)" h={p.bestHolding} extra="weighs PNL, win rate, consistency and sample size" />
              <PickLine label="Highest average PNL" h={p.highestAvg} />
              <PickLine label="Highest win rate" h={p.highestWinRate} />
              <PickLine label="Most consistent" h={p.mostConsistent} extra="tightest spread of outcomes" />
              <PickLine label="Best risk/reward" h={p.bestRiskReward} extra="average ÷ variability" />
              {p.frequentLargeLosses.length > 0 && (
                <p className="text-xs text-dim">
                  Frequent large losses ({CFG.BIG_LOSS_PCT}% or worse in 25%+ of entries):{" "}
                  <span className="text-loss">{p.frequentLargeLosses.map((h) => holdLabel(h.minute)).join(", ")}</span>
                </p>
              )}
              {p.frequentLargeWins.length > 0 && (
                <p className="text-xs text-dim">
                  Frequent large wins (+{CFG.BIG_WIN_PCT}% or better in 25%+ of entries):{" "}
                  <span className="text-win">{p.frequentLargeWins.map((h) => holdLabel(h.minute)).join(", ")}</span>
                </p>
              )}
            </div>
          )}
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[40rem] text-sm border-separate" style={{ borderSpacing: "0 2px" }}>
              <thead>
                <tr className="text-left">
                  {["Hold", "Samples", "Avg PNL", "Median PNL", "Win rate", "Big losses", "Big wins", "Confidence", ""].map((h) => (
                    <th key={h} className="text-[11px] font-medium uppercase tracking-wide text-faint px-2 pb-2 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {a.holds.map((h) => (
                  <tr key={h.minute} className="bg-surface-2/40 font-mono">
                    <td className="px-2 py-1.5 rounded-l-md font-sans text-ink whitespace-nowrap">{holdLabel(h.minute)}</td>
                    <td className="px-2 py-1.5 text-dim">{h.desc?.n ?? 0}</td>
                    <td className="px-2 py-1.5">
                      <P v={h.desc?.mean} />
                    </td>
                    <td className="px-2 py-1.5">
                      <P v={h.desc?.median} />
                    </td>
                    <td className="px-2 py-1.5 text-ink">{h.desc ? formatRate(h.desc.winRate) : dash}</td>
                    <td className="px-2 py-1.5 text-dim" title={`Share of entries at ${CFG.BIG_LOSS_PCT}% or worse`}>
                      {h.desc ? formatRate(h.desc.bigLossShare) : dash}
                    </td>
                    <td className="px-2 py-1.5 text-dim" title={`Share of entries at +${CFG.BIG_WIN_PCT}% or better`}>
                      {h.desc ? formatRate(h.desc.bigWinShare) : dash}
                    </td>
                    <td className="px-2 py-1.5 font-sans">{h.desc ? <ConfidenceBadge level={h.confidence} /> : dash}</td>
                    <td className="px-2 py-1.5 rounded-r-md font-sans text-[10px] text-accent whitespace-nowrap">{(tags.get(h.minute) ?? []).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {a.peak.desc && (
            <p className="text-[11px] text-faint mt-3 leading-snug">
              Highest PNL (hindsight): median <P v={a.peak.desc.median} />, average <P v={a.peak.desc.mean} />; {formatRate(a.peak.everGreenRate)} of entries were green at some point. The peak most often came at{" "}
              {a.peak.medianMinute !== undefined ? mins(Math.round(a.peak.medianMinute)) : "—"} (median) — it&apos;s a ceiling, not an achievable result.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function PickLine({ label, h, extra }: { label: string; h?: HoldStat; extra?: string }) {
  if (!h || !h.desc) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-[11px] uppercase tracking-wide text-faint w-52 flex-shrink-0">{label}</span>
      <span className="text-ink">
        <b className="font-medium">{mins(h.minute)}</b> — avg <P v={h.desc.mean} />, median <P v={h.desc.median} />, win rate {formatRate(h.desc.winRate)}
      </span>
      <span className="text-[11px] text-faint">{extra}</span>
      <ConfidenceBadge level={h.confidence} n={h.desc.n} />
    </div>
  );
}

function SegmentTable({ segs, a, firstCol }: { segs: SegStat[]; a: Analysis; firstCol: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const heads = [firstCol, "Samples", "Win rate", "Avg highest", "Median highest", "Best hold", "Confidence"];
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[34rem] text-sm border-separate" style={{ borderSpacing: "0 2px" }}>
        <thead>
          <tr className="text-left">
            {heads.map((h) => (
              <th key={h} className="text-[11px] font-medium uppercase tracking-wide text-faint px-2 pb-2 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {segs.map((s) => (
            <SegmentRows key={s.key} s={s} open={expanded === s.key} onToggle={() => setExpanded(expanded === s.key ? null : s.key)} cols={heads.length} />
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-faint mt-1">
        Win rate is measured at each row&apos;s own best hold. Click a row for average PNL at every minute.
        {a.basisMinute ? ` Rankings elsewhere use the overall ${mins(a.basisMinute)} hold.` : ""}
      </p>
    </div>
  );
}

function SegmentRows({ s, open, onToggle, cols }: { s: SegStat; open: boolean; onToggle: () => void; cols: number }) {
  return (
    <>
      <tr onClick={onToggle} className="bg-surface-2/40 hover:bg-surface-2 cursor-pointer font-mono">
        <td className="px-2 py-1.5 rounded-l-md font-sans text-ink whitespace-nowrap">{s.label}</td>
        <td className="px-2 py-1.5 text-dim">{s.n}</td>
        <td className="px-2 py-1.5 text-ink">{s.bestHold ? formatRate(s.bestHold.winRate) : dash}</td>
        <td className="px-2 py-1.5">
          <P v={s.peak.mean} />
        </td>
        <td className="px-2 py-1.5">
          <P v={s.peak.median} />
        </td>
        <td className="px-2 py-1.5 text-ink font-sans whitespace-nowrap">{s.bestHold ? mins(s.bestHold.minute) : dash}</td>
        <td className="px-2 py-1.5 rounded-r-md font-sans">
          <ConfidenceBadge level={s.confidence} />
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={cols} className="pb-1">
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1">
              {HOLD_MINUTES.map((m) => {
                const d = s.perMinute[m - 1];
                return (
                  <div key={m} className="rounded border border-border-soft bg-surface px-1.5 py-1 text-center">
                    <div className="text-[9px] text-faint">{holdLabel(m)}</div>
                    <div className="font-mono text-xs">{d ? <P v={d.mean} /> : dash}</div>
                    <div className="text-[9px] text-faint">n={d?.n ?? 0}</div>
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function SegmentCard({
  title,
  subtitle,
  segs,
  hidden,
  a,
  emptyText,
  toggle,
  note,
}: {
  title: string;
  subtitle: string;
  segs: SegStat[];
  hidden: number;
  a: Analysis;
  emptyText: string;
  toggle?: ReactNode;
  note?: string;
}) {
  return (
    <Card title={title} subtitle={subtitle}>
      {toggle && <div className="mb-3">{toggle}</div>}
      {segs.length === 0 ? <Empty>{emptyText}</Empty> : <SegmentTable segs={segs} a={a} firstCol={title.startsWith("TYPE") ? "Type" : "Range"} />}
      {hidden > 0 && <p className="text-[11px] text-faint mt-2">{hidden} more with fewer than {CFG.MIN_SEGMENT_SHOW} samples hidden.</p>}
      {note && <p className="text-[11px] text-faint mt-1">{note}</p>}
    </Card>
  );
}

function WinnersLosers({ a }: { a: Analysis }) {
  const w = a.winnersLosers;
  const row = (label: string, win: ReactNode, lose: ReactNode) => (
    <tr key={label} className="bg-surface-2/40">
      <td className="px-2 py-1.5 rounded-l-md text-faint text-xs">{label}</td>
      <td className="px-2 py-1.5 font-mono">{win}</td>
      <td className="px-2 py-1.5 rounded-r-md font-mono">{lose}</td>
    </tr>
  );
  return (
    <Card
      title="Winners vs losers"
      subtitle={w ? `Winners = positive PNL at the ${mins(w.basisMinute)} hold; losers = zero or negative.` : "Compares what winners and losers have in common."}
    >
      {!w ? (
        <Empty>Not enough data yet.</Empty>
      ) : (
        <table className="w-full text-sm border-separate" style={{ borderSpacing: "0 2px" }}>
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-faint">
              <th className="px-2 pb-2 font-medium" />
              <th className="px-2 pb-2 font-medium">Winners ({w.winners})</th>
              <th className="px-2 pb-2 font-medium">Losers ({w.losers})</th>
            </tr>
          </thead>
          <tbody>
            {row("Median pre-migration age", fmtAge(w.medianAge.winners), fmtAge(w.medianAge.losers))}
            {row("Median post-migration time", fmtPost(w.medianPostMigration.winners), fmtPost(w.medianPostMigration.losers))}
            {row("Median entry MC", fmtMc(w.medianMc.winners), fmtMc(w.medianMc.losers))}
            {row("Median highest PNL", <P v={w.medianPeak.winners} />, <P v={w.medianPeak.losers} />)}
            {row(
              "Peak usually at",
              w.medianPeakMinute.winners !== undefined ? mins(Math.round(w.medianPeakMinute.winners)) : dash,
              w.medianPeakMinute.losers !== undefined ? mins(Math.round(w.medianPeakMinute.losers)) : dash
            )}
            {row(
              "Most common type",
              w.topType.winners ? `${w.topType.winners.label} (${formatRate(w.topType.winners.share)})` : dash,
              w.topType.losers ? `${w.topType.losers.label} (${formatRate(w.topType.losers.share)})` : dash
            )}
          </tbody>
        </table>
      )}
    </Card>
  );
}
const fmtAge = (m?: number) => (m === undefined ? dash : formatAge(m * 60_000));
const fmtPost = (m?: number) => (m === undefined ? dash : formatPostMins(Math.round(m * 10) / 10));
const fmtMc = (v?: number) => (v === undefined ? dash : formatMarketCap(v));

function TimeCard({ a }: { a: Analysis }) {
  if (a.weekdays.shown.length === 0 && a.timeBlocks.shown.length === 0) return null;
  return (
    <details className="rounded-lg border border-border-soft bg-surface p-4">
      <summary className="cursor-pointer font-serif text-base text-ink">Time of day &amp; day of week</summary>
      <p className="text-[11px] text-faint mt-1 mb-3">Your local time. Only slots with 3+ samples are shown — these thin out quickly, so be skeptical.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {a.timeBlocks.shown.length > 0 && <SegmentTable segs={a.timeBlocks.shown} a={a} firstCol="Time of day" />}
        {a.weekdays.shown.length > 0 && <SegmentTable segs={a.weekdays.shown} a={a} firstCol="Weekday" />}
      </div>
    </details>
  );
}

function NextTests({ a }: { a: Analysis }) {
  return (
    <Card title="What Should I Test Next?" subtitle="Experiments suggested by gaps and tensions in your own data.">
      {a.nextTests.length === 0 ? (
        <Empty>Nothing specific yet.</Empty>
      ) : (
        <ul className="space-y-2">
          {a.nextTests.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-ink">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 bg-rate" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

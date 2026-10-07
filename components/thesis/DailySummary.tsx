"use client";

import { useMemo } from "react";
import { formatMarketCap, formatLongDate } from "@/lib/calculations";
import { summarizeDay } from "@/lib/thesisAnalysis";
import { buildDayPayload } from "@/lib/thesisAi";
import {
  formatAge,
  formatPostMins,
  formatRate,
  formatSignedPct,
  highestPnl,
  holdLabel,
  isComplete,
  pnlTextClass,
} from "@/lib/thesisCalculations";
import { ThesisEntry } from "@/lib/thesisTypes";
import { Stat } from "./Stat";
import { ThesisAiPanel } from "./ThesisAiPanel";

const dash = <span className="text-faint">—</span>;
const pct = (x: number | undefined) => (x === undefined ? dash : <span className={pnlTextClass(x)}>{formatSignedPct(x)}</span>);

export function DailySummary({ dateKey, entries }: { dateKey: string; entries: ThesisEntry[] }) {
  const d = useMemo(() => summarizeDay(entries), [entries]);
  const label = formatLongDate(dateKey);
  const stats = useMemo(() => buildDayPayload(label, entries, d), [label, entries, d]);

  return (
    <section className="mt-6 rounded-xl border border-border-soft bg-surface/40 p-5">
      <h3 className="font-serif text-xl text-ink mb-4">Daily Summary</h3>

      {d.total === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-faint">
          No thesis entries for this day.
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-lg border border-border-soft bg-surface px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-3">
            <Stat label="Entries">
              {d.total}
              {d.tracking > 0 && <span className="text-xs text-faint ml-2">{d.tracking} tracking</span>}
            </Stat>
            <Stat label="Positive" hint="Entries whose Highest PNL was above 0 (it was green at some point)">
              <span className="text-win">{d.positive}</span>
            </Stat>
            <Stat label="Negative" hint="Entries whose Highest PNL was below 0 (never green in 10 minutes)">
              <span className="text-loss">{d.negative}</span>
            </Stat>
            <Stat label="Win rate" hint="Positive entries ÷ finished entries, by Highest PNL (hindsight peak). Fixed-hold win rates are in the per-minute row below.">
              <span className="text-rate">{formatRate(d.winRate)}</span>
            </Stat>
            <Stat label="Avg highest PNL">{pct(d.avgPeak)}</Stat>
            <Stat label="Median highest PNL">{pct(d.medianPeak)}</Stat>
          </div>

          <div className="rounded-lg border border-border-soft bg-surface px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-3">
            <Stat label="Best thesis">
              {d.best ? (
                <>
                  <span className="text-ink">${d.best.ticker}</span> {pct(d.best.pnl)}
                </>
              ) : (
                dash
              )}
            </Stat>
            <Stat label="Worst thesis">
              {d.worst ? (
                <>
                  <span className="text-ink">${d.worst.ticker}</span> {pct(d.worst.pnl)}
                </>
              ) : (
                dash
              )}
            </Stat>
            <Stat label="Avg entry MC">{d.avgEntryMc !== undefined ? formatMarketCap(d.avgEntryMc) : dash}</Stat>
            <Stat label="Avg post-migration time">{d.avgPostMigrationMins !== undefined ? formatPostMins(Math.round(d.avgPostMigrationMins * 10) / 10) : dash}</Stat>
            <Stat label="Avg pre-migration age">{d.avgPreMigrationAgeMin !== undefined ? formatAge(d.avgPreMigrationAgeMin * 60_000) : dash}</Stat>
            <Stat label="Most common type">
              {d.mostCommonType ? (
                <>
                  {d.mostCommonType.label} <span className="text-xs text-faint">×{d.mostCommonType.n}</span>
                </>
              ) : (
                dash
              )}
            </Stat>
            <Stat label="Best holding duration" hint="Highest average PNL across the day's finished entries. A single day is a tiny sample — treat as a curiosity.">
              {d.bestHold ? (
                <>
                  {holdLabel(d.bestHold.minute)} {pct(d.bestHold.avg)}
                </>
              ) : (
                dash
              )}
            </Stat>
          </div>

          <div>
            <div className="text-xs mb-2 text-faint">Average PNL if held for…</div>
            <div className="overflow-x-auto scrollbar-thin">
              <div className="grid grid-cols-10 gap-1.5 min-w-[40rem]">
                {d.perMinute.map((p) => (
                  <div
                    key={p.minute}
                    className={`rounded-md border px-2 py-1.5 text-center ${
                      d.bestHold?.minute === p.minute ? "border-accent bg-accent-soft" : "border-border-soft bg-surface-2"
                    }`}
                    title={p.n ? `${p.n} finished entr${p.n === 1 ? "y" : "ies"} had a snapshot at this minute` : "No data"}
                  >
                    <div className="text-[10px] text-faint">{holdLabel(p.minute)}</div>
                    <div className="font-mono text-sm font-medium">{p.avg === undefined ? dash : <span className={pnlTextClass(p.avg)}>{formatSignedPct(p.avg)}</span>}</div>
                    <div className="text-[9px] text-faint">n={p.n}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <CoinNotes entries={entries} />

          <div>
            <div className="text-xs mb-2 text-faint">AI summary for this day</div>
            <ThesisAiPanel
              scope="day"
              cacheKey={`day:${dateKey}`}
              label={label}
              stats={stats}
              buttonLabel="Get Summary"
              blockedReason={d.completed === 0 ? "Finish at least one entry (10 minutes of tracking) to get a summary for this day." : undefined}
            />
          </div>
        </div>
      )}
    </section>
  );
}

/** The day's per-coin notes next to how each coin did, so the reasoning sits beside the result. */
function CoinNotes({ entries }: { entries: ThesisEntry[] }) {
  const noted = entries.filter((e) => e.notes?.trim());
  return (
    <div>
      <div className="text-xs mb-2 text-faint">
        Coin notes <span className="text-faint/70">· {noted.length} of {entries.length}</span>
      </div>
      {noted.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-faint">
          No notes yet — add one in the Note field on any coin card above.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {noted.map((e) => {
            const hp = highestPnl(e);
            return (
              <li key={e.id} className="rounded-md border border-border-soft bg-surface px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm font-medium text-ink">${e.ticker}</span>
                  {e.type.trim() && (
                    <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-dim">{e.type}</span>
                  )}
                  <span className="ml-auto font-mono text-xs">
                    {hp ? (
                      <span className={pnlTextClass(hp.percentage)} title="Highest PNL">
                        {formatSignedPct(hp.percentage)}
                      </span>
                    ) : (
                      <span className="text-faint">{isComplete(e) ? "—" : "tracking"}</span>
                    )}
                  </span>
                </div>
                <p className="text-sm text-dim leading-snug whitespace-pre-wrap break-words">{e.notes!.trim()}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

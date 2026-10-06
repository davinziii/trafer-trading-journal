/**
 * Builds the structured stats the thesis AI receives (never the raw database), and checks
 * the AI's answer afterwards: any number in its text that can't be traced back to the
 * supplied stats is reported, so invented statistics get flagged instead of trusted.
 */
import { formatMarketCap } from "./calculations";
import { highestPnl, pnlAt, postMigrationTime, resolvePreMigrationAgeMs } from "./thesisCalculations";
import { Analysis, Desc, DailySummary, SegStat, HoldStat } from "./thesisAnalysis";
import { HOLD_MINUTES, ThesisEntry, ThesisSummaryContent, ThesisSummaryScope } from "./thesisTypes";

const r1 = (x: number | undefined | null) => (x === undefined || x === null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r0 = (x: number | undefined | null) => (x === undefined || x === null || !Number.isFinite(x) ? null : Math.round(x));

function descOut(d: Desc | null) {
  if (!d) return null;
  return {
    samples: d.n,
    avgPnlPct: r1(d.mean),
    medianPnlPct: r1(d.median),
    winRatePct: r0(d.winRate * 100),
    p25PnlPct: r1(d.p25),
    p75PnlPct: r1(d.p75),
    shareLosingAtLeast30PctPct: r0(d.bigLossShare * 100),
    shareGainingAtLeast100PctPct: r0(d.bigWinShare * 100),
  };
}

function segOut(s: SegStat) {
  return {
    dimension: s.dim,
    segment: s.label,
    samples: s.n,
    confidence: s.confidence,
    everGreenRatePct: r0(s.everGreenRate * 100),
    avgHighestPnlPct: r1(s.peak.mean),
    medianHighestPnlPct: r1(s.peak.median),
    atBasisHold: descOut(s.atBasis),
    bestHoldWithinSegment: s.bestHold
      ? { minutes: s.bestHold.minute, medianPnlPct: r1(s.bestHold.median), winRatePct: r0(s.bestHold.winRate * 100), samples: s.bestHold.n }
      : null,
  };
}

function holdOut(h: HoldStat | undefined) {
  return h && h.desc ? { minutes: h.minute, confidence: h.confidence, ...descOut(h.desc) } : null;
}

export function buildAllPayload(a: Analysis, entries: ThesisEntry[] = []) {
  const notes = recentNotes(entries);
  return {
    scope: "all historical thesis entries",
    notes: [
      "PNL is hypothetical: entry market cap = market cap when the CA was submitted; hold PNL = (market cap at minute N / entry market cap − 1) × 100.",
      "'Highest PNL' is the best observed minute in hindsight and is NOT achievable in practice; fixed-hold PNL is what an exit at that minute would have returned.",
      "Pre-migration age is approximate (DexScreener has no migration timestamp field).",
      "Confidence labels are sample-size rules of thumb, not statistical confidence intervals.",
    ],
    dataCounts: a.counts,
    analysableEntries: a.counts.analyzed,
    enoughDataForConclusions: a.enoughData,
    basisHoldMinutes: a.basisMinute ?? null,
    overallAtBasisHold: descOut(a.baseline ?? null),
    perHoldMinute: a.holds.map((h) => ({ minutes: h.minute, eligibleForPicks: h.eligible, confidence: h.confidence, ...descOut(h.desc) })),
    holdPicks: {
      bestHolding: holdOut(a.picks.bestHolding),
      bestExitByMedian: holdOut(a.picks.bestExit),
      highestAverage: holdOut(a.picks.highestAvg),
      highestWinRate: holdOut(a.picks.highestWinRate),
      mostConsistent: holdOut(a.picks.mostConsistent),
      bestRiskReward: holdOut(a.picks.bestRiskReward),
      holdsWithFrequentLargeLosses: a.picks.frequentLargeLosses.map((h) => h.minute),
      holdsWithFrequentLargeWins: a.picks.frequentLargeWins.map((h) => h.minute),
      anyHoldHasPositiveMedianOrAverage: a.picks.anyPositive,
    },
    highestPnl: {
      ...descOut(a.peak.desc),
      medianMinuteOfPeak: a.peak.medianMinute ?? null,
      entriesEverGreenPct: a.peak.everGreenRate !== undefined ? r0(a.peak.everGreenRate * 100) : null,
      peakMinuteHistogram: a.peak.histogram,
    },
    byType: a.types.shown.map(segOut),
    byPreMigrationAge: a.ages.shown.map(segOut),
    byPostMigrationTime: a.posts.shown.map(segOut),
    byEntryMarketCap: a.mcs.shown.map(segOut),
    topCombinations: a.combos
      .filter((c) => c.atBasis)
      .sort((x, y) => (y.atBasis as Desc).median - (x.atBasis as Desc).median)
      .slice(0, 5)
      .map(segOut),
    byWeekday: a.weekdays.shown.map(segOut),
    byTimeOfDay: a.timeBlocks.shown.map(segOut),
    winnersVsLosers: a.winnersLosers
      ? {
          ...a.winnersLosers,
          medianMcWinners: a.winnersLosers.medianMc.winners !== undefined ? formatMarketCap(a.winnersLosers.medianMc.winners) : null,
          medianMcLosers: a.winnersLosers.medianMc.losers !== undefined ? formatMarketCap(a.winnersLosers.medianMc.losers) : null,
        }
      : null,
    entryTiming: {
      note: "POST-MIGRATION TIME is typed by the trader per coin (minutes after migration when they entered). Only compare ranges that have enough samples.",
      distinctPostMigrationMinutes: a.entryTiming.distinctMinutes,
      bestRange: a.entryTiming.best
        ? { range: a.entryTiming.best.seg.label, ...segOut(a.entryTiming.best.seg) }
        : null,
      noVerdictReason: a.entryTiming.noVerdictReason ?? null,
      enteredVsDexScreenerMeasured: a.entryTiming.enteredVsMeasured,
      laterEntryCheck: {
        holdMinutesUsed: a.entryTiming.laterBasisHold,
        bestExtraDelayMinutes: a.entryTiming.laterBest ? a.entryTiming.laterBest.delay : null,
      },
    },
    entryNotes: notes,
    ruleBasedFindings: a.findings.map((f) => ({ label: f.label, text: f.text, confidence: f.confidence, samples: f.n })),
    ruleBasedNextTests: a.nextTests,
  };
}

/** The trader's own per-coin notes (most recent first, trimmed), with the outcome they belong to. */
function recentNotes(entries: ThesisEntry[], limit = 12) {
  return entries
    .filter((e) => e.notes && e.notes.trim())
    .sort((x, y) => y.entryTimestamp.localeCompare(x.entryTimestamp))
    .slice(0, limit)
    .map((e) => {
      const hp = highestPnl(e);
      return {
        ticker: e.ticker,
        type: e.type || null,
        highestPnlPct: hp ? r1(hp.percentage) : null,
        note: e.notes!.trim().slice(0, 240),
      };
    });
}

export function buildDayPayload(label: string, entries: ThesisEntry[], d: DailySummary) {
  return {
    scope: `single day: ${label}`,
    notes: [
      "PNL is hypothetical: entry market cap = market cap when the CA was submitted; hold PNL = (market cap at minute N / entry market cap − 1) × 100.",
      "'Highest PNL' is hindsight and not achievable in practice.",
      "A single day is a tiny sample — be cautious about patterns.",
    ],
    summary: {
      entries: d.total,
      finished: d.completed,
      stillTracking: d.tracking,
      positiveByPeak: d.positive,
      negativeByPeak: d.negative,
      winRateByPeakPct: d.winRate !== undefined ? r0(d.winRate * 100) : null,
      avgHighestPnlPct: r1(d.avgPeak),
      medianHighestPnlPct: r1(d.medianPeak),
      avgEntryMarketCap: d.avgEntryMc !== undefined ? formatMarketCap(d.avgEntryMc) : null,
      avgPreMigrationAgeMin: r1(d.avgPreMigrationAgeMin),
      avgPostMigrationMins: r1(d.avgPostMigrationMins),
      mostCommonType: d.mostCommonType ?? null,
      avgPnlByHoldMinute: d.perMinute.map((p) => ({ minutes: p.minute, avgPnlPct: r1(p.avg), samples: p.n })),
      bestHoldByAverage: d.bestHold ? { minutes: d.bestHold.minute, avgPnlPct: r1(d.bestHold.avg), samples: d.bestHold.n } : null,
    },
    entries: entries.map((e) => {
      const hp = highestPnl(e);
      return {
        ticker: e.ticker,
        type: e.type || null,
        entryMarketCap: formatMarketCap(e.entryMarketCap),
        preMigrationAgeMin: (() => {
          const ms = resolvePreMigrationAgeMs(e);
          return ms !== undefined ? r1(ms / 60_000) : null;
        })(),
        postMigrationMins: postMigrationTime(e)?.mins ?? null,
        notes: e.notes?.trim() ? e.notes.trim().slice(0, 240) : null,
        highestPnlPct: hp ? r1(hp.percentage) : null,
        highestPnlAtMinute: hp ? hp.minute : null,
        pnlByMinutePct: HOLD_MINUTES.map((m) => r1(pnlAt(e, m))),
      };
    }),
  };
}

export type ThesisAiPayload = {
  scope: ThesisSummaryScope;
  label: string;
  stats: Record<string, unknown>;
};

/* ------------------------------ number verification ------------------------------ */

/** Pulls every number out of a string, expanding K/M suffixes ("$25K" → 25 and 25000). */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*([KkMm](?![a-z]))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const base = parseFloat(m[1].replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    out.push(base);
    if (m[2]) out.push(base * (/k/i.test(m[2]) ? 1_000 : 1_000_000));
  }
  return out;
}

const AI_TEXT_KEYS = [
  "overview", "observed", "working", "failing", "winnerTraits", "loserTraits",
  "interpretation", "improvements", "hypotheses", "caveats",
] as const;

/**
 * Returns the numbers in the AI's text that don't appear (within rounding) anywhere in the
 * supplied stats. Tiny integers (≤ 12: minute marks, counts like "3 of 5") and years are
 * ignored since they're ubiquitous in normal prose. A heuristic safety net, not a proof.
 */
export function findUnverifiedNumbers(content: Omit<ThesisSummaryContent, "unverifiedNumbers">, payload: unknown): string[] {
  const known = extractNumbers(JSON.stringify(payload));
  const texts: string[] = [];
  for (const k of AI_TEXT_KEYS) {
    const v = content[k];
    if (Array.isArray(v)) texts.push(...v);
    else if (typeof v === "string") texts.push(v);
  }
  const bad = new Set<string>();
  for (const t of texts) {
    const re = /(\d[\d,]*(?:\.\d+)?)\s*([KkMm](?![a-z]))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      const base = parseFloat(m[1].replace(/,/g, ""));
      if (!Number.isFinite(base)) continue;
      const x = m[2] ? base * (/k/i.test(m[2]) ? 1_000 : 1_000_000) : base;
      if (Number.isInteger(x) && x <= 12) continue;
      if (x >= 2020 && x <= 2035 && Number.isInteger(x)) continue;
      const tol = x >= 10 ? 0.51 : 0.051;
      const ok = known.some((k) => Math.abs(k - x) <= tol || Math.abs(k - base) <= tol);
      if (!ok) bad.add(m[0].trim());
    }
  }
  return Array.from(bad);
}

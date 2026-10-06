/**
 * Everything the Daily Summary and Trade Summary show is computed here, from the stored raw
 * snapshots, as pure functions. Nothing in this file is hardcoded as a conclusion: every
 * "best X" is a function of the entries passed in, gated by sample size.
 *
 * Honesty rules baked in:
 *  - Fixed-hold PNL (what you'd get exiting at minute N) and Highest PNL (the hindsight peak,
 *    not achievable in practice) are kept separate. Hold/segment rankings use fixed-hold PNL.
 *  - Small samples are shown but labelled; they never produce a "best" claim (see CFG).
 *  - Confidence is a rough rule of thumb from sample size + whether mean and median agree.
 *    It is NOT a statistical confidence interval.
 */
import { formatMarketCap } from "./calculations";
import { highestPnl, isComplete, pnlAt, postMigrationTime, resolvePreMigrationAgeMs } from "./thesisCalculations";
import { HOLD_MINUTES, ThesisEntry } from "./thesisTypes";

/* ------------------------------ configuration ------------------------------ */

export const CFG = {
  /** Below this many analysable entries, the Trade Summary refuses to draw conclusions. */
  MIN_TOTAL: 10,
  /** A finished entry needs at least this many of its 10 snapshots to be analysed. */
  MIN_SNAPSHOTS_PER_ENTRY: 8,
  /** Segments (types, ranges…) with fewer samples than this aren't listed at all. */
  MIN_SEGMENT_SHOW: 3,
  /** Minimum samples before a segment/hold can be called "best". */
  MIN_CLAIM: 5,
  /** Samples at which confidence reaches "moderate" / "high". */
  CONF_MODERATE: 10,
  CONF_HIGH: 30,
  /** Outcome thresholds for "large" loss / win at a given hold. */
  BIG_LOSS_PCT: -30,
  BIG_WIN_PCT: 100,
  /** Share of outcomes beyond those thresholds that counts as "frequent". */
  FREQUENT_SHARE: 0.25,
  /** Sample-size shrinkage constant for the balanced hold score: weight = n / (n + K). */
  SHRINK_K: 10,
  /** Default range edges (configurable via analyze() options). */
  AGE_EDGES_MIN: [5, 10, 20, 30],
  /** POST-MIGRATION TIME ranges (minutes after migration at entry). */
  POST_EDGES_MIN: [2, 4, 6, 10],
  MC_EDGES: [10_000, 25_000, 50_000, 100_000],
  /** Samples worth collecting before acting on a finding. */
  TARGET_SAMPLES: 30,
} as const;

export type RangeMode = "fixed" | "auto";
export type Confidence = "low" | "moderate" | "high";

/* ------------------------------ descriptive stats ------------------------------ */

export type Desc = {
  n: number;
  mean: number;
  median: number;
  std: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
  /** Share of values strictly > 0, 0–1. */
  winRate: number;
  bigLossShare: number;
  bigWinShare: number;
};

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function describe(values: number[]): Desc | null {
  const v = values.filter((x) => Number.isFinite(x));
  const n = v.length;
  if (n === 0) return null;
  const sorted = v.slice().sort((a, b) => a - b);
  const mean = v.reduce((s, x) => s + x, 0) / n;
  const variance = n > 1 ? v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0;
  return {
    n,
    mean,
    median: quantile(sorted, 0.5),
    std: Math.sqrt(variance),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    min: sorted[0],
    max: sorted[n - 1],
    winRate: v.filter((x) => x > 0).length / n,
    bigLossShare: v.filter((x) => x <= CFG.BIG_LOSS_PCT).length / n,
    bigWinShare: v.filter((x) => x >= CFG.BIG_WIN_PCT).length / n,
  };
}

function median(values: number[]): number | undefined {
  const d = describe(values);
  return d ? d.median : undefined;
}

/**
 * Rule-of-thumb confidence: sample size sets the level; it drops one level when the average
 * is within one standard error of zero (can't tell from noise) or when mean and median point
 * in opposite directions (a few outliers are driving the average). Not a statistical test.
 */
export function confidenceOf(d: Desc | null | undefined): Confidence {
  if (!d) return "low";
  let level = d.n >= CFG.CONF_HIGH ? 2 : d.n >= CFG.CONF_MODERATE ? 1 : 0;
  if (d.n >= CFG.CONF_MODERATE) {
    const se = d.std / Math.sqrt(d.n);
    const noisy = Math.abs(d.mean) < se;
    const outlierDriven = d.mean !== 0 && d.median !== 0 && Math.sign(d.mean) !== Math.sign(d.median);
    if (noisy || outlierDriven) level = Math.max(0, level - 1);
  }
  return (["low", "moderate", "high"] as const)[level];
}

/* ------------------------------ rows ------------------------------ */

export type Row = {
  id: string;
  date: string;
  ticker: string;
  /** Normalised type key (lowercase) or undefined if the user left it blank. */
  typeKey?: string;
  /** Pre-migration age, minutes. */
  ageMin?: number;
  /** POST-MIGRATION TIME: minutes after migration at entry (user-entered, else measured). */
  postMin?: number;
  mc: number;
  ts: number;
  /** DexScreener-measured minutes between migration and entry, when a migration timestamp was found. */
  measuredPostMin?: number;
  /** What the user typed, if anything (for the entered-vs-measured data-quality check). */
  enteredPostMin?: number;
  /** pnl[m] = fixed-hold PNL % at minute m (index 0 unused). */
  pnl: (number | undefined)[];
  peak: number;
  peakMinute: number;
  captured: number;
};

export type DataCounts = {
  total: number;
  /** Still collecting snapshots. */
  tracking: number;
  /** Finished, but too many snapshots were missed to analyse. */
  sparse: number;
  analyzed: number;
  untyped: number;
  unknownAge: number;
  /** Analysed entries with no POST-MIGRATION TIME (neither typed nor measured). */
  noPostTime: number;
};

export function buildRows(entries: ThesisEntry[]): { rows: Row[]; counts: DataCounts; typeLabels: Map<string, string> } {
  const rows: Row[] = [];
  const variants = new Map<string, Map<string, number>>();
  let tracking = 0;
  let sparse = 0;

  for (const e of entries) {
    if (!isComplete(e)) {
      tracking++;
      continue;
    }
    const peak = highestPnl(e);
    if (!peak || peak.capturedCount < CFG.MIN_SNAPSHOTS_PER_ENTRY) {
      sparse++;
      continue;
    }
    const pnl: (number | undefined)[] = [undefined];
    for (const m of HOLD_MINUTES) pnl.push(pnlAt(e, m));
    const label = e.type.trim();
    const typeKey = label ? label.toLowerCase() : undefined;
    if (typeKey) {
      const byLabel = variants.get(typeKey) ?? new Map<string, number>();
      byLabel.set(label, (byLabel.get(label) ?? 0) + 1);
      variants.set(typeKey, byLabel);
    }
    rows.push({
      id: e.id,
      date: e.date,
      ticker: e.ticker,
      typeKey,
      ageMin: (() => {
        const ms = resolvePreMigrationAgeMs(e);
        return ms !== undefined ? ms / 60_000 : undefined;
      })(),
      postMin: postMigrationTime(e)?.mins,
      enteredPostMin: e.postMigrationMins,
      mc: e.entryMarketCap,
      ts: Date.parse(e.entryTimestamp),
      measuredPostMin: e.msSinceMigrationAtEntry !== undefined ? e.msSinceMigrationAtEntry / 60_000 : undefined,
      pnl,
      peak: peak.percentage,
      peakMinute: peak.minute,
      captured: peak.capturedCount,
    });
  }

  // Display label for a type key = its most frequently typed capitalisation.
  const typeLabels = new Map<string, string>();
  variants.forEach((byLabel, key) => {
    const best = Array.from(byLabel.entries()).sort((a, b) => b[1] - a[1])[0][0];
    typeLabels.set(key, best);
  });

  return {
    rows,
    typeLabels,
    counts: {
      total: entries.length,
      tracking,
      sparse,
      analyzed: rows.length,
      untyped: rows.filter((r) => !r.typeKey).length,
      unknownAge: rows.filter((r) => r.ageMin === undefined).length,
      noPostTime: rows.filter((r) => r.postMin === undefined).length,
    },
  };
}

/* ------------------------------ per-hold stats ------------------------------ */

export type HoldStat = {
  minute: number;
  desc: Desc | null;
  /** Enough samples to be considered in "best" picks. */
  eligible: boolean;
  confidence: Confidence;
  iqr?: number;
  /** mean ÷ std — a rough "return per unit of variability". Only meaningful when mean > 0. */
  riskReward?: number;
  /** Sample-size-shrunk composite used for the "best holding time" pick. */
  score?: number;
};

function zscores(values: number[]): number[] {
  const n = values.length;
  const mean = values.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / n);
  return values.map((x) => (sd === 0 ? 0 : (x - mean) / sd));
}

export function computeHoldStats(rows: Row[]): HoldStat[] {
  const stats: HoldStat[] = HOLD_MINUTES.map((m) => {
    const values = rows.map((r) => r.pnl[m]).filter((x): x is number => x !== undefined);
    const desc = describe(values);
    return {
      minute: m,
      desc,
      eligible: !!desc && desc.n >= CFG.MIN_CLAIM,
      confidence: confidenceOf(desc),
      iqr: desc ? desc.p75 - desc.p25 : undefined,
      riskReward: desc && desc.std > 0 ? desc.mean / desc.std : undefined,
    };
  });

  // Balanced score: median (typical outcome), mean (upside), win rate, tight spread —
  // z-scored across eligible holds, then shrunk toward the average hold by sample size.
  const el = stats.filter((s) => s.eligible && s.desc);
  if (el.length >= 2) {
    const zMed = zscores(el.map((s) => (s.desc as Desc).median));
    const zMean = zscores(el.map((s) => (s.desc as Desc).mean));
    const zWin = zscores(el.map((s) => (s.desc as Desc).winRate));
    const zTight = zscores(el.map((s) => -(s.iqr as number)));
    el.forEach((s, i) => {
      const raw = 0.35 * zMed[i] + 0.2 * zMean[i] + 0.25 * zWin[i] + 0.2 * zTight[i];
      const n = (s.desc as Desc).n;
      s.score = raw * (n / (n + CFG.SHRINK_K));
    });
  } else if (el.length === 1) {
    el[0].score = 0;
  }
  return stats;
}

export type HoldPicks = {
  /** Best balance of PNL, win rate, consistency and sample size. */
  bestHolding?: HoldStat;
  /** Highest median PNL (typical outcome). */
  bestExit?: HoldStat;
  /** Highest average PNL (upside; outlier-sensitive). */
  highestAvg?: HoldStat;
  highestWinRate?: HoldStat;
  /** Tightest spread of outcomes (smallest interquartile range). */
  mostConsistent?: HoldStat;
  /** Highest mean ÷ std, mean > 0. */
  bestRiskReward?: HoldStat;
  frequentLargeLosses: HoldStat[];
  frequentLargeWins: HoldStat[];
  /** False when no eligible hold has a positive median or mean — i.e. no demonstrated edge. */
  anyPositive: boolean;
};

function maxBy<T>(items: T[], f: (t: T) => number): T | undefined {
  let best: T | undefined;
  let bestV = -Infinity;
  for (const it of items) {
    const v = f(it);
    if (Number.isFinite(v) && v > bestV) {
      best = it;
      bestV = v;
    }
  }
  return best;
}

export function pickHolds(stats: HoldStat[]): HoldPicks {
  const el = stats.filter((s) => s.eligible && s.desc);
  const d = (s: HoldStat) => s.desc as Desc;
  return {
    bestHolding: maxBy(el.filter((s) => s.score !== undefined), (s) => s.score as number),
    bestExit: maxBy(el, (s) => d(s).median * 1e6 + d(s).mean), // median first, mean breaks ties
    highestAvg: maxBy(el, (s) => d(s).mean),
    highestWinRate: maxBy(el, (s) => d(s).winRate * 1e6 + d(s).median),
    mostConsistent: maxBy(el, (s) => -(s.iqr as number) * 1e6 + d(s).winRate),
    bestRiskReward: maxBy(
      el.filter((s) => d(s).mean > 0 && s.riskReward !== undefined),
      (s) => s.riskReward as number
    ),
    frequentLargeLosses: el.filter((s) => d(s).bigLossShare >= CFG.FREQUENT_SHARE),
    frequentLargeWins: el.filter((s) => d(s).bigWinShare >= CFG.FREQUENT_SHARE),
    anyPositive: el.some((s) => d(s).median > 0 || d(s).mean > 0),
  };
}

/* ------------------------------ ranges ------------------------------ */

function bucketIndex(edges: readonly number[], v: number): number {
  let i = 0;
  while (i < edges.length && v >= edges[i]) i++;
  return i;
}

function ageLabel(edges: readonly number[], i: number): string {
  if (i === 0) return `0–${edges[0]}m`;
  if (i === edges.length) return `${edges[edges.length - 1]}m+`;
  return `${edges[i - 1]}–${edges[i]}m`;
}

/** Same bucket labels as age ranges — "0–2m", "2–4m", …, "10m+". */
const postLabel = ageLabel;

function mcLabel(edges: readonly number[], i: number): string {
  if (i === 0) return `<${formatMarketCap(edges[0])}`;
  if (i === edges.length) return `${formatMarketCap(edges[edges.length - 1])}+`;
  return `${formatMarketCap(edges[i - 1])}–${formatMarketCap(edges[i])}`;
}

/**
 * Data-driven range edges: quartile-ish cut points rounded to tidy numbers, so each range
 * gets a comparable number of samples. Returns null if there aren't enough values (caller
 * falls back to the fixed edges).
 */
export function autoEdges(values: number[], bins: number, round: (x: number) => number): number[] | null {
  const v = values.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (v.length < bins * 4) return null;
  const edges: number[] = [];
  for (let i = 1; i < bins; i++) {
    const e = round(quantile(v, i / bins));
    if (e > 0 && (edges.length === 0 || e > edges[edges.length - 1])) edges.push(e);
  }
  return edges.length >= 2 ? edges : null;
}

/* ------------------------------ segments ------------------------------ */

export type SegDim = "type" | "age" | "post" | "mc" | "weekday" | "time" | "combo";

export type SegStat = {
  dim: SegDim;
  key: string;
  label: string;
  order: number;
  n: number;
  /** Desc of Highest PNL (hindsight peak) for this segment. */
  peak: Desc;
  /** Share of entries whose peak was above 0 — "was ever green". */
  everGreenRate: number;
  perMinute: (Desc | null)[];
  /** Best hold *within* this segment (highest median, mean breaks ties). */
  bestHold?: { minute: number; median: number; mean: number; winRate: number; n: number };
  /** Desc of PNL at the global basis hold — the apples-to-apples ranking metric. */
  atBasis: Desc | null;
  confidence: Confidence;
};

function buildSeg(dim: SegDim, key: string, label: string, order: number, rows: Row[], basisMinute: number | undefined): SegStat {
  const peak = describe(rows.map((r) => r.peak)) as Desc;
  const perMinute = HOLD_MINUTES.map((m) => describe(rows.map((r) => r.pnl[m]).filter((x): x is number => x !== undefined)));
  let bestHold: SegStat["bestHold"];
  const minN = Math.min(CFG.MIN_SEGMENT_SHOW, rows.length);
  perMinute.forEach((d, i) => {
    if (!d || d.n < minN) return;
    if (!bestHold || d.median > bestHold.median || (d.median === bestHold.median && d.mean > bestHold.mean)) {
      bestHold = { minute: i + 1, median: d.median, mean: d.mean, winRate: d.winRate, n: d.n };
    }
  });
  const atBasis = basisMinute ? perMinute[basisMinute - 1] : null;
  return {
    dim,
    key,
    label,
    order,
    n: rows.length,
    peak,
    everGreenRate: rows.filter((r) => r.peak > 0).length / rows.length,
    perMinute,
    bestHold,
    atBasis,
    confidence: confidenceOf(atBasis ?? peak),
  };
}

function segmentBy(
  dim: SegDim,
  rows: Row[],
  keyOf: (r: Row) => { key: string; label: string; order: number } | undefined,
  basisMinute: number | undefined
): { shown: SegStat[]; hiddenCount: number } {
  const groups = new Map<string, { label: string; order: number; rows: Row[] }>();
  for (const r of rows) {
    const k = keyOf(r);
    if (!k) continue;
    const g = groups.get(k.key) ?? { label: k.label, order: k.order, rows: [] };
    g.rows.push(r);
    groups.set(k.key, g);
  }
  const all = Array.from(groups.entries()).map(([key, g]) => ({ key, g }));
  const shown = all
    .filter(({ g }) => g.rows.length >= CFG.MIN_SEGMENT_SHOW)
    .map(({ key, g }) => buildSeg(dim, key, g.label, g.order, g.rows, basisMinute));
  return { shown, hiddenCount: all.length - shown.length };
}

/* ------------------------------ entry-delay matrix ------------------------------ */

export type DelayCell = { delay: number; hold: number; desc: Desc | null };

/**
 * "What if I'd entered d minutes LATER than I did?" — computed from each entry's own
 * tracked trajectory: enter at minute d, exit at minute d+h, PNL = mc[d+h] / mc[d] − 1.
 * Only LATER entries can be evaluated: nothing before the submission moment was recorded,
 * so earlier entry times are unknowable from this data.
 */
export function computeDelayMatrix(rows: Row[], maxDelay = 5, maxHold = 5): DelayCell[] {
  const cells: DelayCell[] = [];
  for (let d = 0; d <= maxDelay; d++) {
    for (let h = 1; h <= maxHold; h++) {
      if (d + h > 10) continue;
      const vals: number[] = [];
      for (const r of rows) {
        const start = d === 0 ? 0 : r.pnl[d];
        const end = r.pnl[d + h];
        if (start === undefined || end === undefined) continue;
        vals.push(((1 + end / 100) / (1 + start / 100) - 1) * 100);
      }
      cells.push({ delay: d, hold: h, desc: describe(vals) });
    }
  }
  return cells;
}

/* ------------------------------ full analysis ------------------------------ */

export type BestEntry = {
  basisMinute: number;
  baselineMedian: number;
  baselineN: number;
  combo?: SegStat;
  age?: SegStat;
  post?: SegStat;
  mc?: SegStat;
  type?: SegStat;
};

export type WinnersLosers = {
  basisMinute: number;
  winners: number;
  losers: number;
  medianAge: { winners?: number; losers?: number };
  medianPostMigration: { winners?: number; losers?: number };
  medianMc: { winners?: number; losers?: number };
  medianPeak: { winners?: number; losers?: number };
  medianPeakMinute: { winners?: number; losers?: number };
  topType: { winners?: { label: string; share: number }; losers?: { label: string; share: number } };
};

export type EntryTimingResult = {
  /** Performance by POST-MIGRATION TIME range (shown ranges only). */
  ranges: SegStat[];
  /** Distinct post-migration times (rounded to the minute) across analysed entries. */
  distinctMinutes: number;
  /** Best range — only when ≥ 2 ranges have enough samples to compare. */
  best?: { seg: SegStat; runnerUp?: SegStat };
  /** Why no verdict can be given, in plain words. Undefined when a verdict exists. */
  noVerdictReason?: string;
  /** "What if I'd entered d minutes later than I did?" from each entry's own tracked trajectory. */
  laterMatrix: DelayCell[];
  laterBasisHold: number;
  laterBest?: { delay: number; desc: Desc; vsLogged?: Desc };
  /** Entries with both a typed and a DexScreener-measured value: do they agree? */
  enteredVsMeasured: { n: number; withinOneMinShare?: number; medianAbsDiffMin?: number };
};

export type Finding = {
  id: string;
  label: string;
  text: string;
  confidence: Confidence;
  n: number;
};

export type Analysis = {
  counts: DataCounts;
  enoughData: boolean;
  config: {
    ageMode: RangeMode;
    postMode: RangeMode;
    mcMode: RangeMode;
    ageEdges: number[];
    postEdges: number[];
    mcEdges: number[];
  };
  holds: HoldStat[];
  picks: HoldPicks;
  basisMinute?: number;
  baseline?: Desc | null;
  peak: { desc: Desc | null; medianMinute?: number; histogram: number[]; everGreenRate?: number };
  types: { shown: SegStat[]; hiddenCount: number };
  ages: { shown: SegStat[]; hiddenCount: number };
  posts: { shown: SegStat[]; hiddenCount: number };
  mcs: { shown: SegStat[]; hiddenCount: number };
  combos: SegStat[];
  weekdays: { shown: SegStat[]; hiddenCount: number };
  timeBlocks: { shown: SegStat[]; hiddenCount: number };
  bestEntry: BestEntry | null;
  winnersLosers?: WinnersLosers;
  entryTiming: EntryTimingResult;
  findings: Finding[];
  nextTests: string[];
  /** Display labels for type keys. */
  typeLabels: Map<string, string>;
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIME_BLOCKS = ["00:00–06:00", "06:00–12:00", "12:00–18:00", "18:00–24:00"];

export type AnalyzeOptions = { ageMode?: RangeMode; postMode?: RangeMode; mcMode?: RangeMode };

export function analyze(entries: ThesisEntry[], options: AnalyzeOptions = {}): Analysis {
  const { rows, counts, typeLabels } = buildRows(entries);
  const enoughData = rows.length >= CFG.MIN_TOTAL;

  // Range edges (fixed defaults, or data-driven when requested and possible).
  let ageEdges: number[] = [...CFG.AGE_EDGES_MIN];
  let postEdges: number[] = [...CFG.POST_EDGES_MIN];
  let mcEdges: number[] = [...CFG.MC_EDGES];
  let ageMode: RangeMode = "fixed";
  let postMode: RangeMode = "fixed";
  let mcMode: RangeMode = "fixed";
  if (options.ageMode === "auto") {
    const e = autoEdges(rows.map((r) => r.ageMin).filter((x): x is number => x !== undefined), 5, (x) => Math.max(1, Math.round(x)));
    if (e) {
      ageEdges = e;
      ageMode = "auto";
    }
  }
  if (options.postMode === "auto") {
    const e = autoEdges(rows.map((r) => r.postMin).filter((x): x is number => x !== undefined), 5, (x) => Math.max(1, Math.round(x)));
    if (e) {
      postEdges = e;
      postMode = "auto";
    }
  }
  if (options.mcMode === "auto") {
    const e = autoEdges(rows.map((r) => r.mc), 5, (x) => Number(x.toPrecision(2)));
    if (e) {
      mcEdges = e;
      mcMode = "auto";
    }
  }

  const holds = computeHoldStats(rows);
  const picks = pickHolds(holds);
  const basisMinute = picks.bestHolding?.minute ?? picks.bestExit?.minute;
  const baselineVals = basisMinute ? rows.map((r) => r.pnl[basisMinute]).filter((x): x is number => x !== undefined) : [];
  const baseline = describe(baselineVals);

  // Peak behaviour
  const histogram = HOLD_MINUTES.map((m) => rows.filter((r) => r.peakMinute === m).length);
  const peakDesc = describe(rows.map((r) => r.peak));
  const peakMinuteMedian = median(rows.map((r) => r.peakMinute));

  const types = segmentBy(
    "type",
    rows,
    (r) => (r.typeKey ? { key: r.typeKey, label: typeLabels.get(r.typeKey) ?? r.typeKey, order: 0 } : undefined),
    basisMinute
  );
  types.shown.sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));

  const ageKey = (r: Row) => {
    if (r.ageMin === undefined) return undefined;
    const i = bucketIndex(ageEdges, r.ageMin);
    return { key: `a${i}`, label: ageLabel(ageEdges, i), order: i };
  };
  const postKey = (r: Row) => {
    if (r.postMin === undefined) return undefined;
    const i = bucketIndex(postEdges, r.postMin);
    return { key: `p${i}`, label: postLabel(postEdges, i), order: i };
  };
  const mcKey = (r: Row) => {
    const i = bucketIndex(mcEdges, r.mc);
    return { key: `m${i}`, label: mcLabel(mcEdges, i), order: i };
  };
  const ages = segmentBy("age", rows, ageKey, basisMinute);
  const posts = segmentBy("post", rows, postKey, basisMinute);
  const mcs = segmentBy("mc", rows, mcKey, basisMinute);
  ages.shown.sort((a, b) => a.order - b.order);
  posts.shown.sort((a, b) => a.order - b.order);
  mcs.shown.sort((a, b) => a.order - b.order);

  // Two-factor combinations (pre-migration age, post-migration time, entry MC) — only those
  // with enough samples to be claimable. Many combos are compared, so the top one is likely to
  // look better than it really is; the UI says so.
  const dimDefs = [
    { tag: "pre-mig age", key: ageKey },
    { tag: "post-mig", key: postKey },
    { tag: "entry MC", key: mcKey },
  ];
  const combos: SegStat[] = [];
  for (let i = 0; i < dimDefs.length; i++) {
    for (let j = i + 1; j < dimDefs.length; j++) {
      const A = dimDefs[i];
      const B = dimDefs[j];
      const res = segmentBy(
        "combo",
        rows,
        (r) => {
          const a = A.key(r);
          const b = B.key(r);
          if (!a || !b) return undefined;
          return { key: `${A.tag}:${a.key}|${B.tag}:${b.key}`, label: `${A.tag} ${a.label} · ${B.tag} ${b.label}`, order: a.order * 100 + b.order };
        },
        basisMinute
      );
      combos.push(...res.shown.filter((s) => s.n >= CFG.MIN_CLAIM));
    }
  }

  const weekdays = segmentBy(
    "weekday",
    rows,
    (r) => {
      const d = new Date(r.ts).getDay();
      return { key: String(d), label: WEEKDAYS[d], order: d };
    },
    basisMinute
  );
  weekdays.shown.sort((a, b) => a.order - b.order);
  const timeBlocks = segmentBy(
    "time",
    rows,
    (r) => {
      const b = Math.floor(new Date(r.ts).getHours() / 6);
      return { key: String(b), label: TIME_BLOCKS[b], order: b };
    },
    basisMinute
  );
  timeBlocks.shown.sort((a, b) => a.order - b.order);

  // Best entry — only when there's a baseline to beat and enough data overall.
  let bestEntry: BestEntry | null = null;
  if (enoughData && basisMinute && baseline) {
    const pick = (segs: SegStat[]) =>
      maxBy(
        segs.filter((s) => s.n >= CFG.MIN_CLAIM && s.atBasis && s.atBasis.median > baseline.median),
        (s) => (s.atBasis as Desc).median
      );
    const be: BestEntry = {
      basisMinute,
      baselineMedian: baseline.median,
      baselineN: baseline.n,
      combo: pick(combos),
      age: pick(ages.shown),
      post: pick(posts.shown),
      mc: pick(mcs.shown),
      type: pick(types.shown),
    };
    if (be.combo || be.age || be.post || be.mc || be.type) bestEntry = be;
  }

  // Winners vs losers (at the basis hold)
  let winnersLosers: WinnersLosers | undefined;
  if (basisMinute && rows.length >= CFG.MIN_SEGMENT_SHOW * 2) {
    const withVal = rows.filter((r) => r.pnl[basisMinute] !== undefined);
    const w = withVal.filter((r) => (r.pnl[basisMinute] as number) > 0);
    const l = withVal.filter((r) => (r.pnl[basisMinute] as number) <= 0);
    const med = (rs: Row[], f: (r: Row) => number | undefined) =>
      median(rs.map(f).filter((x): x is number => x !== undefined));
    const topType = (rs: Row[]) => {
      const typed = rs.filter((r) => r.typeKey);
      if (typed.length < CFG.MIN_SEGMENT_SHOW) return undefined;
      const c = new Map<string, number>();
      typed.forEach((r) => c.set(r.typeKey as string, (c.get(r.typeKey as string) ?? 0) + 1));
      const [k, n] = Array.from(c.entries()).sort((a, b) => b[1] - a[1])[0];
      return { label: typeLabels.get(k) ?? k, share: n / typed.length };
    };
    winnersLosers = {
      basisMinute,
      winners: w.length,
      losers: l.length,
      medianAge: { winners: med(w, (r) => r.ageMin), losers: med(l, (r) => r.ageMin) },
      medianPostMigration: { winners: med(w, (r) => r.postMin), losers: med(l, (r) => r.postMin) },
      medianMc: { winners: med(w, (r) => r.mc), losers: med(l, (r) => r.mc) },
      medianPeak: { winners: med(w, (r) => r.peak), losers: med(l, (r) => r.peak) },
      medianPeakMinute: { winners: med(w, (r) => r.peakMinute), losers: med(l, (r) => r.peakMinute) },
      topType: { winners: topType(w), losers: topType(l) },
    };
  }

  // Entry timing (POST-MIGRATION TIME) — the strategy's own variable.
  const laterMatrix = computeDelayMatrix(rows);
  const laterBasisHold = Math.min(5, basisMinute ?? 3);
  let laterBest: EntryTimingResult["laterBest"];
  if (enoughData) {
    const atHold = laterMatrix.filter((c) => c.hold === laterBasisHold && c.desc && c.desc.n >= CFG.MIN_CLAIM);
    const top = maxBy(atHold, (c) => (c.desc as Desc).median);
    if (top) {
      const logged = laterMatrix.find((c) => c.delay === 0 && c.hold === laterBasisHold)?.desc ?? undefined;
      laterBest = { delay: top.delay, desc: top.desc as Desc, vsLogged: logged };
    }
  }
  const claimablePosts = posts.shown.filter((s) => s.n >= CFG.MIN_CLAIM && s.atBasis);
  const distinctMinutes = new Set(rows.map((r) => r.postMin).filter((x): x is number => x !== undefined).map((x) => Math.round(x))).size;
  let timingBest: EntryTimingResult["best"];
  let noVerdictReason: string | undefined;
  if (!enoughData) {
    noVerdictReason = `Need at least ${CFG.MIN_TOTAL} finished entries first (you have ${rows.length}).`;
  } else if (counts.noPostTime === rows.length) {
    noVerdictReason = "None of your entries have a POST-MIGRATION TIME yet. Fill it in on each coin to compare entry times.";
  } else if (distinctMinutes < 2) {
    noVerdictReason = "All your entries share the same post-migration time, so there's nothing to compare. Log some at different minutes after migration (e.g. 2, 4, 6).";
  } else if (claimablePosts.length < 2) {
    noVerdictReason = `Not enough entries per time range yet — need at least ${CFG.MIN_CLAIM} in two or more ranges to compare them.`;
  } else {
    const sorted = claimablePosts.slice().sort((a, b) => (b.atBasis as Desc).median - (a.atBasis as Desc).median);
    timingBest = { seg: sorted[0], runnerUp: sorted[1] };
  }
  const both = rows.filter((r) => r.enteredPostMin !== undefined && r.measuredPostMin !== undefined);
  const diffs = both.map((r) => Math.abs((r.enteredPostMin as number) - (r.measuredPostMin as number)));
  const entryTiming: EntryTimingResult = {
    ranges: posts.shown,
    distinctMinutes,
    best: timingBest,
    noVerdictReason,
    laterMatrix,
    laterBasisHold,
    laterBest,
    enteredVsMeasured: {
      n: both.length,
      withinOneMinShare: both.length ? diffs.filter((d) => d <= 1).length / both.length : undefined,
      medianAbsDiffMin: median(diffs),
    },
  };

  const analysis: Analysis = {
    counts,
    enoughData,
    config: { ageMode, postMode, mcMode, ageEdges, postEdges, mcEdges },
    holds,
    picks,
    basisMinute,
    baseline,
    peak: {
      desc: peakDesc,
      medianMinute: peakMinuteMedian,
      histogram,
      everGreenRate: peakDesc ? rows.filter((r) => r.peak > 0).length / rows.length : undefined,
    },
    types,
    ages,
    posts,
    mcs,
    combos,
    weekdays,
    timeBlocks,
    bestEntry,
    winnersLosers,
    entryTiming,
    findings: [],
    nextTests: [],
    typeLabels,
  };
  analysis.findings = buildFindings(analysis);
  analysis.nextTests = buildNextTests(analysis);
  return analysis;
}

/* ------------------------------ findings ------------------------------ */

const pct = (x: number) => {
  const a = Math.abs(x);
  const r = a < 10 ? Math.round(a * 10) / 10 : Math.round(a);
  return r === 0 ? "0%" : `${x > 0 ? "+" : "-"}${r.toLocaleString("en-US")}%`;
};
const rate = (x: number) => `${Math.round(x * 100)}%`;
const mins = (m: number) => (m === 1 ? "1 min" : `${m} mins`);

/** Human wording for a segment, with its dimension, so "5–10m" is never ambiguous. */
export function segPhrase(s: SegStat): string {
  switch (s.dim) {
    case "age":
      return `pre-migration age ${s.label}`;
    case "post":
      return `entering ${s.label} after migration`;
    case "mc":
      return `entry MC ${s.label}`;
    case "type":
      return `type ${s.label}`;
    case "weekday":
    case "time":
      return s.label;
    default:
      return s.label;
  }
}

function holdText(s: HoldStat): string {
  const d = s.desc as Desc;
  return `avg ${pct(d.mean)}, median ${pct(d.median)}, win rate ${rate(d.winRate)}`;
}

function buildFindings(a: Analysis): Finding[] {
  if (!a.enoughData) return [];
  const out: Finding[] = [];
  const { picks } = a;

  if (!picks.anyPositive) {
    out.push({
      id: "no-edge",
      label: "Overall",
      text: "No holding duration currently has a positive median or average PNL. So far, the data doesn't show an edge for this entry.",
      confidence: confidenceOf(picks.bestHolding?.desc),
      n: picks.bestHolding?.desc?.n ?? a.counts.analyzed,
    });
  }

  if (a.bestEntry) {
    const be = a.bestEntry;
    const top = be.combo ?? maxBy([be.age, be.post, be.mc, be.type].filter((x): x is SegStat => !!x), (s) => (s.atBasis as Desc).median);
    if (top) {
      out.push({
        id: "best-setup",
        label: "Best setup",
        text: `${segPhrase(top)} — median ${pct((top.atBasis as Desc).median)} at a ${mins(be.basisMinute)} hold, vs ${pct(be.baselineMedian)} across all entries.`,
        confidence: top.confidence,
        n: top.n,
      });
    }
  }

  if (picks.bestExit) {
    out.push({
      id: "best-exit",
      label: "Best exit",
      text: `${mins(picks.bestExit.minute)} — ${holdText(picks.bestExit)}.`,
      confidence: picks.bestExit.confidence,
      n: (picks.bestExit.desc as Desc).n,
    });
  }
  if (picks.bestHolding) {
    out.push({
      id: "best-holding",
      label: "Best holding time",
      text: `${mins(picks.bestHolding.minute)} — ${holdText(picks.bestHolding)}. Balances PNL, win rate, consistency and sample size.`,
      confidence: picks.bestHolding.confidence,
      n: (picks.bestHolding.desc as Desc).n,
    });
  }
  if (picks.mostConsistent) {
    const d = picks.mostConsistent.desc as Desc;
    out.push({
      id: "most-consistent",
      label: "Most consistent",
      text: `${mins(picks.mostConsistent.minute)} — middle half of outcomes spans ${pct(d.p25)} to ${pct(d.p75)}; win rate ${rate(d.winRate)}.`,
      confidence: picks.mostConsistent.confidence,
      n: d.n,
    });
  }
  if (picks.highestAvg && picks.highestAvg.minute !== picks.bestExit?.minute) {
    const d = picks.highestAvg.desc as Desc;
    out.push({
      id: "highest-upside",
      label: "Highest upside",
      text: `${mins(picks.highestAvg.minute)} — avg ${pct(d.mean)} (median ${pct(d.median)}). Averages are pulled up by big winners.`,
      confidence: picks.highestAvg.confidence,
      n: d.n,
    });
  }
  const timing = a.entryTiming.best;
  if (timing) {
    const d = timing.seg.atBasis as Desc;
    out.push({
      id: "best-entry-time",
      label: "Best time to get in",
      text: `${timing.seg.label} after migration — median ${pct(d.median)} at a ${mins(a.basisMinute as number)} hold${
        timing.runnerUp ? ` (next best: ${timing.runnerUp.label}, ${pct((timing.runnerUp.atBasis as Desc).median)})` : ""
      }.`,
      confidence: timing.seg.confidence,
      n: timing.seg.n,
    });
  }
  const bestType = a.bestEntry?.type;
  if (bestType) {
    out.push({
      id: "best-type",
      label: "Best performing type",
      text: `${bestType.label} — median ${pct((bestType.atBasis as Desc).median)} at a ${mins(a.bestEntry!.basisMinute)} hold.`,
      confidence: bestType.confidence,
      n: bestType.n,
    });
  }
  return out;
}

/* ------------------------------ suggested next tests ------------------------------ */

function buildNextTests(a: Analysis): string[] {
  const t: string[] = [];
  const n = a.counts.analyzed;

  if (n < CFG.MIN_TOTAL) {
    t.push(`You have ${n} analysable ${n === 1 ? "entry" : "entries"}. Collect at least ${CFG.MIN_TOTAL - n} more before reading anything into the summaries.`);
    return t;
  }
  if (n < CFG.TARGET_SAMPLES) {
    t.push(`Overall you have ${n} samples. Aim for ${CFG.TARGET_SAMPLES}+ before changing the strategy — conclusions below that are fragile.`);
  }

  const { picks } = a;
  if (picks.bestExit && picks.highestWinRate && picks.bestExit.minute !== picks.highestWinRate.minute) {
    const x = picks.bestExit.desc as Desc;
    const y = picks.highestWinRate.desc as Desc;
    t.push(
      `${mins(picks.bestExit.minute)} holds have the better median (${pct(x.median)}), but ${mins(picks.highestWinRate.minute)} holds win more often (${rate(y.winRate)} vs ${rate(x.winRate)}). Keep collecting data to see whether the extra upside is worth the lower hit rate.`
    );
  }
  if (picks.highestAvg) {
    const d = picks.highestAvg.desc as Desc;
    if (d.mean > 0 && d.median <= 0) {
      t.push(`The ${mins(picks.highestAvg.minute)} average (${pct(d.mean)}) is positive but the median is ${pct(d.median)} — a few big winners are carrying it. Check whether those winners share a trait before relying on this hold.`);
    }
  }
  if (picks.frequentLargeLosses.length > 0) {
    const worst = maxBy(picks.frequentLargeLosses, (s) => (s.desc as Desc).bigLossShare) as HoldStat;
    t.push(
      `${mins(worst.minute)} holds end at ${CFG.BIG_LOSS_PCT}% or worse in ${rate((worst.desc as Desc).bigLossShare)} of entries. Test whether skipping the weakest segments below (or an earlier exit) cuts that.`
    );
  }

  // Gap between hindsight peak and what a fixed hold captures.
  if (a.peak.desc && a.baseline && a.baseline.median > 0 && a.peak.desc.median > a.baseline.median * 2) {
    t.push(
      `The median peak is ${pct(a.peak.desc.median)} but a fixed ${mins(a.basisMinute as number)} hold only gets ${pct(a.baseline.median)} at the median. A take-profit rule might capture more of the move — worth testing against your per-minute data.`
    );
  }

  // Promising-but-thin segments
  const thin = [...a.ages.shown, ...a.posts.shown, ...a.mcs.shown, ...a.types.shown, ...a.combos]
    .filter((s) => s.n >= CFG.MIN_SEGMENT_SHOW && s.n < CFG.TARGET_SAMPLES * 0.67 && s.atBasis && a.baseline && s.atBasis.median > a.baseline.median)
    .sort((x, y) => (y.atBasis as Desc).median - (x.atBasis as Desc).median)[0];
  if (thin && a.basisMinute) {
    const need = Math.max(5, 20 - thin.n);
    t.push(
      `${segPhrase(thin)} looks better than average (median ${pct((thin.atBasis as Desc).median)} at ${mins(a.basisMinute)}) but has only ${thin.n} samples. Collect at least ${need} more of that kind before changing the strategy.`
    );
  }

  // Segments that clearly lag
  const lag = [...a.ages.shown, ...a.posts.shown, ...a.mcs.shown, ...a.types.shown]
    .filter((s) => s.n >= CFG.CONF_MODERATE && s.atBasis && a.baseline && s.atBasis.median < Math.min(0, a.baseline.median) - 5)
    .sort((x, y) => (x.atBasis as Desc).median - (y.atBasis as Desc).median)[0];
  if (lag && a.basisMinute) {
    t.push(`${segPhrase(lag)} has underperformed (median ${pct((lag.atBasis as Desc).median)} at ${mins(a.basisMinute)}, ${lag.n} samples). Try skipping it for the next batch and compare.`);
  }

  // Types too thin to read
  if (a.types.hiddenCount > 0 || a.types.shown.some((s) => s.n < CFG.MIN_CLAIM)) {
    t.push("Some TYPE labels have very few samples. Use a consistent set of labels so categories fill up faster.");
  }
  if (a.counts.untyped > 0) {
    t.push(`${a.counts.untyped} analysed ${a.counts.untyped === 1 ? "entry has" : "entries have"} no TYPE, so ${a.counts.untyped === 1 ? "it is" : "they are"} excluded from the type breakdown. Fill them in.`);
  }

  // Entry timing
  if (a.entryTiming.noVerdictReason && a.enoughData) {
    t.push(`Best time to get in: can't tell yet. ${a.entryTiming.noVerdictReason}`);
  }
  if (a.entryTiming.laterBest && a.entryTiming.laterBest.delay > 0) {
    const b = a.entryTiming.laterBest;
    t.push(`Entering ${mins(b.delay)} after your logged entry had the best median (${pct(b.desc.median)}) for a ${mins(a.entryTiming.laterBasisHold)} hold. Test it by logging some entries a bit later after migration and comparing.`);
  }
  if (a.counts.noPostTime > 0) {
    t.push(`${a.counts.noPostTime} analysed ${a.counts.noPostTime === 1 ? "entry has" : "entries have"} no POST-MIGRATION TIME, so ${a.counts.noPostTime === 1 ? "it is" : "they are"} left out of the entry-time comparison. Fill it in.`);
  }

  if (a.counts.sparse > 0) {
    t.push(`${a.counts.sparse} finished ${a.counts.sparse === 1 ? "entry was" : "entries were"} excluded because too many snapshots were missed. Keep the page open (or in its own window) while tracking.`);
  }
  const evm = a.entryTiming.enteredVsMeasured;
  if (evm.n >= 5 && evm.withinOneMinShare !== undefined && evm.withinOneMinShare < 0.6) {
    t.push(`Only ${rate(evm.withinOneMinShare)} of your typed POST-MIGRATION TIMES are within a minute of what DexScreener measured (median gap ${(evm.medianAbsDiffMin as number).toFixed(1)} min). Either DexScreener's migration time is off for these tokens, or the times are being typed late — worth checking before trusting entry-time results.`);
  }
  return t;
}

/* ------------------------------ daily summary ------------------------------ */

export type DailySummary = {
  total: number;
  completed: number;
  tracking: number;
  positive: number;
  negative: number;
  flat: number;
  /** positive ÷ completed (entries whose peak was above 0). */
  winRate?: number;
  avgPeak?: number;
  medianPeak?: number;
  best?: { ticker: string; pnl: number; minute: number };
  worst?: { ticker: string; pnl: number; minute: number };
  avgEntryMc?: number;
  avgPreMigrationAgeMin?: number;
  avgPostMigrationMins?: number;
  mostCommonType?: { label: string; n: number };
  /** Average fixed-hold PNL per minute across the day's analysable entries. */
  perMinute: { minute: number; avg?: number; n: number }[];
  bestHold?: { minute: number; avg: number; n: number };
};

export function summarizeDay(entries: ThesisEntry[]): DailySummary {
  const { rows, counts, typeLabels } = buildRows(entries);
  const peaks = rows.map((r) => r.peak);
  const positive = rows.filter((r) => r.peak > 0).length;
  const negative = rows.filter((r) => r.peak < 0).length;
  const sortedByPeak = rows.slice().sort((a, b) => b.peak - a.peak);

  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : undefined);
  const typeCounts = new Map<string, number>();
  rows.forEach((r) => r.typeKey && typeCounts.set(r.typeKey, (typeCounts.get(r.typeKey) ?? 0) + 1));
  const topType = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])[0];

  const perMinute = HOLD_MINUTES.map((m) => {
    const vals = rows.map((r) => r.pnl[m]).filter((x): x is number => x !== undefined);
    return { minute: m as number, avg: avg(vals), n: vals.length };
  });
  const bestHold = maxBy(
    perMinute.filter((p) => p.avg !== undefined),
    (p) => p.avg as number
  );

  return {
    total: counts.total,
    completed: rows.length,
    tracking: counts.tracking,
    positive,
    negative,
    flat: rows.length - positive - negative,
    winRate: rows.length ? positive / rows.length : undefined,
    avgPeak: avg(peaks),
    medianPeak: median(peaks),
    best: sortedByPeak[0] && { ticker: sortedByPeak[0].ticker, pnl: sortedByPeak[0].peak, minute: sortedByPeak[0].peakMinute },
    worst:
      sortedByPeak.length > 1
        ? {
            ticker: sortedByPeak[sortedByPeak.length - 1].ticker,
            pnl: sortedByPeak[sortedByPeak.length - 1].peak,
            minute: sortedByPeak[sortedByPeak.length - 1].peakMinute,
          }
        : undefined,
    avgEntryMc: avg(rows.map((r) => r.mc)),
    avgPreMigrationAgeMin: avg(rows.map((r) => r.ageMin).filter((x): x is number => x !== undefined)),
    avgPostMigrationMins: avg(rows.map((r) => r.postMin).filter((x): x is number => x !== undefined)),
    mostCommonType: topType ? { label: typeLabels.get(topType[0]) ?? topType[0], n: topType[1] } : undefined,
    perMinute,
    bestHold: bestHold ? { minute: bestHold.minute, avg: bestHold.avg as number, n: bestHold.n } : undefined,
  };
}

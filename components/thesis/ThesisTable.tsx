"use client";

import { ReactNode, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { formatMarketCap, truncateAddress } from "@/lib/calculations";
import { axiomTokenUrl } from "@/lib/axiom";
import {
  formatAge,
  formatPostMins,
  formatSignedPct,
  highestPnl,
  isComplete,
  parseMins,
  pnlAt,
  pnlPillClass,
  pnlTextClass,
  postMigrationTime,
  preMigrationNote,
  resolvePreMigrationAgeMs,
  slotState,
  snapshotKey,
} from "@/lib/thesisCalculations";
import { HOLD_MINUTES, HoldMinute, ThesisEntry } from "@/lib/thesisTypes";
import { AutoResizeTextarea } from "@/components/trades/AutoResizeTextarea";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { TypeCombobox } from "./TypeCombobox";
import type { CommitThesis } from "./useThesisStore";

type ThesisTableProps = {
  entries: ThesisEntry[];
  commit: CommitThesis;
  now: number;
};

const label = "text-[10px] font-medium uppercase tracking-wide text-faint";
const fieldInput = "h-[34px] bg-surface-2 text-sm text-ink px-2 rounded-md border border-border placeholder:text-faint transition-colors";

/**
 * Coin list for the selected day. Each coin is a two-row card:
 *   1. identity + the fields you edit (type, post-migration time) + derived pre-migration age + note + actions
 *   2. the market timeline — Entry MC → 1m…10m → Highest PNL — with room to breathe
 * On narrow screens the ten minutes wrap into two rows of five instead of scrolling sideways.
 */
export function ThesisTable({ entries, commit, now }: ThesisTableProps) {
  const update = (id: string, patch: Partial<ThesisEntry>) =>
    commit((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id: string) => commit((prev) => prev.filter((e) => e.id !== id));

  return (
    <div className="space-y-3">
      {entries.map((e) => (
        <CoinCard
          key={e.id}
          entry={e}
          now={now}
          onUpdate={(p) => update(e.id, p)}
          onDelete={() => remove(e.id)}
        />
      ))}
    </div>
  );
}

function CoinCard({
  entry: e,
  now,
  onUpdate,
  onDelete,
}: {
  entry: ThesisEntry;
  now: number;
  onUpdate: (p: Partial<ThesisEntry>) => void;
  onDelete: () => void;
}) {
  const axiom = axiomTokenUrl({ chainId: e.chainId, pairAddress: e.pairAddress });
  const complete = isComplete(e);
  const hp = highestPnl(e);

  const age = resolvePreMigrationAgeMs(e);
  const approxAge = e.preMigrationBasis !== "migration-timestamp";
  const entryTime = new Date(e.entryTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <article
      className={`rounded-lg border bg-surface transition-colors ${complete ? "border-border-soft hover:border-border" : "border-accent/40"}`}
    >
      {/* ROW 1 — identity, editable fields, actions */}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3 px-3 sm:px-4 pt-3.5 pb-3">
        {/* On phones the delete button sits beside the ticker (order-2) instead of on a row of its own. */}
        <div className="order-1 flex-1 sm:flex-none sm:order-none sm:mt-4 min-w-[10rem] sm:min-w-[12rem]">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-base font-semibold text-ink" title={e.name ?? e.ticker}>
              ${e.ticker}
            </span>
            {axiom ? (
              <a
                href={axiom}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${e.ticker} on Axiom`}
                title="Open on Axiom"
                className="p-0.5 rounded text-faint hover:text-accent transition-colors"
              >
                <ExternalLink size={13} />
              </a>
            ) : (
              <span title="Axiom link is only built for Solana tokens" className="p-0.5 text-faint/40">
                <ExternalLink size={13} />
              </span>
            )}
            {complete ? (
              <span className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-surface-3 text-faint">Done</span>
            ) : (
              <span className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-accent-soft text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-faint">
            <span title={e.contractAddress}>{truncateAddress(e.contractAddress)}</span>
            <span className="mx-1.5 text-faint/50">·</span>
            <span title={`Entry recorded ${new Date(e.entryTimestamp).toLocaleString()}`}>{entryTime}</span>
          </div>
        </div>

        <Field label="Type" className="order-3 sm:order-none">
          <TypeCombobox
            value={e.type}
            placeholder="—"
            aria-label={`Type for ${e.ticker}`}
            onChange={(type) => onUpdate({ type })}
            className="w-32"
            inputClassName={fieldInput}
          />
        </Field>

        <Field label="Post-migration" className="order-3 sm:order-none" hint="Minutes after migration when you entered — typed by you">
          <PostTimeField entry={e} onChange={(mins) => onUpdate({ postMigrationMins: mins })} />
        </Field>

        <Field label="Pre-migration age" className="order-3 sm:order-none" hint="How old the token was before migration (approximate)">
          <div className="h-[34px] flex items-center font-mono text-sm">
            <span
              title={preMigrationNote(e)}
              className={`${age === undefined ? "text-faint" : "text-ink"} ${
                approxAge && age !== undefined ? "underline decoration-dotted decoration-faint underline-offset-4" : ""
              }`}
            >
              {formatAge(age)}
            </span>
          </div>
        </Field>

        <Field label="Note" className="order-3 sm:order-none flex-1 min-w-[14rem] basis-full sm:basis-auto">
          <AutoResizeTextarea
            value={e.notes ?? ""}
            placeholder="Why this coin, what you saw, what happened…"
            aria-label={`Note for ${e.ticker}`}
            className="w-full min-h-[34px]"
            onChange={(ev) => onUpdate({ notes: ev.target.value })}
          />
        </Field>

        <div className="order-2 sm:order-none ml-auto sm:mt-[19px] flex items-center h-[34px]">
          <ConfirmDeleteButton onConfirm={onDelete} />
        </div>
      </div>

      {/* ROW 2 — Entry MC → 1m…10m → Highest PNL */}
      <div className="border-t border-border-soft bg-bg/50 rounded-b-lg px-3 sm:px-4 py-3">
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-[7.5rem_minmax(0,1fr)_11rem]">
          <EntryMcBlock entry={e} />
          <div className="col-span-2 order-last lg:col-span-1 lg:order-none">
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1 sm:gap-1.5 h-full">
              {HOLD_MINUTES.map((m) => (
                <MinuteCell key={m} entry={e} minute={m} now={now} isPeak={hp?.minute === m} />
              ))}
            </div>
          </div>
          <HighestPnlBlock entry={e} now={now} />
        </div>
      </div>
    </article>
  );
}

function Field({ label: text, hint, className, children }: { label: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <div title={hint} className={className}>
      <div className={`${label} mb-1`}>{text}</div>
      {children}
    </div>
  );
}

/** Shared shell for the Entry MC / Highest PNL tiles at either end of the timeline. */
function EndTile({ title, className = "", hint, children }: { title: string; className?: string; hint?: string; children: ReactNode }) {
  return (
    <div title={hint} className={`rounded-md border px-3 py-2 flex flex-col justify-center min-h-[4rem] ${className}`}>
      <div className={label}>{title}</div>
      {children}
    </div>
  );
}

function EntryMcBlock({ entry: e }: { entry: ThesisEntry }) {
  return (
    <EndTile
      title="Entry MC"
      className="border-border-soft bg-surface-2"
      hint={`Raw: $${e.entryMarketCap.toLocaleString("en-US", { maximumFractionDigits: 0 })}${
        e.entryMarketCapSource === "fdv" ? " (DexScreener had no market cap; FDV used)" : ""
      }`}
    >
      <div className="font-mono text-lg font-medium text-ink leading-tight mt-0.5">
        {formatMarketCap(e.entryMarketCap)}
        {e.entryMarketCapSource === "fdv" && <sup className="text-[9px] text-faint ml-0.5">fdv</sup>}
      </div>
    </EndTile>
  );
}

function MinuteCell({ entry: e, minute: m, now, isPeak }: { entry: ThesisEntry; minute: HoldMinute; now: number; isPeak: boolean }) {
  const state = slotState(e, m, now);
  const snap = e.snapshots[snapshotKey(m)];
  const pnl = pnlAt(e, m);

  let mc: ReactNode = <span className="text-faint/40">—</span>;
  let body: ReactNode;
  let title: string;
  let tone: string;

  if (state === "captured") {
    mc = snap?.marketCap !== undefined ? formatMarketCap(snap.marketCap) : "—";
    body = <span className={pnlTextClass(pnl)}>{formatSignedPct(pnl)}</span>;
    title = `${m}m · MC ${snap?.marketCap !== undefined ? formatMarketCap(snap.marketCap) : "n/a"} · price ${snap?.price ?? "n/a"} · captured ${Math.round(
      (snap?.driftMs ?? 0) / 1000
    )}s after due`;
    tone = isPeak ? "border-win/60 bg-win/10" : "border-border-soft bg-surface-2";
  } else if (state === "missed") {
    body = <span className="text-faint">—</span>;
    title =
      snap?.missed === "fetch-failed"
        ? "Missed: DexScreener couldn't be reached during this minute's window."
        : "Missed: the page wasn't running when this snapshot was due, and DexScreener has no price history to back-fill.";
    tone = "border-dashed border-border bg-transparent";
  } else if (state === "capturing") {
    body = <span className="text-accent animate-pulse">…</span>;
    title = "Capturing…";
    tone = "border-accent/50 bg-accent-soft";
  } else {
    body = <span className="text-faint/40">·</span>;
    title = "Not due yet";
    tone = "border-border-soft/60 bg-transparent";
  }

  return (
    <div title={title} className={`rounded-md border px-0.5 py-1.5 text-center min-w-0 flex flex-col justify-center ${tone}`}>
      <div className={`text-[10px] font-medium leading-none ${isPeak ? "text-win" : "text-faint"}`}>{isPeak ? `${m}m ▲` : `${m}m`}</div>
      <div className="font-mono text-[10px] text-dim truncate leading-tight mt-1">{mc}</div>
      <div className="font-mono text-[13px] font-medium leading-tight truncate">{body}</div>
    </div>
  );
}

function HighestPnlBlock({ entry: e, now }: { entry: ThesisEntry; now: number }) {
  const hp = highestPnl(e);

  if (!isComplete(e)) {
    const resolved = HOLD_MINUTES.filter((m) => e.snapshots[snapshotKey(m)]).length;
    const remainingMs = Math.max(0, Date.parse(e.entryTimestamp) + 10 * 60_000 - now);
    const clock = `${Math.floor(remainingMs / 60_000)}:${String(Math.floor((remainingMs % 60_000) / 1000)).padStart(2, "0")}`;
    return (
      <EndTile title="Tracking…" className="border-accent/30 bg-accent-soft">
        <div className="flex items-baseline justify-between gap-2 mt-0.5" aria-live="polite">
          <span className="font-mono text-lg font-medium text-ink leading-tight">{clock}</span>
          <span className="font-mono text-[11px] text-dim">{resolved}/10</span>
        </div>
        <div className="mt-1.5 h-1 rounded-full bg-surface-3 overflow-hidden">
          <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${resolved * 10}%` }} />
        </div>
      </EndTile>
    );
  }

  if (!hp) {
    return (
      <EndTile title="Highest PNL" className="border-border-soft bg-surface-2" hint="No usable snapshots were captured">
        <div className="font-mono text-lg text-faint leading-tight mt-0.5">—</div>
      </EndTile>
    );
  }

  const border = hp.percentage > 0 ? "border-win/30" : hp.percentage < 0 ? "border-loss/30" : "border-border-soft";
  return (
    <EndTile
      title="Highest PNL"
      className={`${border} ${pnlPillClass(hp.percentage)}`}
      hint={
        hp.partial
          ? `Based on ${hp.capturedCount} of 10 snapshots — the true peak may be higher.`
          : "Best minute seen in hindsight — a ceiling, not something you can reliably sell at"
      }
    >
      <div className="flex items-baseline gap-2 mt-0.5">
        <span className="font-mono text-lg font-semibold leading-tight">
          {formatSignedPct(hp.percentage)}
          {hp.partial && <sup className="ml-0.5 text-[10px]">*</sup>}
        </span>
        <span className="text-xs text-dim">at {hp.minute}m</span>
      </div>
    </EndTile>
  );
}

/** POST-MIGRATION TIME input. Typed value wins; a DexScreener-measured value is shown as a faint placeholder. */
function PostTimeField({ entry, onChange }: { entry: ThesisEntry; onChange: (mins: number | undefined) => void }) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(entry.postMigrationMins !== undefined ? String(entry.postMigrationMins) : "");
  const measured = postMigrationTime({ ...entry, postMigrationMins: undefined });

  useEffect(() => {
    if (!focused) setRaw(entry.postMigrationMins !== undefined ? String(entry.postMigrationMins) : "");
  }, [entry.postMigrationMins, focused]);

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        inputMode="decimal"
        value={raw}
        placeholder={measured ? `~${formatPostMins(measured.mins).replace("m", "")}` : "—"}
        aria-label={`Minutes after migration for ${entry.ticker}`}
        title={
          measured && entry.postMigrationMins === undefined
            ? `Not typed yet — DexScreener suggests ~${formatPostMins(measured.mins)} after migration (approximate). Type your own number to override.`
            : "Minutes after migration when you entered"
        }
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(ev) => {
          const v = ev.target.value;
          if (!/^[0-9]*[.,]?[0-9]*$/.test(v)) return;
          setRaw(v);
          onChange(parseMins(v)); // commit on every keystroke, same as the journal's fields
        }}
        className={`w-16 font-mono ${fieldInput} placeholder:text-faint/70`}
      />
      <span className="text-xs text-faint">min</span>
    </div>
  );
}

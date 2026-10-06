"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatMarketCap, formatLongDate } from "@/lib/calculations";
import { sameAddress, validateAddress } from "@/lib/dexscreener";
import { buildEntry, parseMins } from "@/lib/thesisCalculations";
import { fetchTokenLookup } from "@/lib/thesisClient";
import { TYPE_SUGGESTIONS, ThesisEntry } from "@/lib/thesisTypes";
import { storage } from "@/lib/storage";

type CoinAdderProps = {
  /** Called with a freshly built entry. Returns false if it was rejected (e.g. a duplicate found on disk). */
  onCreate: (entry: ThesisEntry) => boolean;
};

const field = "!py-2 !text-sm";

/**
 * One row: CA, Type, Mins after migration, Track Coin. Enter (in any field) or the button
 * records the entry snapshot and starts tracking. The row then clears itself ready for the
 * next coin — it never spawns extra fields. Disabled while a lookup is running, and the same
 * address can't be looked up twice at once.
 */
export function CoinAdder({ onCreate }: CoinAdderProps) {
  const [ca, setCa] = useState("");
  const [type, setType] = useState("");
  const [post, setPost] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());
  const busyRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => () => void (toastTimer.current && clearTimeout(toastTimer.current)), []);

  // After a submit finishes (inputs are re-enabled), put the cursor back in the CA field for the next coin.
  const wantFocus = useRef(false);
  useEffect(() => {
    if (!busy && wantFocus.current) {
      wantFocus.current = false;
      wrap.current?.querySelector<HTMLInputElement>("input[aria-label='Contract address']")?.focus();
    }
  }, [busy]);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  const duplicateMessage = (addr: string): string | null => {
    const hit = storage.readThesisEntries().find((e) => sameAddress(e.contractAddress, addr));
    return hit ? `Already recorded: $${hit.ticker} on ${formatLongDate(hit.date)}. Delete that entry first to re-add it.` : null;
  };

  const submit = async () => {
    if (busyRef.current) return; // ref, not state: two Enters in the same tick can't both pass
    const v = validateAddress(ca);
    if (!v.ok) {
      setError(ca.trim() ? "That doesn't look like a valid contract address." : "Paste a contract address first.");
      return;
    }
    const key = v.kind === "evm" ? v.ca.toLowerCase() : v.ca;
    if (inFlight.current.has(key)) return;
    const dup = duplicateMessage(v.ca);
    if (dup) {
      setError(dup);
      return;
    }

    busyRef.current = true;
    inFlight.current.add(key);
    setBusy(true);
    setError(null);
    try {
      const res = await fetchTokenLookup(v.ca);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      // The resolved token can differ from what was pasted (e.g. a pair address) — re-check.
      const dup2 = duplicateMessage(res.data.ca);
      if (dup2) {
        setError(dup2);
        return;
      }
      const entry = buildEntry(res.data, Date.now(), { postMigrationMins: parseMins(post), type });
      if (!onCreate(entry)) {
        setError("Already recorded.");
        return;
      }
      showToast(`Tracking $${entry.ticker} — entry MC ${formatMarketCap(entry.entryMarketCap)}. Snapshots every minute for 10 minutes.`);
      setCa("");
      setType("");
      setPost("");
    } finally {
      inFlight.current.delete(key);
      busyRef.current = false;
      wantFocus.current = true;
      setBusy(false);
    }
  };

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div ref={wrap}>
      <datalist id="thesis-type-form-suggestions">
        {TYPE_SUGGESTIONS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <span className="text-[10px] uppercase tracking-wide text-faint block mb-1.5">Contract address</span>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="relative col-span-2 sm:col-span-3">
          <Input
            type="text"
            value={ca}
            disabled={busy}
            error={!!error}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            placeholder="Paste contract address, press Enter…"
            aria-label="Contract address"
            onChange={(e) => {
              setCa(e.target.value);
              setError(null);
            }}
            onKeyDown={onEnter}
            className={`w-full font-mono ${field} !pr-9 disabled:opacity-60`}
          />
          {busy && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-faint" />}
        </div>
        <Input
          type="text"
          list="thesis-type-form-suggestions"
          value={type}
          disabled={busy}
          placeholder="Type (CTO, AI…)"
          aria-label="Type"
          onChange={(e) => setType(e.target.value)}
          onKeyDown={onEnter}
          className={`w-full ${field} disabled:opacity-60`}
        />
        <Input
          type="text"
          inputMode="decimal"
          value={post}
          disabled={busy}
          placeholder="Mins after migration"
          aria-label="Minutes after migration"
          onChange={(e) => {
            if (/^[0-9]*[.,]?[0-9]*$/.test(e.target.value)) setPost(e.target.value);
          }}
          onKeyDown={onEnter}
          className={`w-full ${field} disabled:opacity-60`}
        />
        <Button onClick={() => void submit()} disabled={busy} className="col-span-2 sm:col-span-1 !py-2 whitespace-nowrap disabled:opacity-60">
          {busy ? "Looking up…" : "Track Coin"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-loss mt-1.5 ml-1">
          {error}
        </p>
      )}

      <p className="text-[11px] text-faint mt-2 leading-snug">
        Type and mins after migration are optional here — you can also edit them on the coin card. Press Enter or Track Coin to record the entry
        snapshot and start tracking.
      </p>
      {toast && (
        <p role="status" className="text-xs text-win mt-1.5">
          {toast}
        </p>
      )}
    </div>
  );
}

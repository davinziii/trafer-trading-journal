"use client";

import { useCallback, useEffect, useState } from "react";
import { storage } from "@/lib/storage";
import { ThesisEntry } from "@/lib/thesisTypes";

export type CommitThesis = (fn: (prev: ThesisEntry[]) => ThesisEntry[]) => void;

/**
 * Thesis entries, persisted with the same localStorage mechanism the journal uses
 * (lib/storage.ts), under a separate key.
 *
 * Unlike the journal's pattern (write inside a setState updater), every change here is
 * read-modify-write against what's on disk *right now*. The tracker writes snapshots in the
 * background and a second tab may be open, so a state-only write could silently clobber a
 * snapshot captured a moment ago. `storage` events keep other tabs' views in sync.
 */
export function useThesisStore() {
  const [entries, setEntries] = useState<ThesisEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setEntries(storage.readThesisEntries());
    setLoaded(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === storage.thesisEntriesKey) setEntries(storage.readThesisEntries());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const commit: CommitThesis = useCallback((fn) => {
    const next = fn(storage.readThesisEntries());
    storage.writeThesisEntries(next);
    setEntries(next);
  }, []);

  return { entries, loaded, commit };
}

/** Re-renders every `ms` while `active` — drives the "Tracking… 3/10" countdowns. */
export function useNow(active: boolean, ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return active ? now : Date.now();
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPairQuote } from "@/lib/thesisClient";
import {
  CAPTURE_WINDOW_MS,
  dueTimeMs,
  planTracking,
  withCapturedSnapshot,
  withMissedSnapshot,
} from "@/lib/thesisCalculations";
import { HoldMinute, ThesisEntry } from "@/lib/thesisTypes";
import type { CommitThesis } from "./useThesisStore";

/**
 * Background snapshot capture. Everything is decided from timestamps (planTracking), never
 * from "one timer tick = one minute":
 *  - A slot is capturable for CAPTURE_WINDOW_MS after it's due. Past that it's closed as
 *    "missed" — DexScreener's free API has no price history, so a late fetch would record
 *    the price NOW, not the price at that minute. Nothing is ever back-filled or guessed.
 *  - The tick runs from a Web Worker timer (not throttled like main-thread timers in hidden
 *    tabs), and also fires immediately on visibility/focus/online.
 *  - A Web Lock makes exactly one tab the tracker, so two open tabs can't double-capture.
 *    Other tabs stay in sync through `storage` events.
 * Limits: if every tab is closed (or the computer sleeps), snapshots due in that time are
 * missed. There's no server/DB in this app to track while closed.
 */
export function useThesisTracker(entries: ThesisEntry[], commit: CommitThesis) {
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const inflight = useRef(new Set<string>());
  const lastAttempt = useRef(new Map<string, number>());
  const failedSlots = useRef(new Set<string>());
  const backoffUntil = useRef(0);
  const leader = useRef(false);
  const [isLeader, setIsLeader] = useState(true);

  const tick = useCallback(() => {
    if (!leader.current) return;
    const now = Date.now();

    // 1) Close slots whose window has passed.
    const misses: { id: string; minute: HoldMinute; reason: "window-elapsed" | "fetch-failed" }[] = [];
    const captures: { entry: ThesisEntry; minute: HoldMinute }[] = [];
    for (const e of entriesRef.current) {
      if (e.completedAt) continue;
      const plan = planTracking(e, now);
      for (const m of plan.miss) {
        misses.push({ id: e.id, minute: m, reason: failedSlots.current.has(`${e.id}:${m}`) ? "fetch-failed" : "window-elapsed" });
      }
      for (const m of plan.capture) captures.push({ entry: e, minute: m });
    }
    if (misses.length > 0) {
      commit((prev) =>
        prev.map((e) => {
          let next = e;
          for (const miss of misses) if (miss.id === e.id) next = withMissedSnapshot(next, miss.minute, miss.reason, now);
          return next;
        })
      );
    }

    // 2) Capture slots that are due and still inside their window.
    if (now < backoffUntil.current) return;
    for (const { entry, minute } of captures) {
      const key = `${entry.id}:${minute}`;
      if (inflight.current.has(key)) continue;
      if (now - (lastAttempt.current.get(key) ?? 0) < 3_000) continue; // retry spacing
      inflight.current.add(key);
      lastAttempt.current.set(key, now);
      fetchPairQuote(entry)
        .then((res) => {
          const at = Date.now();
          if (!res.ok) {
            failedSlots.current.add(key);
            if (res.error === "rate_limited") backoffUntil.current = at + 10_000;
            return;
          }
          // Response arrived after the window closed → that price is no longer "minute N". Let tick() close it.
          if (at - dueTimeMs(entry, minute) > CAPTURE_WINDOW_MS) return;
          commit((prev) => prev.map((e) => (e.id === entry.id ? withCapturedSnapshot(e, minute, res.data, at) : e)));
        })
        .finally(() => inflight.current.delete(key));
    }
  }, [commit]);

  // Leader election across tabs.
  useEffect(() => {
    let release: (() => void) | undefined;
    let cancelled = false;
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (locks) {
      leader.current = false;
      setIsLeader(false);
      locks
        .request("ctj-thesis-tracker", () => {
          if (cancelled) return;
          leader.current = true;
          setIsLeader(true);
          return new Promise<void>((resolve) => {
            release = resolve;
          });
        })
        .catch(() => {
          leader.current = true;
          setIsLeader(true);
        });
    } else {
      leader.current = true;
    }
    return () => {
      cancelled = true;
      leader.current = false;
      release?.();
    };
  }, []);

  // Timer: Web Worker (unthrottled in background tabs), falling back to setInterval.
  useEffect(() => {
    let stop: () => void;
    try {
      const url = URL.createObjectURL(new Blob(["setInterval(function(){postMessage(0)},1000)"], { type: "text/javascript" }));
      const worker = new Worker(url);
      worker.onmessage = () => tick();
      stop = () => {
        worker.terminate();
        URL.revokeObjectURL(url);
      };
    } catch {
      const id = setInterval(tick, 1000);
      stop = () => clearInterval(id);
    }
    const wake = () => tick();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    tick(); // resume immediately on load — covers "refreshed during tracking"
    return () => {
      stop();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
    };
  }, [tick]);

  return { isLeader };
}


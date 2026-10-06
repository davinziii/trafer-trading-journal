import { CoinNote, SummaryCache, Trade } from "./types";
import { ThesisEntry, ThesisSummaryCache } from "./thesisTypes";

const STORAGE_KEYS = {
  TRADES: "ctj:trades:v1",
  NOTEPAD: "ctj:notepad:v1",
  SUMMARY_CACHE: "ctj:summaryCache:v1",
  COIN_NOTES: "ctj:coinNotes:v1",
  // Thesis data lives under its own keys so it can never mix with real journal trades.
  THESIS_ENTRIES: "ctj:thesis:v1",
  THESIS_SUMMARY_CACHE: "ctj:thesisSummaryCache:v1",
} as const;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export const storage = {
  readTrades(): Trade[] {
    if (!isBrowser()) return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.TRADES);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Trade[]) : [];
    } catch (err) {
      console.error("Failed to read trades from storage", err);
      return [];
    }
  },

  writeTrades(trades: Trade[]): void {
    if (!isBrowser()) return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(trades));
    } catch (err) {
      console.error("Failed to save trades to storage", err);
    }
  },

  readNotepad(): string {
    if (!isBrowser()) return "";
    try {
      return window.localStorage.getItem(STORAGE_KEYS.NOTEPAD) ?? "";
    } catch (err) {
      console.error("Failed to read notepad from storage", err);
      return "";
    }
  },

  writeNotepad(html: string): void {
    if (!isBrowser()) return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.NOTEPAD, html);
    } catch (err) {
      console.error("Failed to save notepad to storage", err);
    }
  },

  readSummaryCache(): SummaryCache {
    if (!isBrowser()) return {};
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.SUMMARY_CACHE);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as SummaryCache) : {};
    } catch (err) {
      console.error("Failed to read trade summary cache from storage", err);
      return {};
    }
  },

  writeSummaryCache(cache: SummaryCache): void {
    if (!isBrowser()) return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.SUMMARY_CACHE, JSON.stringify(cache));
    } catch (err) {
      console.error("Failed to save trade summary cache to storage", err);
    }
  },

  // Coin notes: watchlist-style notes about coins the user considered but
  // never actually traded. Deliberately separate from both trades and the
  // free-form Notepad, with its own storage key.
  readCoinNotes(): CoinNote[] {
    if (!isBrowser()) return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.COIN_NOTES);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as CoinNote[]) : [];
    } catch (err) {
      console.error("Failed to read coin notes from storage", err);
      return [];
    }
  },

  writeCoinNotes(notes: CoinNote[]): void {
    if (!isBrowser()) return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.COIN_NOTES, JSON.stringify(notes));
    } catch (err) {
      console.error("Failed to save coin notes to storage", err);
    }
  },

  // Thesis entries (the /thesis page). Same localStorage mechanism as trades, separate key.
  // Entries are validated lightly on read so one corrupted record can't blank the whole page.
  readThesisEntries(): ThesisEntry[] {
    if (!isBrowser()) return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.THESIS_ENTRIES);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return (parsed as ThesisEntry[]).filter(
        (e) =>
          e &&
          typeof e.id === "string" &&
          typeof e.date === "string" &&
          typeof e.entryMarketCap === "number" &&
          typeof e.entryTimestamp === "string" &&
          e.snapshots &&
          typeof e.snapshots === "object"
      );
    } catch (err) {
      console.error("Failed to read thesis entries from storage", err);
      return [];
    }
  },

  writeThesisEntries(entries: ThesisEntry[]): void {
    if (!isBrowser()) return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.THESIS_ENTRIES, JSON.stringify(entries));
    } catch (err) {
      console.error("Failed to save thesis entries to storage", err);
    }
  },

  readThesisSummaryCache(): ThesisSummaryCache {
    if (!isBrowser()) return {};
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.THESIS_SUMMARY_CACHE);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as ThesisSummaryCache) : {};
    } catch (err) {
      console.error("Failed to read thesis summary cache from storage", err);
      return {};
    }
  },

  writeThesisSummaryCache(cache: ThesisSummaryCache): void {
    if (!isBrowser()) return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.THESIS_SUMMARY_CACHE, JSON.stringify(cache));
    } catch (err) {
      console.error("Failed to save thesis summary cache to storage", err);
    }
  },

  /** The localStorage key thesis entries live under — needed to react to cross-tab "storage" events. */
  thesisEntriesKey: STORAGE_KEYS.THESIS_ENTRIES as string,
};

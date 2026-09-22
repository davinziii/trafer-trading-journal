import { CoinNote, SummaryCache, Trade } from "./types";

const STORAGE_KEYS = {
  TRADES: "ctj:trades:v1",
  NOTEPAD: "ctj:notepad:v1",
  SUMMARY_CACHE: "ctj:summaryCache:v1",
  COIN_NOTES: "ctj:coinNotes:v1",
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
};

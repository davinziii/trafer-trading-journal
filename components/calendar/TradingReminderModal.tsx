"use client";

import { X } from "lucide-react";

type TradingReminderModalProps = {
  open: boolean;
  onClose: () => void;
};

export function TradingReminderModal({
  open,
  onClose,
}: TradingReminderModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Trading reminders"
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border-soft bg-surface shadow-2x"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border-soft px-5 py-4">
          <div>
            <h2 className="font-serif text-lg text-ink">
              READ THIS BEFORE TRADING
            </h2>
            <p className="mt-0.5 text-xs text-faint">
              Take a moment to review these before entering a trade.
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close trading reminders"
            className="rounded-md p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {/* Images */}
        <div className="overflow-y-auto p-5">
            <div className="grid w-full gap-5 sm:grid-cols-2">
              <img
                src="/images/reminder1.jpg"
                alt="Trading reminder 1"
                className="w-full rounded-lg border border-border-soft"
              />

              <img
                src="/images/reminder2.jpg"
                alt="Trading reminder 2"
                className="w-full rounded-lg border border-border-soft"
              />
            </div>
        </div>
      </div>
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import { formatMarketCap, interpretMarketCapInput } from "@/lib/calculations";

type MarketCapFieldProps = {
  value: number;
  onChange: (value: number) => void;
  error?: boolean;
  placeholder?: string;
};

const NUMERIC_PATTERN = /^[0-9]*\.?[0-9]*$/;

export function MarketCapField({ value, onChange, error, placeholder }: MarketCapFieldProps) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(value > 0 ? String(value) : "");

  useEffect(() => {
    if (!focused) setRaw(value > 0 ? String(value) : "");
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={focused ? raw : value > 0 ? formatMarketCap(value) : ""}
      placeholder={placeholder ?? "0"}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const v = e.target.value;
        if (!NUMERIC_PATTERN.test(v)) return;
        setRaw(v);
        // Commit on every keystroke (not just blur) so a value isn't lost
        // if the user refreshes/navigates away before leaving the field.
        const n = parseFloat(v);
        onChange(isFinite(n) ? interpretMarketCapInput(n) : 0);
      }}
      onBlur={() => {
        setFocused(false);
        const n = parseFloat(raw);
        onChange(interpretMarketCapInput(n));
      }}
      className={`font-mono w-24 bg-surface-2 text-sm text-ink px-2 py-1.5 rounded-md border transition-colors ${
        error ? "border-danger" : "border-border"
      }`}
    />
  );
}

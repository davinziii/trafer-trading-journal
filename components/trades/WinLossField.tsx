"use client";

import { useEffect, useState } from "react";

type WinLossFieldProps = {
  value: number;
  touched?: boolean;
  onChange: (value: number) => void;
  error?: boolean;
};

const NUMERIC_PATTERN = /^[0-9]*\.?[0-9]*$/;

export function WinLossField({ value, touched, onChange, error }: WinLossFieldProps) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(touched ? String(value) : "");

  // Only re-sync from the outside (e.g. after a fresh row is added) while the
  // field isn't focused, so a value like "3." typed mid-decimal never gets
  // stomped back to "3" on every keystroke.
  useEffect(() => {
    if (!focused) setRaw(touched ? String(value) : "");
  }, [value, touched, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      placeholder="0"
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const v = e.target.value;
        if (!NUMERIC_PATTERN.test(v)) return;
        setRaw(v);
        const n = parseFloat(v);
        onChange(isFinite(n) ? n : 0);
      }}
      onBlur={() => setFocused(false)}
      className={`font-mono w-16 bg-surface-2 text-sm text-ink px-2 py-1.5 rounded-md border transition-colors ${
        error ? "border-danger" : "border-border"
      }`}
    />
  );
}

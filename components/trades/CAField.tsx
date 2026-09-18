"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { truncateAddress } from "@/lib/calculations";

type CAFieldProps = {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  placeholder?: string;
};

export function CAField({ value, onChange, error, placeholder }: CAFieldProps) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(value);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!focused) setRaw(value);
  }, [value, focused]);

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (err) {
      console.error("Failed to copy address", err);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={focused ? raw : truncateAddress(value)}
        placeholder={placeholder ?? "Contract address"}
        title={value || undefined}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const v = e.target.value;
          setRaw(v);
          // Commit on every keystroke (not just blur) so a value isn't lost
          // if the user refreshes/navigates away before leaving the field.
          onChange(v.trim());
        }}
        onBlur={() => {
          setFocused(false);
          onChange(raw.trim());
        }}
        className={`font-mono w-28 bg-surface-2 text-sm text-ink px-2 py-1.5 rounded-md border transition-colors placeholder:text-faint placeholder:font-sans ${
          error ? "border-danger" : "border-border"
        }`}
      />
      <button
        type="button"
        onClick={handleCopy}
        disabled={!value}
        aria-label="Copy contract address"
        title={copied ? "Copied" : "Copy address"}
        className="p-1.5 rounded-md text-faint hover:text-ink transition-colors disabled:opacity-30 disabled:hover:text-faint"
      >
        {copied ? <Check size={13} className="text-win" /> : <Copy size={13} />}
      </button>
    </div>
  );
}

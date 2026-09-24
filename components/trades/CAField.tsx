"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { detectAddressKind, dexscreenerUrl, truncateAddress, ResolvedChain } from "@/lib/calculations";

type EvmChoice = "bsc" | "robinhood";

type CAFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** The chain this CA has been resolved to, if any (persisted on the trade). */
  chain?: ResolvedChain;
  /** Whether the "remember this for this coin" box was checked for that resolution. */
  chainRemembered?: boolean;
  /**
   * Called whenever validation resolves (or clears) the chain. `remembered`
   * is only meaningful for an EVM choice — solana/undefined always pass false.
   */
  onChainChange: (chain: ResolvedChain | undefined, remembered: boolean) => void;
};

export function CAField({ value, onChange, placeholder, chain, chainRemembered, onChainChange }: CAFieldProps) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(value);
  const [copied, setCopied] = useState(false);
  const [showChainPicker, setShowChainPicker] = useState(false);
  const [pickerIntent, setPickerIntent] = useState<"validate" | "link">("validate");
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (!focused) setRaw(value);
  }, [value, focused]);

  const kind = detectAddressKind(value);
  const invalid = !focused && kind === "invalid";

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

  const openDexscreener = (resolvedChain: ResolvedChain) => {
    window.open(dexscreenerUrl(value, resolvedChain), "_blank", "noopener,noreferrer");
  };

  // Runs whenever the CA field itself is left (blur — covers both tabbing
  // away and pressing Enter, since both blur the input first). Resolves or
  // clears the chain so Win/Loss currency and the dexscreener link always
  // match what's actually in the field right now.
  const validate = (address: string) => {
    const k = detectAddressKind(address);
    if (k === "solana") {
      if (chain !== "solana") onChainChange("solana", false);
      return;
    }
    if (k === "evm") {
      const alreadyKnown = (chain === "bsc" || chain === "robinhood") && chainRemembered;
      if (alreadyKnown) return;
      setPickerIntent("validate");
      setRemember(false);
      setShowChainPicker(true);
      return;
    }
    // "empty" or "invalid" — nothing resolvable, so don't leave a stale chain around.
    if (chain !== undefined) onChainChange(undefined, false);
  };

  const handleLinkClick = () => {
    if (kind === "empty" || kind === "invalid") return;
    if (kind === "solana") {
      openDexscreener("solana");
      return;
    }
    // kind === "evm"
    if (chain === "bsc" || chain === "robinhood") {
      openDexscreener(chain);
      return;
    }
    setPickerIntent("link");
    setRemember(false);
    setShowChainPicker(true);
  };

  const chooseChain = (choice: EvmChoice) => {
    onChainChange(choice, remember);
    setShowChainPicker(false);
    if (pickerIntent === "link") openDexscreener(choice);
  };

  const linkDisabled = kind === "empty" || kind === "invalid";
  const linkTitle =
    kind === "empty"
      ? "Add a contract address to link it"
      : kind === "invalid"
      ? "Address length looks wrong"
      : "Open on dexscreener";

  return (
    <div className="flex items-center gap-1">
      <div className="flex flex-col">
        <input
          type="text"
          value={focused ? raw : truncateAddress(value)}
          placeholder={placeholder ?? "CA (optional)"}
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
            const committed = raw.trim();
            onChange(committed);
            validate(committed);
          }}
          className={`font-mono w-28 bg-surface-2 text-sm text-ink px-2 py-1.5 rounded-md border transition-colors placeholder:text-faint placeholder:font-sans ${
            invalid ? "border-danger" : "border-border"
          }`}
        />
        {invalid && (
          <span className="text-[10px] text-danger leading-snug mt-0.5">
            Not a valid length (42 for BSC/Robinhood, 43-44 for Solana).
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={handleLinkClick}
        disabled={linkDisabled}
        aria-label="Open on dexscreener"
        title={linkTitle}
        className="p-1.5 rounded-md text-faint hover:text-accent transition-colors disabled:opacity-30 disabled:hover:text-faint"
      >
        <ExternalLink size={13} />
      </button>
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

      {showChainPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setShowChainPicker(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Choose chain"
        >
          <div
            className="relative w-full max-w-xs rounded-xl border border-border-soft bg-surface p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-serif text-sm text-ink mb-1">Which chain is this?</h3>
            <p className="text-[11px] leading-snug text-faint mb-3">
              BSC and Robinhood addresses look the same, so we need to ask. This also sets whether
              Win/Loss for this coin is tracked in BNB or ETH.
            </p>

            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => chooseChain("bsc")}
                className="flex-1 text-sm font-medium rounded-md px-3 py-1.5 border border-border bg-surface-2 text-ink hover:border-accent transition-colors"
              >
                BSC
              </button>
              <button
                type="button"
                onClick={() => chooseChain("robinhood")}
                className="flex-1 text-sm font-medium rounded-md px-3 py-1.5 border border-border bg-surface-2 text-ink hover:border-accent transition-colors"
              >
                Robinhood
              </button>
            </div>

            <label className="flex items-center gap-2 text-[11px] text-faint cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="rounded border-border"
              />
              Remember this for this coin
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

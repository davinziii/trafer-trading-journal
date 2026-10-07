"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { TYPE_SUGGESTIONS } from "@/lib/thesisTypes";

type TypeComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
  /** Classes for the text input (size, width, colours). */
  inputClassName?: string;
  className?: string;
  /** Runs for keys the combobox doesn't handle itself (e.g. Enter with the list closed submits the form). */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

/**
 * Free-text TYPE field with a suggestions list. Unlike a native <datalist>, opening it always shows
 * every suggestion — even when the field already has a value — so switching from "Meme" to "AI" is
 * one click instead of clearing the field first. Typing filters the list; anything can still be typed.
 */
export function TypeCombobox({
  value,
  onChange,
  placeholder,
  disabled,
  "aria-label": ariaLabel,
  inputClassName = "",
  className = "",
  onKeyDown,
}: TypeComboboxProps) {
  const [open, setOpen] = useState(false);
  // Only filter once the user starts typing; a freshly opened list shows everything.
  const [filtering, setFiltering] = useState(false);
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const q = value.trim().toLowerCase();
  const options = filtering && q ? TYPE_SUGGESTIONS.filter((t) => t.toLowerCase().includes(q)) : TYPE_SUGGESTIONS;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const show = () => {
    setFiltering(false);
    // Highlight the current value only — nothing pre-selected, so Enter on an untouched field still submits.
    setActive(TYPE_SUGGESTIONS.findIndex((t) => t.toLowerCase() === q));
    setOpen(true);
  };

  const choose = (t: string) => {
    onChange(t);
    setOpen(false);
    input.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return show();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (options.length ? (i + step + options.length) % options.length : -1));
      return;
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "Enter" && open) {
      const pick = options[active];
      setOpen(false);
      // Enter picks the highlighted option; if that's already the value (or nothing is highlighted)
      // it falls through to the parent, e.g. to submit the add-coin form.
      if (pick && pick !== value) {
        e.preventDefault();
        e.stopPropagation();
        choose(pick);
        return;
      }
    }
    if (e.key === "Tab") setOpen(false);
    onKeyDown?.(e);
  };

  return (
    <div ref={wrap} className={`relative ${className}`}>
      <input
        ref={input}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={show}
        onClick={() => !open && show()}
        onChange={(e) => {
          onChange(e.target.value);
          setFiltering(true);
          // Typing highlights the first match so Enter autocompletes it; a custom type with no match stays as typed.
          setActive(e.target.value.trim() ? 0 : -1);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        className={`w-full !pr-7 ${inputClassName}`}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Show types"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (open ? setOpen(false) : (input.current?.focus(), show()))}
        className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-faint hover:text-ink transition-colors disabled:opacity-40"
      >
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 left-0 mt-1 min-w-full w-max max-h-60 overflow-y-auto scrollbar-thin rounded-md border border-border bg-surface-2 py-1 shadow-xl shadow-black/40"
        >
          {options.map((t, i) => {
            const selected = t.toLowerCase() === q;
            return (
              <li
                key={t}
                role="option"
                aria-selected={selected}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(t)}
                className={`flex items-center justify-between gap-4 px-2.5 py-1.5 text-sm cursor-pointer ${
                  i === active ? "bg-surface-3 text-ink" : "text-dim"
                }`}
              >
                {t}
                {selected && <Check size={13} className="text-accent" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

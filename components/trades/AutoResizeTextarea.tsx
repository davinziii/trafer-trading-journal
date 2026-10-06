"use client";

import { TextareaHTMLAttributes, useEffect, useRef } from "react";

type AutoResizeTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: boolean;
};

export function AutoResizeTextarea({ error, className = "", value, ...props }: AutoResizeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // border-box sizing: add the borders back so the last line isn't clipped.
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  };

  useEffect(() => {
    resize();
  }, [value]);

  // Re-measure when the width changes (layout settling, window resize) — otherwise a height
  // measured while the box was narrow sticks and leaves a tall empty textarea.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let lastWidth = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      resize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onInput={resize}
      {...props}
      className={`bg-surface-2 text-sm text-ink px-2 py-1.5 rounded-md border transition-colors placeholder:text-faint resize-none overflow-hidden leading-snug ${
        error ? "border-danger" : "border-border"
      } ${className}`}
    />
  );
}

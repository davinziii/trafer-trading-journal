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
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    resize();
  }, [value]);

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

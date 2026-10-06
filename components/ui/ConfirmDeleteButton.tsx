"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

/** Two-step delete so a stray click can't remove data: first click arms it, second (within 3s) confirms. */
export function ConfirmDeleteButton({ onConfirm, label = "Delete entry", size = 15 }: { onConfirm: () => void; label?: string; size?: number }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <button
      type="button"
      onClick={() => {
        if (armed) {
          onConfirm();
          return;
        }
        setArmed(true);
        timer.current = setTimeout(() => setArmed(false), 3000);
      }}
      aria-label={armed ? "Click again to confirm delete" : label}
      title={armed ? "Click again to delete" : label}
      className={`rounded-md transition-colors ${
        armed ? "px-2 py-1 text-[11px] font-medium text-loss bg-loss/10" : "p-1.5 text-faint hover:text-loss hover:bg-surface-3"
      }`}
    >
      {armed ? "Sure?" : <Trash2 size={size} />}
    </button>
  );
}

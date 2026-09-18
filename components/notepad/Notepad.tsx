"use client";

import { useEffect, useRef, useState } from "react";
import { NotebookPen, ChevronRight, BookOpen } from "lucide-react";
import { storage } from "@/lib/storage";
import { NotepadToolbar } from "./NotepadToolbar";
import { TradingReminderModal } from "@/components/calendar/TradingReminderModal";

type NotepadProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

export function Notepad({ open, setOpen }: NotepadProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);
  const [reminderOpen, setReminderOpen] = useState(false);

  useEffect(() => {
    if (editorRef.current && !loaded.current) {
      editorRef.current.innerHTML = storage.readNotepad();
      loaded.current = true;
    }
  }, [open]);

  const handleInput = () => {
    if (editorRef.current) {
      storage.writeNotepad(editorRef.current.innerHTML);
    }
  };

  const handleCommand = (cmd: string) => {
    document.execCommand(cmd, false);
    editorRef.current?.focus();
    handleInput();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open notepad"
        className="flex-shrink-0 w-12 self-stretch rounded-lg border border-border-soft bg-surface flex flex-col items-center pt-4 gap-3 text-faint hover:text-ink transition-colors"
      >
        <NotebookPen size={18} />
        <ChevronRight size={14} />
      </button>
    );
  }

  return (
    <>
      <aside
        className="w-full lg:w-72 flex-shrink-0 rounded-lg border border-border-soft bg-surface flex flex-col h-fit lg:sticky lg:top-6"
        style={{ maxHeight: "calc(100vh - 3rem)" }}
      >
        {/* Notepad header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-soft">
          <span className="font-serif text-base text-ink">
            Trading Notes
          </span>

          <button
            onClick={() => setOpen(false)}
            aria-label="Collapse notepad"
            className="text-faint hover:text-ink transition-colors"
          >
            <ChevronRight size={16} className="rotate-180" />
          </button>
        </div>

        {/* Trading reminder */}
        <div className="p-3 border-b border-border-soft">
          <button
            onClick={() => setReminderOpen(true)}
            className="w-full flex items-center justify-center gap-2 rounded-md border border-border-soft bg-bg px-3 py-2.5 text-[11px] font-semibold tracking-wide text-ink transition-all hover:bg-white/5 hover:border-border active:scale-[0.98]"
          >
            <BookOpen size={14} />
            READ THIS BEFORE TRADING
          </button>
        </div>

        {/* Notepad toolbar */}
        <NotepadToolbar onCommand={handleCommand} />

        {/* Editor */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          data-placeholder="Write your notes..."
          className="notepad-editor flex-1 overflow-y-auto scrollbar-thin px-4 py-3 text-sm leading-relaxed text-ink outline-none"
          style={{ minHeight: "220px" }}
        />

        <style jsx>{`
          .notepad-editor :global(ul) {
            list-style: disc;
            padding-left: 1.25rem;
          }

          .notepad-editor :global(ol) {
            list-style: decimal;
            padding-left: 1.25rem;
          }

          .notepad-editor :global(li) {
            margin: 0.15rem 0;
          }
        `}</style>
      </aside>

      {/* Trading reminder modal */}
      <TradingReminderModal
        open={reminderOpen}
        onClose={() => setReminderOpen(false)}
      />
    </>
  );
}
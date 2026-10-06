"use client";

import { useState } from "react";
import { CoinNote } from "@/lib/types";
import { makeId } from "@/lib/calculations";
import { Eye, Plus } from "lucide-react";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { AutoResizeTextarea } from "./AutoResizeTextarea";

type CoinNotesPanelProps = {
  dateKey: string;
  notes: CoinNote[];
  onChange: (notes: CoinNote[]) => void;
};

function makeBlankNote(dateKey: string): CoinNote {
  return { id: makeId(), date: dateKey, ca: "", coinName: "", note: "" };
}

export function CoinNotesPanel({ dateKey, notes, onChange }: CoinNotesPanelProps) {
  const dayNotes = notes.filter((n) => n.date === dateKey);
  const [blockedId, setBlockedId] = useState<string | null>(null);

  const updateNote = (updated: CoinNote) => {
    onChange(notes.map((n) => (n.id === updated.id ? updated : n)));
    if (blockedId === updated.id && updated.note.trim() !== "") setBlockedId(null);
  };

  const deleteNote = (id: string) => {
    onChange(notes.filter((n) => n.id !== id));
    if (blockedId === id) setBlockedId(null);
  };

  // Blocks adding another blank note until the last one actually has
  // something written in "What caught your eye?" — avoids piling up empty
  // rows as spam. Flags the empty one instead of silently doing nothing.
  const addNote = () => {
    if (dayNotes.length > 0) {
      const last = dayNotes[dayNotes.length - 1];
      if (last.note.trim() === "") {
        setBlockedId(last.id);
        return;
      }
    }
    onChange([...notes, makeBlankNote(dateKey)]);
  };

  return (
    <section className="rounded-lg border border-border-soft bg-surface-2/30 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Eye size={15} className="text-faint" />
          <div>
            <h3 className="font-serif text-base text-ink leading-tight">Watching</h3>
            <p className="text-[11px] leading-snug text-faint">Coins you kept an eye on but didn&apos;t trade.</p>
          </div>
        </div>
        <button
          onClick={addNote}
          className="inline-flex items-center gap-1 text-xs font-medium rounded-md px-2 py-1 text-faint hover:text-win hover:bg-win/10 transition-colors flex-shrink-0"
        >
          <Plus size={13} /> Add note
        </button>
      </div>

      {dayNotes.length === 0 ? (
        <button
          type="button"
          onClick={addNote}
          className="w-full rounded-md border border-dashed border-border py-5 text-center text-xs text-faint hover:text-dim hover:border-faint transition-colors"
        >
          No watch notes for this day — click to add one.
        </button>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {dayNotes.map((n) => (
            <div key={n.id} className="rounded-md border border-border-soft bg-surface p-2 flex items-start gap-1">
              <div className="flex-1 min-w-0">
                <AutoResizeTextarea
                  value={n.note}
                  placeholder="What caught your eye?"
                  error={blockedId === n.id}
                  className="w-full text-xs"
                  onChange={(e) => updateNote({ ...n, note: e.target.value })}
                />
                {blockedId === n.id && (
                  <p className="text-[10px] text-loss leading-snug mt-1">Write something here before adding another note.</p>
                )}
              </div>
              <ConfirmDeleteButton onConfirm={() => deleteNote(n.id)} label="Delete note" size={13} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import { CoinNote } from "@/lib/types";
import { makeId } from "@/lib/calculations";
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
    <div className="w-full lg:w-72 flex-shrink-0 rounded-lg border border-border-soft bg-surface-2/30 p-3 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-serif text-sm text-ink">Watching</h3>
          <p className="text-[11px] leading-snug text-faint">Notes on coins you're keeping an eye on.</p>
        </div>
        <button
          onClick={addNote}
          className="text-xs font-medium rounded-md px-2 py-1 text-faint hover:text-win hover:bg-win/10 transition-colors flex-shrink-0"
        >
          Add more
        </button>
      </div>

      {dayNotes.length === 0 ? (
        <div className="rounded-md border border-dashed border-border py-6 text-center text-xs text-faint">
          No notes for this day.
        </div>
      ) : (
        <div className="space-y-2">
          {dayNotes.map((n) => (
            <div key={n.id} className="rounded-md border border-border-soft bg-surface p-2 space-y-1.5">
              <AutoResizeTextarea
                value={n.note}
                placeholder="What caught your eye?"
                error={blockedId === n.id}
                className="w-full text-xs"
                onChange={(e) => updateNote({ ...n, note: e.target.value })}
              />
              {blockedId === n.id && (
                <p className="text-[10px] text-danger leading-snug">
                  Write something here before adding another note.
                </p>
              )}
              <div className="flex justify-end">
                <button
                  onClick={() => deleteNote(n.id)}
                  className="text-[11px] font-medium rounded-md px-2 py-1 text-faint hover:text-loss hover:bg-loss/10 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


"use client";

import { Plus, Trash2 } from "lucide-react";
import { CoinNote } from "@/lib/types";
import { makeId } from "@/lib/calculations";
import { CAField } from "./CAField";
import { CoinNameField } from "./CoinNameField";
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

  const updateNote = (updated: CoinNote) => {
    onChange(notes.map((n) => (n.id === updated.id ? updated : n)));
  };

  const deleteNote = (id: string) => {
    onChange(notes.filter((n) => n.id !== id));
  };

  const addNote = () => {
    onChange([...notes, makeBlankNote(dateKey)]);
  };

  return (
    <div className="w-full lg:w-72 flex-shrink-0 rounded-lg border border-border-soft bg-surface-2/30 p-3 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-serif text-sm text-ink">Watching</h3>
          <p className="text-[11px] leading-snug text-faint">Coins you noted but didn't trade.</p>
        </div>
        <button
          onClick={addNote}
          aria-label="Add note"
          title="Add note"
          className="p-1.5 rounded-md text-faint hover:text-win transition-colors flex-shrink-0"
        >
          <Plus size={15} />
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
              <div className="flex items-center gap-1.5">
                <CoinNameField value={n.coinName} onChange={(v) => updateNote({ ...n, coinName: v })} />
                <div className="flex-1 min-w-0">
                  <CAField
                    value={n.ca}
                    placeholder="CA (optional)"
                    onChange={(v) => updateNote({ ...n, ca: v })}
                  />
                </div>
                <button
                  onClick={() => deleteNote(n.id)}
                  aria-label="Remove note"
                  className="p-1 rounded-md text-faint hover:text-loss transition-colors flex-shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <AutoResizeTextarea
                value={n.note}
                placeholder="What caught your eye?"
                className="w-full text-xs"
                onChange={(e) => updateNote({ ...n, note: e.target.value })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

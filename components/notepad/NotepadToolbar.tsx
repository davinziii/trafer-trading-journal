"use client";

import { Bold, Italic, Underline, Strikethrough, List, ListOrdered } from "lucide-react";

type NotepadToolbarProps = {
  onCommand: (command: string) => void;
};

const FORMAT_BUTTONS = [
  { cmd: "bold", Icon: Bold, label: "Bold" },
  { cmd: "italic", Icon: Italic, label: "Italic" },
  { cmd: "underline", Icon: Underline, label: "Underline" },
  { cmd: "strikeThrough", Icon: Strikethrough, label: "Strikethrough" },
] as const;

const LIST_BUTTONS = [
  { cmd: "insertUnorderedList", Icon: List, label: "Bulleted list" },
  { cmd: "insertOrderedList", Icon: ListOrdered, label: "Numbered list" },
] as const;

export function NotepadToolbar({ onCommand }: NotepadToolbarProps) {
  const iconButton = (cmd: string, Icon: typeof Bold, label: string) => (
    <button
      key={cmd}
      title={label}
      aria-label={label}
      onMouseDown={(e) => {
        e.preventDefault();
        onCommand(cmd);
      }}
      className="w-7 h-7 rounded flex items-center justify-center text-dim hover:bg-surface-2 transition-colors"
    >
      <Icon size={15} />
    </button>
  );

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-border-soft">
      {FORMAT_BUTTONS.map((b) => iconButton(b.cmd, b.Icon, b.label))}
      <span className="w-px h-4 mx-1 bg-border" />
      {LIST_BUTTONS.map((b) => iconButton(b.cmd, b.Icon, b.label))}
    </div>
  );
}

import { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: boolean;
};

export function Input({ error, className = "", ...props }: InputProps) {
  return (
    <input
      {...props}
      className={`bg-surface-2 text-sm text-ink px-2 py-1.5 rounded-md border transition-colors placeholder:text-faint ${
        error ? "border-danger" : "border-border"
      } ${className}`}
    />
  );
}

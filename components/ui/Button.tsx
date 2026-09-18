import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

const base = "text-sm font-medium rounded-md transition-colors px-3.5 py-1.5";

const variants: Record<Variant, string> = {
  primary: "bg-accent-soft text-accent border border-transparent hover:border-accent",
  ghost: "text-dim hover:text-ink hover:bg-surface-2",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

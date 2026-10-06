"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// "/" is the journal too (the journal has always lived at the root), so both highlight it.
const NAV = [
  { href: "/journal", label: "Journal", match: (p: string) => p === "/" || p.startsWith("/journal") },
  { href: "/thesis", label: "Thesis", match: (p: string) => p.startsWith("/thesis") },
];

export function Header() {
  const pathname = usePathname() ?? "/";
  return (
    <header className="flex flex-col items-center gap-3 py-5 border-b border-border-soft">
      <div className="text-center">
        <h1 className="font-serif text-xl leading-tight">Trafer</h1>
        <span className="block text-xs text-faint">Personal crypto trading journal</span>
      </div>
      <nav aria-label="Primary" className="inline-flex rounded-md border border-border bg-surface-2">
        {NAV.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`text-xs font-medium px-4 py-1.5 rounded transition-colors ${active ? "bg-surface-3 text-ink" : "text-faint hover:text-dim"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

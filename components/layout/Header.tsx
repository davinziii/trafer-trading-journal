export function Header() {
  return (
    <header className="flex items-center justify-center px-6 lg:px-10 py-5 border-b border-border-soft">
      <div className="flex items-baseline gap-3">
        <h1 className="font-serif text-xl text-ink">Trafer</h1>
        <span className="text-xs text-faint">Personal crypto trading journal</span>
      </div>
    </header>
  );
}

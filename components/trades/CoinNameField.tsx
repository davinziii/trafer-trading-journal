type CoinNameFieldProps = {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
};

export function CoinNameField({ value, onChange, error }: CoinNameFieldProps) {
  return (
    <div className="relative w-24">
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-faint pointer-events-none select-none">
        $
      </span>
      <input
        type="text"
        value={value}
        placeholder="COIN"
        // Strip any leading $ the user types themselves so it never doubles up ($$PEPE).
        onChange={(e) => onChange(e.target.value.replace(/^\$+/, ""))}
        className={`w-full bg-surface-2 text-sm text-ink pl-5 pr-2 py-1.5 rounded-md border transition-colors placeholder:text-faint ${
          error ? "border-danger" : "border-border"
        }`}
      />
    </div>
  );
}

import { useUserMode } from "@/lib/mode-context";

export function ModeSwitcher({ className = "" }: { className?: string }) {
  const { mode, setMode } = useUserMode();

  return (
    <div
      role="group"
      aria-label="User mode switcher"
      className={`inline-flex items-center p-1 rounded-xl bg-muted/80 border border-border/60 shadow-xs backdrop-blur-sm ${className}`}
    >
      {/* Contributor Button */}
      <button
        type="button"
        onClick={() => setMode("CONTRIBUTOR")}
        aria-pressed={mode === "CONTRIBUTOR"}
        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] sm:min-h-[38px] rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer select-none ${
          mode === "CONTRIBUTOR"
            ? "bg-card text-foreground shadow-xs ring-1 ring-border/50"
            : "text-muted-foreground hover:text-foreground hover:bg-card/40"
        }`}
      >
        <span className="text-base sm:text-sm">🚌</span>
        <span>Contributor</span>
        {mode === "CONTRIBUTOR" && (
          <span className="w-2 h-2 rounded-full bg-primary ml-0.5 animate-pulse" />
        )}
      </button>

      {/* Traveller Button */}
      <button
        type="button"
        onClick={() => setMode("TRAVELLER")}
        aria-pressed={mode === "TRAVELLER"}
        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] sm:min-h-[38px] rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer select-none ${
          mode === "TRAVELLER"
            ? "bg-card text-foreground shadow-xs ring-1 ring-border/50"
            : "text-muted-foreground hover:text-foreground hover:bg-card/40"
        }`}
      >
        <span className="text-base sm:text-sm">🧭</span>
        <span>Traveller</span>
        {mode === "TRAVELLER" && (
          <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-500 ml-0.5 animate-pulse" />
        )}
      </button>
    </div>
  );
}

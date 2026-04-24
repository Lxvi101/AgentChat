import { cn } from "~/lib/utils";
import { renderBinding } from "~/lib/keyboard/shortcuts";

/**
 * <Kbd binding="mod+shift+o" />  → ⌘ ⇧ O
 * <Kbd binding="g a" />          → G then A
 *
 * Size:
 *   "sm" (default), compact chips (sidebar/cheat-sheet)
 *   "lg", bigger chips (settings page rebinder)
 */
export function Kbd({
  binding,
  size = "sm",
  className,
  muted = false,
}: {
  binding: string;
  size?: "sm" | "lg";
  className?: string;
  muted?: boolean;
}) {
  const chords = renderBinding(binding);
  if (chords.length === 0 || chords[0].length === 0) {
    return (
      <span
        className={cn(
          "text-[11px] italic text-zinc-400",
          size === "lg" && "text-sm",
          className,
        )}
      >
        Unbound
      </span>
    );
  }

  return (
    <span
      // Labels depend on platform (⌘ vs Ctrl), which isn't known on the
      // server. Suppress React's hydration warning since the server emits a
      // sensible default and the client may swap in the platform-correct glyph.
      suppressHydrationWarning
      className={cn(
        "inline-flex items-center gap-1.5 font-sans",
        className,
      )}
    >
      {chords.map((keys, chordIdx) => (
        <span key={chordIdx} className="inline-flex items-center gap-1">
          {chordIdx > 0 ? (
            <span
              className={cn(
                "px-0.5 text-[10px] font-semibold uppercase tracking-wider",
                muted ? "text-zinc-500" : "text-zinc-400",
              )}
            >
              then
            </span>
          ) : null}
          {keys.map((k, idx) => (
            <kbd
              key={`${chordIdx}-${idx}`}
              className={cn(
                "inline-flex items-center justify-center rounded-[8px] border font-medium transition-colors",
                size === "sm"
                  ? "min-w-7 h-6 px-1.5 text-[11px]"
                  : "min-w-9 h-8 px-2.5 text-[13px]",
                muted
                  ? "border-zinc-200 bg-zinc-50 text-zinc-500"
                  : "border-zinc-200 bg-zinc-100 text-zinc-700 shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)]",
              )}
            >
              {k}
            </kbd>
          ))}
        </span>
      ))}
    </span>
  );
}

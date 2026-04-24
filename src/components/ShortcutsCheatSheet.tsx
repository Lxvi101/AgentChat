import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Keyboard, Settings as SettingsIcon, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/dialog";
import { Kbd } from "~/components/ui/kbd";
import { useKeyboardAction, useKeyboardBindings } from "~/hooks/useKeyboardAction";
import { SHORTCUT_GROUPS } from "~/lib/keyboard/shortcuts";

/**
 * The "press ? to see everything" overlay.
 * Opens on `show-shortcuts`, closes on `close-overlay` or Dialog's Esc.
 */
export function ShortcutsCheatSheet() {
  const [open, setOpen] = useState(false);
  const bindings = useKeyboardBindings();

  useKeyboardAction("show-shortcuts", () => setOpen((prev) => !prev));
  useKeyboardAction("close-overlay", () => {
    if (open) setOpen(false);
  });

  const grouped = useMemo(() => {
    const out: Record<string, typeof bindings> = {};
    for (const entry of bindings) {
      const g = entry.def.group;
      if (!out[g]) out[g] = [];
      out[g].push(entry);
    }
    return out;
  }, [bindings]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[900px] sm:max-w-[900px] max-h-[85vh] overflow-hidden p-0 gap-0 bg-gradient-to-b from-white to-zinc-50 border-zinc-200"
      >
        <DialogTitle className="sr-only">Keyboard Shortcuts</DialogTitle>
        <DialogDescription className="sr-only">
          All available keyboard shortcuts grouped by category.
        </DialogDescription>

        <header className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-zinc-900 text-white">
              <Keyboard className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[17px] font-semibold tracking-[-0.02em] text-zinc-900">
                Keyboard Shortcuts
              </div>
              <div className="text-[12.5px] text-zinc-500">
                Press <Kbd binding="shift+slash" size="sm" muted /> any time to toggle this panel
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={"/settings/keyboard" as "/settings/account"}
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-zinc-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-zinc-700 shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-colors hover:bg-zinc-50"
            >
              <SettingsIcon className="h-3.5 w-3.5" />
              Customize
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-[10px] text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="overflow-y-auto px-6 py-5 max-h-[calc(85vh-81px)]">
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              className="grid gap-6 md:grid-cols-2"
            >
              {SHORTCUT_GROUPS.map((group) =>
                grouped[group] ? (
                  <section
                    key={group}
                    className="rounded-[14px] border border-zinc-100 bg-white/70 p-4 backdrop-blur"
                  >
                    <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      {group}
                    </h3>
                    <div className="space-y-2">
                      {grouped[group].map(({ def, binding, isOverridden }) => (
                        <div
                          key={def.id}
                          className="flex items-center justify-between gap-4 rounded-[10px] px-2 py-2 transition-colors hover:bg-zinc-50"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-[13.5px] font-medium text-zinc-900">
                              {def.label}
                              {isOverridden ? (
                                <span className="inline-flex items-center rounded-full bg-zinc-900 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
                                  Custom
                                </span>
                              ) : null}
                            </div>
                            <div className="truncate text-[11.5px] text-zinc-500">
                              {def.description}
                            </div>
                          </div>
                          <Kbd binding={binding} size="sm" />
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null,
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Keyboard, Pencil, RotateCcw, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  SettingsButton,
  SettingsPanel,
  SettingsSectionHeader,
} from "~/components/settings/settings-primitives";
import { Kbd } from "~/components/ui/kbd";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/ui/dialog";
import { useKeyboardBindings } from "~/hooks/useKeyboardAction";
import { keyboardManager } from "~/lib/keyboard/manager";
import {
  SHORTCUT_BY_ID,
  SHORTCUT_GROUPS,
  chordFromEvent,
  renderChord,
  serializeChord,
  type ShortcutId,
} from "~/lib/keyboard/shortcuts";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/settings/keyboard")({
  component: KeyboardSettings,
});

function KeyboardSettings() {
  const bindings = useKeyboardBindings();
  const [editingId, setEditingId] = useState<ShortcutId | null>(null);

  const grouped = useMemo(() => {
    const out: Record<string, typeof bindings> = {};
    for (const entry of bindings) {
      const g = entry.def.group;
      if (!out[g]) out[g] = [];
      out[g].push(entry);
    }
    return out;
  }, [bindings]);

  const hasAnyOverride = useMemo(
    () => bindings.some((b) => b.isOverridden),
    [bindings],
  );

  const handleResetAll = () => {
    keyboardManager.resetAll();
    toast.success("Keyboard shortcuts reset to defaults.");
  };

  return (
    <div className="space-y-5">
      <SettingsSectionHeader
        title="Keyboard Shortcuts"
        description={
          <>
            Every major action in the app is keyboard-driven. Rebind anything
            you like, your preferences are saved in a cookie on this device.
            Press{" "}
            <Kbd binding="shift+slash" size="sm" muted className="mx-0.5" /> any
            time to open the cheat sheet.
          </>
        }
        action={
          hasAnyOverride ? (
            <SettingsButton
              variant="secondary"
              onClick={handleResetAll}
              className="gap-1.5"
            >
              <RotateCcw className="h-3 w-3" />
              Reset all
            </SettingsButton>
          ) : undefined
        }
      />

      <div className="grid gap-3 xl:grid-cols-2">
        {SHORTCUT_GROUPS.map((group) =>
          grouped[group] ? (
            <SettingsPanel key={group} className="space-y-0.5 p-3">
              <div className="mb-1 flex items-center gap-1.5 px-1.5">
                <Keyboard className="h-3 w-3 text-zinc-400" />
                <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  {group}
                </h3>
              </div>
              {grouped[group].map(({ def, binding, isOverridden }) => (
                <div
                  key={def.id}
                  className="group flex items-center justify-between gap-3 rounded-[10px] px-2 py-2 transition-colors hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-zinc-900">
                      {def.label}
                      {isOverridden ? (
                        <span className="inline-flex items-center rounded-full bg-zinc-900 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-white">
                          Custom
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-px truncate text-[11.5px] leading-4 text-zinc-500">
                      {def.description}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Kbd binding={binding} size="sm" />
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => setEditingId(def.id)}
                        className="inline-flex h-6 items-center gap-1 rounded-[8px] border border-zinc-200 bg-white px-1.5 text-[11px] font-semibold text-zinc-700 shadow-[0_1px_4px_rgba(0,0,0,0.035)] transition-colors hover:bg-zinc-50"
                        aria-label={`Rebind ${def.label}`}
                      >
                        <Pencil className="h-2.5 w-2.5" />
                        Rebind
                      </button>
                      {isOverridden ? (
                        <button
                          type="button"
                          onClick={() => {
                            keyboardManager.setBinding(def.id, null);
                            toast.success(`“${def.label}” reset to default.`);
                          }}
                          className="inline-flex h-6 items-center gap-1 rounded-[8px] border border-transparent px-1.5 text-[11px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-100"
                          aria-label={`Reset ${def.label} to default`}
                        >
                          <RotateCcw className="h-2.5 w-2.5" />
                          Reset
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </SettingsPanel>
          ) : null,
        )}
      </div>

      <RebindDialog
        editingId={editingId}
        onClose={() => setEditingId(null)}
      />
    </div>
  );
}

// ─── Rebinder dialog ─────────────────────────────────────────────────────

function RebindDialog({
  editingId,
  onClose,
}: {
  editingId: ShortcutId | null;
  onClose: () => void;
}) {
  const [capturedChord, setCapturedChord] = useState<ReturnType<
    typeof chordFromEvent
  > | null>(null);
  const [conflict, setConflict] = useState<ShortcutId | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  const def = editingId ? SHORTCUT_BY_ID[editingId] : null;
  const currentBinding = editingId
    ? keyboardManager.getBinding(editingId)
    : null;

  // Reset state whenever we open for a new shortcut.
  useEffect(() => {
    setCapturedChord(null);
    setConflict(null);
  }, [editingId]);

  // Capture the next keydown while the dialog is open.
  useEffect(() => {
    if (!editingId) return;
    const onKey = (e: KeyboardEvent) => {
      // Let Escape close the dialog via Radix
      if (e.key === "Escape" && !capturedChord) return;

      const chord = chordFromEvent(e);
      if (!chord) return;
      e.preventDefault();
      e.stopPropagation();
      setCapturedChord(chord);
      const serialized = serializeChord(chord);
      const found = keyboardManager.findConflict(serialized, editingId);
      setConflict(found);
    };
    // Capture phase, run before the global manager.
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, {
        capture: true,
      } as EventListenerOptions);
  }, [editingId, capturedChord]);

  const handleSave = () => {
    if (!editingId || !capturedChord) return;
    const serialized = serializeChord(capturedChord);
    if (conflict) {
      // Swap: give the conflicting shortcut the old binding.
      if (currentBinding) {
        keyboardManager.setBinding(conflict, currentBinding);
      } else {
        keyboardManager.setBinding(conflict, null);
      }
    }
    keyboardManager.setBinding(editingId, serialized);
    toast.success(`“${SHORTCUT_BY_ID[editingId].label}” updated.`);
    onClose();
  };

  const handleReset = () => {
    if (!editingId) return;
    keyboardManager.setBinding(editingId, null);
    toast.success(`“${SHORTCUT_BY_ID[editingId].label}” reset to default.`);
    onClose();
  };

  return (
    <Dialog
      open={!!editingId}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-[420px] gap-0 p-0"
      >
        <DialogTitle className="sr-only">
          Rebind {def?.label ?? "shortcut"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Press a new key combination to assign to this shortcut.
        </DialogDescription>

        <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Rebind
            </div>
            <div className="mt-px text-[14px] font-semibold tracking-[-0.01em] text-zinc-900">
              {def?.label}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-[8px] text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div
          ref={captureRef}
          tabIndex={-1}
          className="flex flex-col items-center gap-3 px-4 py-5 text-center"
        >
          <div className="text-[12px] text-zinc-500">
            {capturedChord
              ? "Press another key combination to replace, or save below."
              : "Press the key combination you want to use."}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={capturedChord ? serializeChord(capturedChord) : "empty"}
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              className={cn(
                "flex min-h-[56px] w-full items-center justify-center rounded-[12px] border-2 border-dashed px-4 py-3",
                capturedChord
                  ? "border-zinc-300 bg-white"
                  : "border-zinc-200 bg-zinc-50",
              )}
            >
              {capturedChord ? (
                <div className="flex items-center gap-1.5">
                  {renderChord(capturedChord).map((k, idx) => (
                    <kbd
                      key={idx}
                      className="inline-flex min-w-8 h-8 items-center justify-center rounded-[8px] border border-zinc-300 bg-zinc-50 px-2 text-[12.5px] font-semibold text-zinc-900 shadow-[inset_0_-2px_0_rgba(0,0,0,0.06)]"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              ) : (
                <span className="text-[12px] italic text-zinc-400">
                  Listening…
                </span>
              )}
            </motion.div>
          </AnimatePresence>

          {conflict ? (
            <div className="flex w-full items-start gap-1.5 rounded-[10px] border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-left">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <div className="text-[11.5px] leading-[1.5] text-amber-900">
                This combination is currently used by{" "}
                <span className="font-semibold">
                  {SHORTCUT_BY_ID[conflict].label}
                </span>
                . Saving will swap them, that shortcut will inherit this
                action's previous binding.
              </div>
            </div>
          ) : null}

          {currentBinding ? (
            <div className="text-[11px] text-zinc-400">
              Current: <Kbd binding={currentBinding} size="sm" muted />
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50/60 px-4 py-2.5">
          <SettingsButton
            variant="secondary"
            onClick={handleReset}
            className="gap-1"
          >
            <RotateCcw className="h-3 w-3" />
            Reset to default
          </SettingsButton>
          <div className="flex items-center gap-1.5">
            <SettingsButton variant="secondary" onClick={onClose}>
              Cancel
            </SettingsButton>
            <SettingsButton
              variant="primary"
              onClick={handleSave}
              disabled={!capturedChord}
            >
              Save
            </SettingsButton>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

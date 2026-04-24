import { useEffect, useSyncExternalStore } from "react";
import { keyboardManager } from "~/lib/keyboard/manager";
import type { ShortcutId } from "~/lib/keyboard/shortcuts";

/**
 * Register a callback for a global keyboard shortcut.
 *
 * The most recently mounted handler wins (LIFO), which naturally matches
 * the UX intuition that the foreground view takes priority.
 *
 *   useKeyboardAction("new-chat", () => handleNewChat());
 *
 * Pass `enabled: false` to temporarily skip registration without remounting.
 */
export function useKeyboardAction(
  id: ShortcutId,
  handler: (e: KeyboardEvent) => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    return keyboardManager.register(id, handler);
    // Re-register whenever the handler identity changes so closures capture fresh state.
  }, [id, handler, enabled]);
}

/**
 * Subscribe to the resolved shortcut map (defaults + user overrides).
 * Uses useSyncExternalStore so changes from the settings page instantly
 * propagate everywhere bindings are displayed, without re-rendering chat.
 */
export function useKeyboardBindings() {
  return useSyncExternalStore(
    keyboardManager.subscribe,
    () => keyboardManager.listResolved(),
    () => keyboardManager.listResolved(),
  );
}

/** Grab a single resolved binding string. */
export function useKeyboardBinding(id: ShortcutId): string {
  return useSyncExternalStore(
    keyboardManager.subscribe,
    () => keyboardManager.getBinding(id),
    () => keyboardManager.getBinding(id),
  );
}

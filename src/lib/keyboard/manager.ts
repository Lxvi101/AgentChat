/**
 * Keyboard Shortcut Manager, a global singleton.
 *
 * Decoupled from React:
 *  • Actions are registered by ID. The most recently registered callback
 *    for a given ID wins (LIFO), so the "active" view naturally takes priority.
 *  • Bindings live in a cookie and are kept in-memory here.
 *  • A single window keydown listener dispatches to the right action.
 *
 * React glues in via `useKeyboardAction` (src/hooks/useKeyboardAction.ts)
 * and `useKeyboardBindings` (subscribes to binding changes via
 * useSyncExternalStore for the settings UI).
 */

import {
  type BindingOverrides,
  type ParsedBinding,
  type ShortcutId,
  SHORTCUT_BY_ID,
  SHORTCUT_DEFINITIONS,
  chordMatchesEvent,
  parseBinding,
  readBindingOverridesFromCookie,
  resolveBinding,
  writeBindingOverridesToCookie,
} from "./shortcuts";

type ActionHandler = (e: KeyboardEvent) => void;

type ActionStack = {
  id: ShortcutId;
  handlers: ActionHandler[];
};

class KeyboardManager {
  private overrides: BindingOverrides = {};
  private listeners = new Set<() => void>();
  private actions = new Map<ShortcutId, ActionStack>();
  /** Parsed bindings, keyed by shortcut id. Rebuilt on override changes. */
  private parsed = new Map<ShortcutId, ParsedBinding>();
  /** Currently in-flight multi-chord sequence (e.g. `g` then `a`). */
  private pendingChord: {
    prefixKey: string;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  /** Cached `listResolved()` output, invalidated when overrides change.
   * Cached because useSyncExternalStore compares snapshots with Object.is
   * and would spin if we returned a fresh array every call. */
  private resolvedCache: ReturnType<KeyboardManager["computeResolved"]> | null =
    null;

  private installed = false;

  install() {
    if (this.installed) return;
    this.installed = true;
    this.overrides = readBindingOverridesFromCookie();
    this.rebuildParsed();
    // Notify subscribers (useSyncExternalStore) in case a Kbd or the settings
    // page rendered with defaults during SSR/first paint before cookies loaded.
    this.emit();
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.handleKeyDown, { capture: true });
    }
  }

  uninstall() {
    if (!this.installed) return;
    this.installed = false;
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.handleKeyDown, {
        capture: true,
      } as EventListenerOptions);
    }
  }

  // ─── Action registration ────────────────────────────────────────────

  register(id: ShortcutId, handler: ActionHandler): () => void {
    let stack = this.actions.get(id);
    if (!stack) {
      stack = { id, handlers: [] };
      this.actions.set(id, stack);
    }
    stack.handlers.push(handler);
    return () => {
      const s = this.actions.get(id);
      if (!s) return;
      const idx = s.handlers.lastIndexOf(handler);
      if (idx !== -1) s.handlers.splice(idx, 1);
      if (s.handlers.length === 0) this.actions.delete(id);
    };
  }

  // ─── Binding access & mutation ─────────────────────────────────────

  getOverrides(): BindingOverrides {
    return { ...this.overrides };
  }

  getBinding(id: ShortcutId): string {
    return resolveBinding(id, this.overrides);
  }

  /** Set a user override for a given shortcut. Pass null to reset to default. */
  setBinding(id: ShortcutId, binding: string | null) {
    if (binding === null) {
      delete this.overrides[id];
    } else {
      this.overrides[id] = binding;
    }
    writeBindingOverridesToCookie(this.overrides);
    this.rebuildParsed();
    this.emit();
  }

  resetAll() {
    this.overrides = {};
    writeBindingOverridesToCookie(this.overrides);
    this.rebuildParsed();
    this.emit();
  }

  /**
   * Find which other shortcut (if any) already uses this binding.
   * Used by the rebinder to warn/offer to swap.
   */
  findConflict(binding: string, ignoreId?: ShortcutId): ShortcutId | null {
    const normalized = binding.trim().toLowerCase();
    for (const def of SHORTCUT_DEFINITIONS) {
      if (def.id === ignoreId) continue;
      if (resolveBinding(def.id, this.overrides).toLowerCase() === normalized) {
        return def.id;
      }
    }
    return null;
  }

  // ─── External subscriptions (for React useSyncExternalStore) ───────

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  private emit() {
    for (const cb of this.listeners) cb();
  }

  // ─── Dispatch ──────────────────────────────────────────────────────

  private rebuildParsed() {
    this.parsed.clear();
    for (const def of SHORTCUT_DEFINITIONS) {
      this.parsed.set(def.id, parseBinding(resolveBinding(def.id, this.overrides)));
    }
    this.resolvedCache = null;
  }

  private isEditable(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (target.isContentEditable) return true;
    return false;
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    // Let the browser's own handling run for IME composition
    if (e.isComposing || e.keyCode === 229) return;

    const inEditable = this.isEditable(e.target);

    // ── Multi-chord sequence resolution (e.g. "g a") ──────────────────
    if (this.pendingChord) {
      const pending = this.pendingChord;
      clearTimeout(pending.timer);
      this.pendingChord = null;
      for (const def of SHORTCUT_DEFINITIONS) {
        const parsed = this.parsed.get(def.id);
        if (!parsed || parsed.chords.length !== 2) continue;
        const [first, second] = parsed.chords;
        if (first.key !== pending.prefixKey) continue;
        if (!chordMatchesEvent(second, e)) continue;
        if (inEditable && !this.shouldFireInEditable(def, parsed)) continue;
        if (this.dispatchMatch(def.id, e, def.preventDefault ?? true)) return;
      }
      // If no match, fall through to normal single-chord handling below.
    }

    // ── Single-chord match ────────────────────────────────────────────
    for (const def of SHORTCUT_DEFINITIONS) {
      const parsed = this.parsed.get(def.id);
      if (!parsed || parsed.chords.length === 0) continue;

      if (parsed.chords.length === 1) {
        if (!chordMatchesEvent(parsed.chords[0], e)) continue;
        if (inEditable && !this.shouldFireInEditable(def, parsed)) continue;
        if (this.dispatchMatch(def.id, e, def.preventDefault ?? true)) return;
      }
    }

    // ── Begin a multi-chord sequence ──────────────────────────────────
    // Only start a sequence when:
    //   • we're not in an editable field, AND
    //   • at least one two-chord shortcut sharing this prefix has a
    //     registered handler (otherwise we'd silently swallow bare keys
    //     like "g" on pages that don't use sequence shortcuts).
    if (!inEditable) {
      for (const def of SHORTCUT_DEFINITIONS) {
        const parsed = this.parsed.get(def.id);
        if (!parsed || parsed.chords.length !== 2) continue;
        const first = parsed.chords[0];
        if (!chordMatchesEvent(first, e)) continue;
        if (!this.anyHandlerForPrefix(first.key)) continue;
        e.preventDefault();
        this.pendingChord = {
          prefixKey: first.key,
          timer: setTimeout(() => {
            this.pendingChord = null;
          }, 1200),
        };
        return;
      }
    }
  };

  /**
   * Should this shortcut fire when the user is focused inside an input/textarea?
   * Rule: explicit `allowInInput`, OR the last chord uses a real modifier
   * (Meta/Ctrl/Alt). Bare letters like "g" or "shift+?" never fire inside inputs.
   */
  private shouldFireInEditable(
    def: (typeof SHORTCUT_DEFINITIONS)[number],
    parsed: ParsedBinding,
  ): boolean {
    if (def.allowInInput) return true;
    const last = parsed.chords[parsed.chords.length - 1];
    if (!last) return false;
    return last.mod || last.ctrl || last.alt;
  }

  /**
   * True if at least one two-chord shortcut whose first chord's key is `prefixKey`
   * currently has a registered action handler.
   */
  private anyHandlerForPrefix(prefixKey: string): boolean {
    for (const def of SHORTCUT_DEFINITIONS) {
      const parsed = this.parsed.get(def.id);
      if (!parsed || parsed.chords.length !== 2) continue;
      if (parsed.chords[0].key !== prefixKey) continue;
      const stack = this.actions.get(def.id);
      if (stack && stack.handlers.length > 0) return true;
    }
    return false;
  }

  private dispatchMatch(
    id: ShortcutId,
    e: KeyboardEvent,
    preventDefault: boolean,
  ): boolean {
    const stack = this.actions.get(id);
    if (!stack || stack.handlers.length === 0) return false;
    const handler = stack.handlers[stack.handlers.length - 1];
    if (preventDefault) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      handler(e);
    } catch (err) {
      // Never let a faulty handler break the listener
      console.error(`Keyboard shortcut "${id}" threw:`, err);
    }
    return true;
  }

  /** Get the full list of definitions, resolved bindings, and override state.
   * Result is memoized, invalidated whenever overrides change via rebuildParsed(). */
  listResolved() {
    if (this.resolvedCache) return this.resolvedCache;
    this.resolvedCache = this.computeResolved();
    return this.resolvedCache;
  }

  private computeResolved() {
    return SHORTCUT_DEFINITIONS.map((def) => ({
      def,
      binding: resolveBinding(def.id, this.overrides),
      isOverridden: this.overrides[def.id] !== undefined,
    }));
  }
}

export const keyboardManager = new KeyboardManager();

// Re-export types for convenience
export { SHORTCUT_BY_ID };

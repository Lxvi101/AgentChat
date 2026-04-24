/**
 * Keyboard shortcut definitions and utilities.
 *
 * A shortcut is serialized as a normalized lowercase string:
 *   "mod+shift+o", "mod+k", "shift+slash", "escape", "alt+arrowup"
 *
 * `mod` resolves to Meta on macOS and Control on other platforms.
 * Keys are matched against `e.code` (layout-independent) for letters/digits,
 * and against `e.key` for special keys (escape, arrows, slash, etc.).
 */

export type ShortcutId =
  | "open-search"
  | "new-chat"
  | "toggle-sidebar"
  | "open-model-picker"
  | "delete-chat"
  | "focus-input"
  | "send-message"
  | "stop-generation"
  | "prev-thread"
  | "next-thread"
  | "toggle-studio"
  | "open-settings"
  | "back-to-chat"
  | "toggle-pin"
  | "show-shortcuts"
  | "close-overlay"
  | "settings-tab-account"
  | "settings-tab-customization"
  | "settings-tab-keyboard"
  | "settings-tab-models"
  | "settings-tab-history"
  | "settings-tab-api-keys";

export interface ShortcutDefinition {
  id: ShortcutId;
  label: string;
  description: string;
  group: string;
  defaultBinding: string;
  /** If true, shortcut fires even when focused inside inputs/textareas. */
  allowInInput?: boolean;
  /** If true, preventDefault() is called after dispatch (default: true). */
  preventDefault?: boolean;
  /** If true, cannot be rebound by the user (reserved). */
  locked?: boolean;
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  // Navigation
  {
    id: "new-chat",
    label: "New Chat",
    description: "Start a fresh conversation",
    group: "Navigation",
    defaultBinding: "mod+shift+o",
  },
  {
    id: "open-search",
    label: "Search",
    description: "Open the search dialog",
    group: "Navigation",
    defaultBinding: "mod+k",
  },
  {
    id: "toggle-sidebar",
    label: "Toggle Sidebar",
    description: "Show or hide the thread sidebar",
    group: "Navigation",
    defaultBinding: "mod+b",
  },
  {
    id: "prev-thread",
    label: "Previous Thread",
    description: "Jump to the previous conversation",
    group: "Navigation",
    defaultBinding: "mod+alt+arrowup",
  },
  {
    id: "next-thread",
    label: "Next Thread",
    description: "Jump to the next conversation",
    group: "Navigation",
    defaultBinding: "mod+alt+arrowdown",
  },
  {
    id: "toggle-studio",
    label: "Toggle Image Studio",
    description: "Switch between chat and Image Studio",
    group: "Navigation",
    defaultBinding: "mod+shift+i",
  },
  {
    id: "open-settings",
    label: "Open Settings",
    description: "Go to the settings page",
    group: "Navigation",
    defaultBinding: "mod+comma",
  },
  {
    id: "back-to-chat",
    label: "Back to Chat",
    description: "Return to chat from settings, studio, or admin",
    group: "Navigation",
    defaultBinding: "mod+shift+c",
  },

  // Composer
  {
    id: "focus-input",
    label: "Focus Composer",
    description: "Move focus into the message input",
    group: "Composer",
    defaultBinding: "mod+i",
  },
  {
    id: "send-message",
    label: "Send Message",
    description: "Send the current message (while focused in composer)",
    group: "Composer",
    defaultBinding: "mod+enter",
    allowInInput: true,
  },
  {
    id: "stop-generation",
    label: "Stop Generation",
    description: "Halt the current AI response",
    group: "Composer",
    defaultBinding: "mod+period",
  },
  {
    id: "open-model-picker",
    label: "Open Model Picker",
    description: "Change the active AI model",
    group: "Composer",
    defaultBinding: "mod+slash",
  },

  // Thread actions
  {
    id: "delete-chat",
    label: "Delete Current Chat",
    description: "Delete the active conversation",
    group: "Thread",
    defaultBinding: "mod+shift+backspace",
  },
  {
    id: "toggle-pin",
    label: "Pin / Unpin Thread",
    description: "Toggle pin on the active conversation",
    group: "Thread",
    defaultBinding: "mod+shift+p",
  },

  // Global
  {
    id: "show-shortcuts",
    label: "Show Shortcuts",
    description: "Open the keyboard shortcuts cheat sheet",
    group: "Global",
    defaultBinding: "shift+slash",
  },
  {
    id: "close-overlay",
    label: "Close Overlay",
    description: "Close dialogs, menus, or the cheat sheet",
    group: "Global",
    defaultBinding: "escape",
    allowInInput: true,
    preventDefault: false,
  },

  // Settings tabs (only active on /settings/*)
  {
    id: "settings-tab-account",
    label: "Settings: Account",
    description: "Jump to the Account settings tab",
    group: "Settings",
    defaultBinding: "g a",
  },
  {
    id: "settings-tab-customization",
    label: "Settings: Customization",
    description: "Jump to the Customization tab",
    group: "Settings",
    defaultBinding: "g c",
  },
  {
    id: "settings-tab-keyboard",
    label: "Settings: Keyboard",
    description: "Jump to the Keyboard Shortcuts tab",
    group: "Settings",
    defaultBinding: "g k",
  },
  {
    id: "settings-tab-models",
    label: "Settings: Models",
    description: "Jump to the Models tab",
    group: "Settings",
    defaultBinding: "g m",
  },
  {
    id: "settings-tab-history",
    label: "Settings: History",
    description: "Jump to the History & Sync tab",
    group: "Settings",
    defaultBinding: "g h",
  },
  {
    id: "settings-tab-api-keys",
    label: "Settings: API Keys",
    description: "Jump to the API Keys tab",
    group: "Settings",
    defaultBinding: "g y",
  },
];

export const SHORTCUT_BY_ID: Record<ShortcutId, ShortcutDefinition> =
  SHORTCUT_DEFINITIONS.reduce(
    (acc, def) => {
      acc[def.id] = def;
      return acc;
    },
    {} as Record<ShortcutId, ShortcutDefinition>,
  );

export const SHORTCUT_GROUPS = Array.from(
  new Set(SHORTCUT_DEFINITIONS.map((d) => d.group)),
);

// ─── Binding parsing & matching ──────────────────────────────────────────

export type ParsedBinding = {
  /** Ordered sequence of chords. Single-chord bindings have length 1. */
  chords: ParsedChord[];
  raw: string;
};

export type ParsedChord = {
  mod: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /** The "main" key (lowercased). Always matches either e.key or the suffix of e.code. */
  key: string;
};

export function parseBinding(raw: string): ParsedBinding {
  const chords = raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(parseChord);
  return { chords, raw };
}

function parseChord(raw: string): ParsedChord {
  const parts = raw.split("+").map((p) => p.trim()).filter(Boolean);
  const chord: ParsedChord = {
    mod: false,
    ctrl: false,
    alt: false,
    shift: false,
    key: "",
  };
  for (const part of parts) {
    switch (part) {
      case "mod":
      case "cmd":
      case "meta":
        chord.mod = true;
        break;
      case "ctrl":
      case "control":
        chord.ctrl = true;
        break;
      case "alt":
      case "option":
      case "opt":
        chord.alt = true;
        break;
      case "shift":
        chord.shift = true;
        break;
      default:
        chord.key = part;
    }
  }
  return chord;
}

/** Single-chord serializer for the rebinder UI. */
export function serializeChord(chord: ParsedChord): string {
  const parts: string[] = [];
  if (chord.mod) parts.push("mod");
  if (chord.ctrl && !chord.mod) parts.push("ctrl");
  if (chord.alt) parts.push("alt");
  if (chord.shift) parts.push("shift");
  if (chord.key) parts.push(chord.key);
  return parts.join("+");
}

export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");

/**
 * Determine whether a given chord matches a KeyboardEvent.
 * Modifier keys alone (Shift, Control, etc.) do not match.
 */
export function chordMatchesEvent(chord: ParsedChord, e: KeyboardEvent): boolean {
  const modKey = isMac ? e.metaKey : e.ctrlKey;
  if (chord.mod !== modKey) return false;
  if (chord.ctrl && !e.ctrlKey) return false;
  if (!chord.ctrl && !chord.mod && e.ctrlKey && !isMac) return false;
  if (chord.alt !== e.altKey) return false;
  if (chord.shift !== e.shiftKey) return false;

  const k = normalizeEventKey(e);
  return k === chord.key;
}

/**
 * Normalize a KeyboardEvent's key into the lowercase token we use in bindings.
 * Uses e.code for letters/digits (layout independent), e.key for everything else.
 */
export function normalizeEventKey(e: KeyboardEvent): string {
  const code = e.code;
  if (code.startsWith("Key") && code.length === 4) {
    return code.slice(3).toLowerCase();
  }
  if (code.startsWith("Digit") && code.length === 6) {
    return code.slice(5);
  }
  const key = (e.key || "").toLowerCase();
  if (key === " ") return "space";
  if (key === "+") return "plus";
  if (key === ",") return "comma";
  if (key === ".") return "period";
  if (key === "/") return "slash";
  if (key === "\\") return "backslash";
  if (key === "[") return "bracketleft";
  if (key === "]") return "bracketright";
  if (key === ";") return "semicolon";
  if (key === "'") return "quote";
  if (key === "`") return "backquote";
  if (key === "-") return "minus";
  if (key === "=") return "equal";
  if (key === "?") return "slash"; // shift+slash on US layouts
  return key;
}

/** Build a single chord from a raw KeyboardEvent, used by the rebinder UI. */
export function chordFromEvent(e: KeyboardEvent): ParsedChord | null {
  const key = normalizeEventKey(e);
  // Ignore pure modifier presses
  if (
    key === "shift" ||
    key === "control" ||
    key === "alt" ||
    key === "meta" ||
    key === "command" ||
    key === "option" ||
    key === ""
  ) {
    return null;
  }
  return {
    mod: isMac ? e.metaKey : e.ctrlKey,
    ctrl: !isMac ? false : e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    key,
  };
}

// ─── Rendering ───────────────────────────────────────────────────────────

const KEY_LABELS: Record<string, string> = {
  mod: isMac ? "⌘" : "Ctrl",
  cmd: "⌘",
  meta: "⌘",
  ctrl: isMac ? "⌃" : "Ctrl",
  control: isMac ? "⌃" : "Ctrl",
  alt: isMac ? "⌥" : "Alt",
  option: "⌥",
  shift: "⇧",
  enter: "↵",
  return: "↵",
  escape: "Esc",
  esc: "Esc",
  backspace: "⌫",
  delete: "⌦",
  tab: "⇥",
  space: "Space",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  slash: "/",
  backslash: "\\",
  comma: ",",
  period: ".",
  semicolon: ";",
  quote: "'",
  backquote: "`",
  minus: "-",
  equal: "=",
  plus: "+",
  bracketleft: "[",
  bracketright: "]",
};

/** Render a single binding (possibly multi-chord) as an array of key-label arrays. */
export function renderBinding(raw: string): string[][] {
  const parsed = parseBinding(raw);
  return parsed.chords.map(renderChord);
}

export function renderChord(chord: ParsedChord): string[] {
  const out: string[] = [];
  if (chord.mod) out.push(KEY_LABELS.mod);
  if (chord.ctrl && !chord.mod) out.push(KEY_LABELS.ctrl);
  if (chord.alt) out.push(KEY_LABELS.alt);
  if (chord.shift) out.push(KEY_LABELS.shift);
  if (chord.key) {
    const label = KEY_LABELS[chord.key];
    if (label) {
      out.push(label);
    } else if (chord.key.length === 1) {
      out.push(chord.key.toUpperCase());
    } else {
      out.push(chord.key.charAt(0).toUpperCase() + chord.key.slice(1));
    }
  }
  return out;
}

// ─── Cookie persistence ──────────────────────────────────────────────────

export const KEYBOARD_COOKIE = "kbd_shortcuts";
export const KEYBOARD_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export type BindingOverrides = Partial<Record<ShortcutId, string>>;

export function readBindingOverridesFromCookie(): BindingOverrides {
  if (typeof document === "undefined") return {};
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${KEYBOARD_COOKIE}=([^;]*)`),
  );
  if (!match) return {};
  try {
    const decoded = decodeURIComponent(match[1]);
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as BindingOverrides;
    }
  } catch {
    // fall through
  }
  return {};
}

export function writeBindingOverridesToCookie(overrides: BindingOverrides) {
  if (typeof document === "undefined") return;
  const json = JSON.stringify(overrides);
  document.cookie = `${KEYBOARD_COOKIE}=${encodeURIComponent(
    json,
  )}; path=/; max-age=${KEYBOARD_COOKIE_MAX_AGE}; samesite=lax`;
}

export function resolveBinding(
  id: ShortcutId,
  overrides: BindingOverrides,
): string {
  const override = overrides[id];
  if (typeof override === "string" && override.trim().length > 0) {
    return override;
  }
  return SHORTCUT_BY_ID[id].defaultBinding;
}

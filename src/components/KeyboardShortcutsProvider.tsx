import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { keyboardManager } from "~/lib/keyboard/manager";
import { useKeyboardAction } from "~/hooks/useKeyboardAction";
import { ShortcutsCheatSheet } from "~/components/ShortcutsCheatSheet";

/**
 * Mount the global keyboard listener once and register the app-wide
 * shortcuts that can be fulfilled from any route (navigation, cheat sheet,
 * settings tab jumps). Route-scoped shortcuts (new chat, toggle sidebar,
 * focus composer, etc.) are registered inside those routes themselves, * since useKeyboardAction is LIFO, the active route always wins.
 */
export function KeyboardShortcutsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    keyboardManager.install();
    return () => {
      // We intentionally keep the listener alive across HMR, uninstall only on full teardown.
      keyboardManager.uninstall();
    };
  }, []);

  // ── Global navigation shortcuts ──────────────────────────────────
  useKeyboardAction("open-settings", () => {
    navigate({ to: "/settings/account" });
  });

  useKeyboardAction("back-to-chat", () => {
    navigate({ to: "/chat" });
  });

  // ── Settings-tab jumps (only active on /settings/*) ──────────────
  const inSettings = pathname.startsWith("/settings");
  useKeyboardAction(
    "settings-tab-account",
    () => navigate({ to: "/settings/account" }),
    inSettings,
  );
  useKeyboardAction(
    "settings-tab-customization",
    () => navigate({ to: "/settings/customization" }),
    inSettings,
  );
  useKeyboardAction(
    "settings-tab-keyboard",
    // Cast: the routeTree.gen.ts is regenerated on dev-server start; the
    // typed union may not yet include /settings/keyboard until that runs.
    () => navigate({ to: "/settings/keyboard" as unknown as "/settings/account" }),
    inSettings,
  );
  useKeyboardAction(
    "settings-tab-models",
    () => navigate({ to: "/settings/models" }),
    inSettings,
  );
  useKeyboardAction(
    "settings-tab-history",
    () => navigate({ to: "/settings/history" }),
    inSettings,
  );
  useKeyboardAction(
    "settings-tab-api-keys",
    () => navigate({ to: "/settings/api-keys" }),
    inSettings,
  );

  return (
    <>
      {children}
      <ShortcutsCheatSheet />
    </>
  );
}

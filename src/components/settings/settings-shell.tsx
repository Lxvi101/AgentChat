import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { ArrowLeft, Info, Monitor, ShieldAlert } from "lucide-react";
import { useTheme } from "next-themes";
import { api } from "../../../convex/_generated/api";
import { authClient } from "~/lib/auth-client";
import { clearClientRootRouteContextCache } from "~/lib/root-route-context";
import { cn } from "~/lib/utils";
import { Kbd } from "~/components/ui/kbd";
import { useKeyboardBindings } from "~/hooks/useKeyboardAction";
import type { ShortcutId } from "~/lib/keyboard/shortcuts";
import {
  SettingsBadge,
  SettingsButton,
  SettingsPanel,
  SettingsSkeleton,
} from "./settings-primitives";

const tabs = [
  { name: "Account", href: "/settings/account" },
  { name: "Customization", href: "/settings/customization" },
  { name: "Keyboard", href: "/settings/keyboard" },
  { name: "History & Sync", href: "/settings/history" },
  { name: "Models", href: "/settings/models" },
  { name: "API Keys", href: "/settings/api-keys" },
  { name: "Attachments", href: "/settings/attachments" },
  { name: "Contact Us", href: "/settings/contact" },
];

// Shortcut IDs to surface in the compact sidebar preview.
const SIDEBAR_SHORTCUT_IDS: ShortcutId[] = [
  "open-search",
  "new-chat",
  "toggle-sidebar",
  "open-model-picker",
  "focus-input",
  "show-shortcuts",
];

export function SettingsShell() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const profile = useQuery(api.users.getProfile);
  const sessionState = authClient.useSession() as {
    data?: {
      user?: { name?: string | null; email?: string | null; image?: string | null };
    } | null;
    isPending?: boolean;
  };
  const session = sessionState.data;
  const isSessionPending = sessionState.isPending ?? false;
  const { isLoading: isAuthLoading } = useConvexAuth();
  const { setTheme } = useTheme();
  const allBindings = useKeyboardBindings();
  const sidebarShortcuts = SIDEBAR_SHORTCUT_IDS.map((id) =>
    allBindings.find((b) => b.def.id === id),
  ).filter((x): x is NonNullable<typeof x> => !!x);

  const handleSignOut = async () => {
    clearClientRootRouteContextCache();
    await authClient.signOut();
    window.location.href = "/";
  };

  const displayName =
    profile?.name || session?.user?.name || session?.user?.email?.split("@")[0] || "User";
  const email = profile?.email || session?.user?.email || "";
  const avatarUrl = session?.user?.image;
  const initial = displayName.charAt(0).toUpperCase() || "U";
  const isProfileLoading = isAuthLoading || isSessionPending || profile === undefined;

  return (
    <div className="h-full overflow-y-auto bg-[linear-gradient(180deg,#f8f8f8_0%,#f2f2f2_100%)] text-zinc-900">
      <div className="fixed inset-0 -z-10 bg-noise opacity-[0.025]" />
      <div className="mx-auto max-w-[1280px] px-4 py-4 md:px-6 md:py-5 xl:px-7">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Link
            to="/chat"
            className="inline-flex w-fit items-center gap-2 rounded-full px-2.5 py-1.5 text-[12.5px] font-semibold text-zinc-700 transition-colors duration-200 hover:bg-white hover:text-zinc-950"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Chat
          </Link>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setTheme("system")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-[0_2px_8px_rgba(0,0,0,0.035)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-zinc-50"
              aria-label="Use system theme"
            >
              <Monitor className="h-3.5 w-3.5" />
            </button>
            <SettingsButton type="button" variant="secondary" onClick={handleSignOut}>
              Sign out
            </SettingsButton>
          </div>
        </header>

        <div className="mt-5 grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)] xl:gap-6">
          <aside className="space-y-4 xl:sticky xl:top-8 xl:self-start">
            {isProfileLoading ? (
              <SettingsSidebarSkeleton />
            ) : (
              <div className="flex flex-col items-center px-2 pt-1 text-center">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-black shadow-[0_8px_20px_rgba(0,0,0,0.08)]">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl font-semibold tracking-[-0.03em] text-white/0">
                      {initial}
                    </span>
                  )}
                </div>
                <div className="mt-3 space-y-0.5">
                  <h1 className="text-[17px] font-semibold tracking-[-0.02em] text-zinc-900">
                    {displayName}
                  </h1>
                  <p className="text-[12px] text-zinc-500">{email}</p>
                </div>
                <SettingsBadge className="mt-2 bg-zinc-100">Free Plan</SettingsBadge>
              </div>
            )}

            <SettingsPanel className="space-y-3">
              <div className="flex items-start justify-between">
                <h2 className="text-[12.5px] font-semibold tracking-[-0.01em] text-zinc-900">
                  Usage Limits
                </h2>
                <a
                  href="https://t3.chat/faq"
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-400 transition-colors hover:text-zinc-700"
                  aria-label="Learn how the usage meter works"
                >
                  <Info className="h-3.5 w-3.5" />
                </a>
              </div>
              <div className="space-y-2">
                <div className="text-[12px] text-zinc-500">Base</div>
                <div className="h-1.5 rounded-full bg-zinc-200">
                  <motion.div
                    className="h-full rounded-full bg-zinc-900"
                    initial={false}
                    animate={{ width: "100%" }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>
            </SettingsPanel>

            <SettingsPanel className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[12.5px] font-semibold tracking-[-0.01em] text-zinc-900">
                  Keyboard Shortcuts
                </h2>
                <Link
                  to={"/settings/keyboard" as "/settings/account"}
                  className="text-[11px] font-semibold text-zinc-500 transition-colors hover:text-zinc-900"
                >
                  Edit →
                </Link>
              </div>
              <div className="space-y-2">
                {sidebarShortcuts.map(({ def, binding }) => (
                  <div
                    key={def.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="truncate text-[12px] font-medium text-zinc-800">
                      {def.label}
                    </span>
                    <Kbd binding={binding} size="sm" />
                  </div>
                ))}
              </div>
            </SettingsPanel>
          </aside>

          <section className="min-w-0">
            <nav
              className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-[12px] bg-zinc-200/70 p-0.5 no-scrollbar"
              aria-label="Settings sections"
            >
              {tabs.map((tab) => {
                const active = currentPath === tab.href;
                return (
                  <Link
                    key={tab.href}
                    to={tab.href}
                    className={cn(
                      "relative rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap text-zinc-600 transition-colors duration-200",
                      active ? "text-zinc-950" : "hover:text-zinc-900",
                    )}
                  >
                    {active ? (
                      <motion.span
                        layoutId="settings-active-tab"
                        className="absolute inset-0 rounded-[10px] border border-zinc-200 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.045)]"
                        transition={{ type: "spring", stiffness: 600, damping: 40 }}
                      />
                    ) : null}
                    <span className="relative z-10">{tab.name}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-5 min-h-[560px]">
              {isProfileLoading ? <SettingsContentSkeleton /> : <Outlet />}
            </div>
          </section>
        </div>
      </div>

      {profile?.role === "admin" ? (
        <a
          href="/admin"
          className="fixed bottom-5 right-5 inline-flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white/90 text-zinc-700 shadow-[0_12px_28px_rgba(15,23,42,0.12)] transition-all duration-200 hover:-translate-y-1 hover:text-zinc-950"
          title="Admin Dashboard"
        >
          <ShieldAlert className="h-4 w-4" />
        </a>
      ) : null}
    </div>
  );
}

function SettingsSidebarSkeleton() {
  return (
    <div className="flex flex-col items-center px-2 pt-1 text-center">
      <SettingsSkeleton className="h-20 w-20 rounded-full" />
      <div className="mt-3 flex w-full flex-col items-center gap-1.5">
        <SettingsSkeleton className="h-5 w-24" />
        <SettingsSkeleton className="h-3 w-32" />
      </div>
      <SettingsSkeleton className="mt-2 h-5 w-16 rounded-full" />
    </div>
  );
}

function SettingsContentSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <SettingsSkeleton className="h-6 w-48" />
          <SettingsSkeleton className="h-3.5 w-[400px] max-w-full" />
        </div>
        <SettingsSkeleton className="h-8 w-32 rounded-[10px]" />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <SettingsPanel key={item} className="space-y-3">
            <SettingsSkeleton className="h-7 w-20" />
            <div className="space-y-2">
              <SettingsSkeleton className="h-3.5 w-full" />
              <SettingsSkeleton className="h-3.5 w-4/5" />
              <SettingsSkeleton className="h-3.5 w-3/4" />
            </div>
            <SettingsSkeleton className="mt-6 h-8 w-full rounded-[10px]" />
          </SettingsPanel>
        ))}
      </div>
    </div>
  );
}

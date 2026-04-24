import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouteContext,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import * as React from "react";

import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "~/components/ui/tooltip";
import { Toaster } from "~/components/ui/sonner";
import { KeyboardShortcutsProvider } from "~/components/KeyboardShortcutsProvider";
import { authClient } from "~/lib/auth-client";
import { getToken } from "~/lib/auth-server";
import {
  getClientRootRouteContextCache,
  setClientRootRouteContextCache,
} from "~/lib/root-route-context";
import "~/styles/app.css";

const getAuth = createServerFn({ method: "GET" }).handler(async () => {
  return await getToken();
});

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  convexQueryClient: ConvexQueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      },
      { title: "AgentChat" },
      // Fix the top white gap on iOS Safari
      { name: "theme-color", content: "#fafafa", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#09090b", media: "(prefers-color-scheme: dark)" },
    ],
  }),
  beforeLoad: async (ctx) => {
    if (typeof document !== "undefined") {
      const cachedContext = getClientRootRouteContextCache();
      if (cachedContext) {
        return cachedContext;
      }
    }

    // Always fetch fresh token so auth state stays in sync (e.g. after login/logout).
    const token = await getAuth();

    if (token) {
      ctx.context.convexQueryClient.serverHttpClient?.setAuth(token);
    }

    const routeContext = { isAuthenticated: !!token, token };

    if (typeof document !== "undefined") {
      setClientRootRouteContextCache(routeContext);
    }

    return routeContext;
  },
  component: RootComponent,
});

function RootComponent() {
  const context = useRouteContext({ from: Route.id });

  React.useEffect(() => {
    setClientRootRouteContextCache({
      isAuthenticated: context.isAuthenticated,
      token: context.token,
    });
  }, [context.isAuthenticated, context.token]);

  return (
    <ConvexBetterAuthProvider
      client={context.convexQueryClient.convexClient}
      authClient={authClient}
      initialToken={context.token}
    >
      <RootDocument>
        <Outlet />
      </RootDocument>
    </ConvexBetterAuthProvider>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light" style={{ colorScheme: "light" }}>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light">
          <TooltipProvider>
            <KeyboardShortcutsProvider>{children}</KeyboardShortcutsProvider>
          </TooltipProvider>
          <Toaster />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}

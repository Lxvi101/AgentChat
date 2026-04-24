// IMPORTANT: capture native pushState BEFORE TanStack patches it
import "~/lib/native-history";
import { createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const convexUrl = (import.meta as any).env.VITE_CONVEX_URL!;

  const convexQueryClient = new ConvexQueryClient(convexUrl, {
    expectAuth: true, // Pauses queries until auth is resolved
  });

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
        staleTime: 1000 * 60 * 5, // 5min, Convex handles real-time freshness
        gcTime: 1000 * 60 * 10, // 10min, keep messages warm across navigations (T3-style)
      },
    },
  });

  convexQueryClient.connect(queryClient);

  return createRouter({
    routeTree,
    defaultPreload: "intent",
    defaultPreloadDelay: 50, // fire intent-preload after 50ms hover (T3 uses similar)
    defaultPreloadGcTime: 1000 * 60 * 10, // 10min router preload cache
    defaultPreloadStaleTime: 1000 * 60 * 5,
    context: { queryClient, convexQueryClient },
    scrollRestoration: true,
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

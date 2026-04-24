import { createFileRoute } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../../convex/_generated/api";

// This route exists purely for URL matching and message prefetching.
// The actual chat UI lives in the parent layout route (chat.tsx).
export const Route = createFileRoute("/chat/$threadId")({
  // NOTE: loader does NOT await the prefetch. This is deliberate, T3-style.
  // The UI mounts immediately from cached/stale data while the fresh fetch
  // resolves in the background. Awaiting here reintroduces the 200-300ms stall.
  loader: ({ context: { queryClient }, params: { threadId } }) => {
    if (threadId !== "new") {
      queryClient.prefetchQuery({
        ...convexQuery(api.messages.getMessages, {
          threadId,
        }),
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 10, // keep messages warm for 10min
      });
    }
  },
  component: () => null,
});

import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Root "/" cookie gate.
 * -----------------------------------------------------------------------------
 * Behaviour:
 *   • First visit ever (no `agentch_seen` cookie) → redirect to `/site`.
 *   • Every subsequent visit                      → redirect to `/chat`.
 *
 * The check lives ONLY on the `/` route, every other request path in the
 * app is completely unaffected, so this cannot slow the hot chat/stream
 * path. The cookie is set client-side from the landing page itself
 * (see `www/LandingPage.tsx`), so the only cost here is a single regex
 * against the `cookie` header on the root entry.
 */

const hasSeenLandingFromCookie = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest();
    const cookieHeader = request?.headers.get("cookie") || "";
    // Match the cookie in isolation so we don't false-positive on substrings.
    return /(?:^|;\s*)agentch_seen=1(?:;|$)/.test(cookieHeader);
  },
);

function readSeenFromDocument() {
  if (typeof document === "undefined") return false;
  return /(?:^|;\s*)agentch_seen=1(?:;|$)/.test(document.cookie);
}

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const seen =
      typeof document === "undefined"
        ? await hasSeenLandingFromCookie()
        : readSeenFromDocument();

    throw redirect({ to: seen ? "/chat" : "/site" });
  },
  component: () => null,
});

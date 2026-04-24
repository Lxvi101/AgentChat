import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * /site, marketing shell layout. Child routes: `/` (landing), `ttft` (TTFT
 * test write-up). Auth-free; the landing page sets the `agentch_seen` cookie.
 */
function SiteLayoutRoute() {
  return <Outlet />;
}

export const Route = createFileRoute("/site")({
  component: SiteLayoutRoute,
});

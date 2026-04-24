import { createFileRoute } from "@tanstack/react-router";
import LandingPage from "../../../www/LandingPage";

/**
 * Index route for `/site`, full marketing landing (see `site.tsx` layout).
 */
function SiteIndexRoute() {
  return <LandingPage />;
}

export const Route = createFileRoute("/site/")({
  component: SiteIndexRoute,
  head: () => ({
    meta: [
      { title: "AgentChat, world's fastest open-source chat hub" },
      {
        name: "description",
        content:
          "AgentChat is a unified, ultra-low-latency interface for every frontier AI model. Open source, self-hostable, MIT licensed.",
      },
      { property: "og:title", content: "AgentChat" },
      {
        property: "og:description",
        content: "The world's fastest open-source chat hub.",
      },
    ],
  }),
});

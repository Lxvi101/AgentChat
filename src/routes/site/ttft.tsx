import { createFileRoute } from "@tanstack/react-router";
import { TtftTestPage } from "../../../www/TtftTestPage";

function SiteTtftRoute() {
  return <TtftTestPage />;
}

export const Route = createFileRoute("/site/ttft")({
  component: SiteTtftRoute,
  head: () => ({
    meta: [
      { title: "Time to first token, how we tested | AgentChat" },
      {
        name: "description",
        content:
          "A plain-language description of the informal TTFT check we use on the marketing site. Heuristic, not a lab benchmark.",
      },
    ],
  }),
});

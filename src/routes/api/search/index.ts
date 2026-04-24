import { createFileRoute } from "@tanstack/react-router";
import { orchestrateSearch, orchestrateSearchStream } from "~/lib/web-search";

function validateApiKey(request: Request): boolean {
  const key =
    request.headers.get("x-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  const expected = process.env.SEARCH_API_KEY;
  if (!expected) return false;
  return key === expected;
}

export const Route = createFileRoute("/api/search/")({
  server: {
    handlers: {
      /** Non-streaming: returns full JSON answer */
      POST: async ({ request }) => {
        if (!validateApiKey(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { query, model, context, stream } = body as {
          query?: string;
          model?: string;
          context?: string;
          stream?: boolean;
        };

        if (!query) {
          return Response.json({ error: "Missing 'query' field" }, { status: 400 });
        }

        // Streaming mode: SSE
        if (stream) {
          return streamResponse(query, model, context);
        }

        // Non-streaming mode: full JSON response
        try {
          const result = await orchestrateSearch({
            query,
            model,
            conversationContext: context,
          });

          return Response.json({
            success: true,
            data: {
              answer: result.answer,
              steps: result.steps?.map((s) => ({ id: s.id, tool: s.tool, label: s.label, status: s.status })),
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Search failed";
          return Response.json({ success: false, error: message }, { status: 500 });
        }
      },
    },
  },
});

function streamResponse(query: string, model?: string, context?: string): Response {
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const events = orchestrateSearchStream({
          query,
          model,
          conversationContext: context,
        });

        for await (const event of events) {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Search failed";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", error: message })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

import { generateText, streamText, stepCountIs, zodSchema, tool } from "ai";
import { z } from "zod";
import { getModel } from "../hosts";
import { firecrawlSearch, firecrawlScrape } from "./firecrawl";
import type { SearchEvent, SearchStep, SearchOptions, DomainResult, FirecrawlSearchResult } from "./types";

const FAST_MODEL = "openai/gpt-oss-20b";

let stepCounter = 0;
function nextStepId(): string {
  return `step-${++stepCounter}-${Date.now().toString(36)}`;
}

function getTimeContext(): string {
  const now = new Date();
  return `Current date and time: ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} at ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" })}`;
}

const ORCHESTRATOR_SYSTEM_PROMPT = `You are a search orchestrator agent. Your job is to decide the best search strategy for the user's query and execute it using your available tools.

${getTimeContext()}

## Available strategies

1. **No search needed**, If you can answer from your training data, just respond directly without calling any tools.

2. **Quick web search**, For simple factual lookups, current events, or single-topic questions. Use the \`web_search\` tool with a well-crafted query.

3. **Scrape specific websites**, When the user mentions a specific URL/website, or when you need to get the full content from a page you found via web search. Use the \`scrape_websites\` tool.

4. **Deep research swarm**, For complex, multi-faceted queries that need parallel research across multiple angles. Use the \`research_swarm\` tool to dispatch multiple agents in parallel.

## Guidelines

- You can call tools MULTIPLE times in sequence. For example: do a web_search first, then scrape interesting results, then answer.
- For complex queries, prefer research_swarm which does parallel deep-dive research.
- When a user asks about a specific website, scrape it directly.
- Always provide your final answer as a well-structured response citing sources where relevant.
- Be concise but thorough.`;

// ── Tool definitions ─────────────────────────────────────────────────────────

function createTools(signal: AbortSignal, emit: (event: SearchEvent) => void) {
  return {
    web_search: tool({
      description: "Search the web for information. Returns a list of results with titles, URLs, and descriptions. Good for factual lookups, current events, or finding relevant pages.",
      inputSchema: zodSchema(z.object({
        query: z.string().describe("The search query to run"),
        limit: z.number().min(1).max(20).optional().describe("Number of results to return (default 8)"),
      })),
      execute: async ({ query, limit }) => {
        const stepId = nextStepId();
        const step: SearchStep = {
          id: stepId,
          tool: "web_search",
          label: "Web Search",
          input: query,
          status: "running",
        };
        emit({ type: "step-start", step });

        try {
          const results = await firecrawlSearch(query, limit ?? 8, signal);
          const sources = results.map((r) => ({ url: r.url, title: r.title }));
          emit({
            type: "step-done",
            stepId,
            updates: {
              status: "done",
              sourceCount: results.length,
              sources,
              result: `Found ${results.length} results`,
            },
          });

          return {
            results: results.map((r) => ({
              title: r.title,
              url: r.url,
              description: r.description,
            })),
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : "Search failed";
          emit({ type: "step-error", stepId, error: message });
          return { error: message, results: [] };
        }
      },
    }),

    scrape_websites: tool({
      description: "Scrape the full content from one or more URLs. Use this to get detailed page content from specific websites the user mentioned, or from URLs found via web_search.",
      inputSchema: zodSchema(z.object({
        urls: z.array(z.string()).min(1).max(5).describe("URLs to scrape"),
        reason: z.string().describe("Brief reason for scraping these URLs"),
      })),
      execute: async ({ urls, reason }) => {
        const stepId = nextStepId();
        const step: SearchStep = {
          id: stepId,
          tool: "scrape_websites",
          label: "Scraping websites",
          input: reason,
          status: "running",
          sources: urls.map((u) => ({ url: u, title: u })),
        };
        emit({ type: "step-start", step });

        try {
          const results = await Promise.allSettled(
            urls.map((url) =>
              firecrawlScrape(url, signal).then((r) => ({
                url,
                title: r.metadata.title,
                content: r.markdown.length > 6000 ? r.markdown.substring(0, 6000) + "\n\n[...truncated]" : r.markdown,
              })),
            ),
          );

          const pages = results
            .filter((r): r is PromiseFulfilledResult<{ url: string; title: string; content: string }> => r.status === "fulfilled")
            .map((r) => r.value);

          emit({
            type: "step-done",
            stepId,
            updates: {
              status: "done",
              sourceCount: pages.length,
              sources: pages.map((p) => ({ url: p.url, title: p.title })),
              result: `Scraped ${pages.length}/${urls.length} pages`,
            },
          });

          return { pages };
        } catch (err) {
          const message = err instanceof Error ? err.message : "Scrape failed";
          emit({ type: "step-error", stepId, error: message });
          return { error: message, pages: [] };
        }
      },
    }),

    research_swarm: tool({
      description: "Launch a parallel research swarm. Provide 2-6 research topics, each with a label and search query. Multiple agents will search and analyze different angles simultaneously. Best for complex, multi-faceted questions.",
      inputSchema: zodSchema(z.object({
        topics: z.array(
          z.object({
            id: z.string().describe("Short kebab-case identifier"),
            label: z.string().describe("Human-readable label for this research angle"),
            query: z.string().describe("The search query for this topic"),
          }),
        ).min(2).max(6),
      })),
      execute: async ({ topics }) => {
        const stepId = nextStepId();
        const agents = topics.map((t) => ({
          id: t.id,
          label: t.label,
          query: t.query,
          status: "pending" as const,
        }));

        const step: SearchStep = {
          id: stepId,
          tool: "research_swarm",
          label: "Research Swarm",
          input: `${topics.length} parallel research agents`,
          status: "running",
          agents,
        };
        emit({ type: "step-start", step });

        try {
          const domainResults = await Promise.all(
            topics.map(async (topic) => {
              // Mark agent as searching
              const updatedAgents = agents.map((a) =>
                a.id === topic.id ? { ...a, status: "searching" as const } : { ...a },
              );
              emit({
                type: "step-update",
                stepId,
                updates: { agents: updatedAgents },
              });

              try {
                // Search
                const searchResults = await firecrawlSearch(topic.query, 6, signal);

                // Scrape top 2
                const urlsToScrape = searchResults.slice(0, 2).map((r) => r.url);
                const scrapedResults = await Promise.allSettled(
                  urlsToScrape.map((url) =>
                    firecrawlScrape(url, signal).then((r) => {
                      const md = r.markdown;
                      return md.length > 4000 ? md.substring(0, 4000) + "\n\n[...truncated]" : md;
                    }),
                  ),
                );
                const scrapedContent = scrapedResults
                  .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
                  .map((r) => r.value);

                // Summarize
                const snippets = searchResults
                  .map((r) => `[${r.title}](${r.url}): ${r.description}`)
                  .join("\n");
                const fullContent = scrapedContent.join("\n\n---\n\n");

                const { text: summary } = await generateText({
                  model: getModel(FAST_MODEL),
                  messages: [
                    {
                      role: "user",
                      content: `Summarize the following search results for "${topic.label}" (query: "${topic.query}"). Extract key facts, data points, and insights. Be thorough but concise.\n\n## Search Snippets\n${snippets}\n\n## Scraped Pages\n${fullContent}`,
                    },
                  ],
                  abortSignal: signal,
                });

                // Mark agent done
                const doneAgents = agents.map((a) =>
                  a.id === topic.id
                    ? {
                        ...a,
                        status: "done" as const,
                        summary: summary.length > 200 ? summary.substring(0, 200) + "…" : summary,
                        sourceCount: searchResults.length,
                        sources: searchResults.map((r) => ({ url: r.url, title: r.title })),
                      }
                    : { ...a },
                );
                emit({ type: "step-update", stepId, updates: { agents: doneAgents } });
                // Sync the local agents array so subsequent updates have the latest state
                for (let i = 0; i < agents.length; i++) {
                  const updated = doneAgents.find((a) => a.id === agents[i].id);
                  if (updated) Object.assign(agents[i], updated);
                }

                return {
                  id: topic.id,
                  label: topic.label,
                  query: topic.query,
                  summary,
                  searchResults,
                  scrapedContent,
                  error: null,
                } satisfies DomainResult;
              } catch (err) {
                if (err instanceof Error && err.name === "AbortError" && signal.aborted) throw err;
                const message = err instanceof Error ? err.message : "Agent failed";
                const errAgents = agents.map((a) =>
                  a.id === topic.id ? { ...a, status: "error" as const } : { ...a },
                );
                emit({ type: "step-update", stepId, updates: { agents: errAgents } });
                for (let i = 0; i < agents.length; i++) {
                  const updated = errAgents.find((a) => a.id === agents[i].id);
                  if (updated) Object.assign(agents[i], updated);
                }
                return {
                  id: topic.id,
                  label: topic.label,
                  query: topic.query,
                  summary: "",
                  searchResults: [],
                  scrapedContent: [],
                  error: message,
                } satisfies DomainResult;
              }
            }),
          );

          const totalSources = domainResults.reduce((sum, r) => sum + r.searchResults.length, 0);
          emit({
            type: "step-done",
            stepId,
            updates: {
              status: "done",
              sourceCount: totalSources,
              result: `${domainResults.filter((r) => !r.error).length}/${topics.length} agents completed`,
            },
          });

          return {
            results: domainResults.map((r) => ({
              topic: r.label,
              query: r.query,
              summary: r.summary,
              sourceCount: r.searchResults.length,
              sources: r.searchResults.map((s) => ({ url: s.url, title: s.title })),
              error: r.error,
            })),
          };
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") throw err;
          const message = err instanceof Error ? err.message : "Swarm failed";
          emit({ type: "step-error", stepId, error: message });
          return { error: message, results: [] };
        }
      },
    }),
  };
}

// ── Main streaming orchestrator ──────────────────────────────────────────────

export async function* orchestrateSearchStream(
  options: SearchOptions,
): AsyncGenerator<SearchEvent> {
  const { query, conversationContext, model = FAST_MODEL, signal, onEvent } = options;
  const abortSignal = signal ?? AbortSignal.timeout(120_000);

  // Buffer for events emitted by tools (they run inside generateText, not the generator)
  const eventBuffer: SearchEvent[] = [];
  const emit = (event: SearchEvent) => {
    eventBuffer.push(event);
    // Stream events in real-time via callback so the client sees them immediately
    onEvent?.(event);
  };

  const tools = createTools(abortSignal, emit);

  // ── Planning step, visible immediately ──
  const planningStepId = nextStepId();
  const planningEvent: SearchEvent = {
    type: "step-start",
    step: {
      id: planningStepId,
      tool: "planning",
      label: "Analyzing query",
      input: query,
      status: "running",
    },
  };
  // Emit via onEvent for real-time delivery, and yield for generator consumers
  onEvent?.(planningEvent);
  yield planningEvent;

  // Build messages for the agent
  const messages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: ORCHESTRATOR_SYSTEM_PROMPT },
  ];

  if (conversationContext) {
    messages.push({
      role: "user",
      content: `Previous conversation context:\n${conversationContext}`,
    });
  }

  messages.push({ role: "user", content: query });

  // Run the agent with tool calling, maxSteps allows multiple sequential tool calls
  let planningMarkedDone = false;

  // Use generateText with maxSteps for the tool-calling loop, then stream the final answer
  const agentResult = await generateText({
    model: getModel(model),
    messages,
    tools,
    stopWhen: stepCountIs(10),
    abortSignal,
    onStepFinish: ({ toolCalls, toolResults }) => {
      // Mark planning as done on first tool call
      if (!planningMarkedDone && toolCalls?.length) {
        planningMarkedDone = true;
        const doneEvent: SearchEvent = {
          type: "step-done",
          stepId: planningStepId,
          updates: {
            status: "done",
            result: `Strategy: ${toolCalls.map((t: any) => t.toolName).join(", ")}`,
          },
        };
        emit(doneEvent);
      }
    },
  });

  // If planning was never marked done (no tools called, direct answer), mark it now
  if (!planningMarkedDone) {
    const doneEvent: SearchEvent = {
      type: "step-done",
      stepId: planningStepId,
      updates: { status: "done", result: "Direct answer (no search needed)" },
    };
    onEvent?.(doneEvent);
    yield doneEvent;
  }

  // Flush all buffered tool events (for generator consumers like orchestrateSearch)
  for (const event of eventBuffer) {
    yield event;
  }

  // ── Composing step, shows final answer generation ──
  const composingStepId = nextStepId();
  const composingStartEvent: SearchEvent = {
    type: "step-start",
    step: {
      id: composingStepId,
      tool: "composing",
      label: "Composing answer",
      status: "running",
    },
  };
  onEvent?.(composingStartEvent);
  yield composingStartEvent;

  // Now stream the final answer
  // The agent may have produced a text response directly (no tools) or after tools
  const finalText = agentResult.text;

  if (finalText) {
    // Stream the final text character by character in chunks for smooth UX
    const chunkSize = 12;
    for (let i = 0; i < finalText.length; i += chunkSize) {
      yield { type: "chunk", text: finalText.substring(i, i + chunkSize) };
    }

    const composingDoneEvent: SearchEvent = {
      type: "step-done",
      stepId: composingStepId,
      updates: { status: "done", result: `${finalText.length} characters` },
    };
    onEvent?.(composingDoneEvent);
    yield composingDoneEvent;

    yield { type: "done", answer: finalText };
  } else {
    // Edge case: no text response (shouldn't happen with good system prompt)
    const composingErrorEvent: SearchEvent = {
      type: "step-error",
      stepId: composingStepId,
      error: "No response generated",
    };
    onEvent?.(composingErrorEvent);
    yield composingErrorEvent;

    yield { type: "chunk", text: "I wasn't able to generate a response. Please try again." };
    yield { type: "done", answer: "I wasn't able to generate a response. Please try again." };
  }
}

/**
 * Non-streaming variant (kept for compatibility)
 */
export async function orchestrateSearch(options: SearchOptions): Promise<{ answer: string; steps: SearchStep[] }> {
  const steps: SearchStep[] = [];
  let answer = "";

  for await (const event of orchestrateSearchStream(options)) {
    if (event.type === "step-start") steps.push(event.step);
    if (event.type === "step-done") {
      const s = steps.find((s) => s.id === event.stepId);
      if (s) Object.assign(s, { status: "done", ...event.updates });
    }
    if (event.type === "step-error") {
      const s = steps.find((s) => s.id === event.stepId);
      if (s) Object.assign(s, { status: "error", error: event.error });
    }
    if (event.type === "done") answer = event.answer;
  }

  return { answer, steps };
}

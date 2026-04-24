import { createFileRoute } from "@tanstack/react-router";
import { v4 as uuidv4 } from "uuid";
import { generateText } from "ai";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { redis } from "~/lib/redis";
import { getToken } from "~/lib/auth-server";
import { getModel } from "~/lib/hosts";
import { orchestrateSearchStream } from "~/lib/web-search";
import type { SearchEvent, SearchStep } from "~/lib/web-search";
import { formatStreamError } from "~/lib/stream-errors";


const convex = new ConvexHttpClient(process.env.VITE_CONVEX_URL!);

// ── Helpers ──────────────────────────────────────────────────────────────────

function publishSearchEvent(restorationId: string, event: SearchEvent) {
  const data = JSON.stringify({ _searchEvent: event.type, ...event });
  redis.xadd(restorationId, "*", "type", "search", "data", data);
}

async function generateTitle(prompt: string, threadId: string) {
  try {
    const { text } = await generateText({
      model: getModel("openai/gpt-oss-20b"),
      messages: [
        {
          role: "user",
          content: `Generate a short, concise title (max 6 words) for this conversation. Return ONLY the title, no quotes or punctuation.\n\nUser: ${prompt}`,
        },
      ],
    });
    const title = text.trim().replace(/^["']|["']$/g, "");
    if (title) {
      await convex.mutation(api.threads.setTitle, { threadId: threadId as Id<"threads">, title });
    }
  } catch (err) {
    console.error("Title generation error:", err);
  }
}

// ── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/api/chat/search")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = await getToken();
        if (!token) return new Response("Unauthorized", { status: 401 });

        const { threadId, prompt, model, fileIds, agentSnapshot } =
          (await request.json()) as {
            threadId: string;
            prompt: string;
            model?: string;
            fileIds?: string[];
            // Client-provided snapshot of the agent for new threads, lets
            // us skip the `getThreadContext` round-trip on the TTFT-critical
            // path. Matches the shape sent to /api/chat.
            agentSnapshot?: { systemPrompt?: string; includedFiles?: string[] };
          };
        const agentId = request.headers.get("x-agent-id") || undefined;
        const restorationId = uuidv4();
        const modelName = model || "gemini-3-flash-preview";

        convex.setAuth(token);

        // ── Resolve thread + context ────────────────────────────────────────
        // For new threads we fire `threads.create` WITHOUT awaiting it here, // the search orchestrator can begin the query while the thread record
        // is being created. startGeneration, title-gen, and the thread-gen
        // Redis key all chain on this promise.
        let actualThreadIdPromise: Promise<string>;
        let previousMessages: any[] = [];
        let threadContext:
          | { systemPrompt?: string; includedFiles?: Id<"files">[] }
          | null = null;

        if (threadId === "new") {
          actualThreadIdPromise = convex.mutation(api.threads.create, {
            agentId: agentId ? (agentId as Id<"agents">) : undefined,
          }) as Promise<string>;

          if (agentId && agentSnapshot) {
            // Fast path: client supplied the agent's systemPrompt +
            // includedFiles directly. Skip the getThreadContext round-trip.
            threadContext = {
              systemPrompt: agentSnapshot.systemPrompt,
              includedFiles: Array.isArray(agentSnapshot.includedFiles)
                ? (agentSnapshot.includedFiles as Id<"files">[])
                : undefined,
            };
          } else if (agentId) {
            // Fallback: older clients without agentSnapshot fetch from DB.
            const tid = await actualThreadIdPromise;
            threadContext = await convex.query(api.threads.getThreadContext, {
              threadId: tid as Id<"threads">,
            });
          }
          // else: no agent → threadContext stays null.
        } else {
          actualThreadIdPromise = Promise.resolve(threadId);

          const [msgs, ctx] = await Promise.all([
            convex.query(api.messages.getMessages, {
              threadId: threadId as Id<"threads">,
            }),
            convex.query(api.threads.getThreadContext, {
              threadId: threadId as Id<"threads">,
            }),
          ]);
          previousMessages = msgs;
          threadContext = ctx;

          const prevRestorationId = await redis.get(`thread-gen:${threadId}`);
          if (prevRestorationId) {
            redis.publish(`${prevRestorationId}-stop`, "STOP").catch(() => {});
          }
        }

        // Track active generation, for new threads chains on thread creation.
        actualThreadIdPromise
          .then((tid) =>
            redis.set(`thread-gen:${tid}`, restorationId, "EX", 600).catch(() => {}),
          )
          .catch(() => {});

        // ── Collect file context ──────────────────────────────────────────
        const allFileIds = new Set<Id<"files">>();
        for (const msg of previousMessages) {
          if (msg.fileIds) for (const id of msg.fileIds) allFileIds.add(id);
        }
        if (fileIds) for (const id of fileIds) allFileIds.add(id as Id<"files">);
        if (threadContext?.includedFiles) {
          for (const id of threadContext.includedFiles) allFileIds.add(id);
        }

        const fileUrlMap = new Map<Id<"files">, any>();
        if (allFileIds.size > 0) {
          const files = await convex.query(api.files.getFileUrls, {
            fileIds: Array.from(allFileIds),
          });
          for (const f of files) {
            if (f?._id) fileUrlMap.set(f._id, f);
          }
        }

        // ── Build system prompt ───────────────────────────────────────────
        const now = new Date();
        const timeContext = `\n\nCurrent date and time: ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} at ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" })}`;
        let systemContent = (threadContext?.systemPrompt || "You are a helpful assistant.") + timeContext;
        if (threadContext?.includedFiles) {
          const textFilePromises: Promise<{ name: string; text: string } | null>[] = [];
          for (const id of threadContext.includedFiles) {
            const fileData = fileUrlMap.get(id);
            if (!fileData?.url || fileData.mimeType.startsWith("image/")) continue;
            textFilePromises.push(
              fetch(fileData.url)
                .then(async (res) => ({ name: fileData.name, text: await res.text() }))
                .catch(() => null),
            );
          }
          const textFiles = await Promise.all(textFilePromises);
          for (const tf of textFiles) {
            if (tf) systemContent += `\n\n--- FILE: ${tf.name} ---\n${tf.text}\n--- END FILE ---`;
          }
        }

        const conversationContext = previousMessages
          .filter((msg: any) => !msg.isGenerating && msg.parts?.length)
          .map((msg: any) => `${msg.role}: ${msg.parts.filter((p: any) => typeof p === "string").join("\n")}`)
          .slice(-6)
          .join("\n");

        // Fire DB write chained on thread creation, concurrent with the
        // search orchestrator. Don't block the LLM on database work.
        const dbWritePromise = actualThreadIdPromise
          .then((tid) =>
            convex.mutation(api.messages.startGeneration, {
              threadId: tid as Id<"threads">,
              userContent: prompt,
              model: modelName,
              restorationId,
              fileIds: fileIds?.length ? (fileIds as Id<"files">[]) : undefined,
            }),
          )
          .catch((err) => {
            console.error("startGeneration failed (search), aborting:", err);
            redis.xadd(restorationId, "*", "type", "error", "data", "").catch(() => {});
            return null;
          });

        if (threadId === "new") {
          // Title generation chains on thread creation so setTitle has a valid id.
          actualThreadIdPromise
            .then((tid) => generateTitle(prompt, tid))
            .catch(() => {});
        }

        // ── Stream search results directly from POST ─────────────────────
        const encoder = new TextEncoder();
        const formatSse = (data: unknown, event?: string) => {
          const prefix = event ? `event: ${event}\n` : '';
          return encoder.encode(`${prefix}data: ${JSON.stringify(data)}\n\n`);
        };

        let lastDbWrite = 0;

        const responseStream = new ReadableStream({
          start(controller) {
            (async () => {
              // Resolve the thread ID before emitting init. For new threads
              // this awaits threads.create (fired above in parallel).
              let actualThreadId: string;
              try {
                actualThreadId = await actualThreadIdPromise;
              } catch {
                try {
                  controller.enqueue(formatSse({
                    status: 'error',
                    message: 'Failed to create thread. Please try again.',
                  }, 'fatal'));
                } catch {}
                try { controller.close(); } catch {}
                return;
              }

              // Emit init now that newThreadId is known.
              controller.enqueue(formatSse({
                restorationId,
                newThreadId: threadId === "new" ? actualThreadId : undefined,
              }, 'init'));

              const assistantMessageId = await dbWritePromise;
              if (!assistantMessageId) {
                try {
                  controller.enqueue(formatSse({
                    status: 'error',
                    message: 'Failed to save the message. Please try again.',
                  }, 'fatal'));
                } catch {}
                try { controller.close(); } catch {}
                return;
              }

              const abortController = new AbortController();
              const stopSubscriber = redis.duplicate();
              const safetyTimer = setTimeout(() => {
                stopSubscriber.unsubscribe(`${restorationId}-stop`).catch(() => {});
                stopSubscriber.quit().catch(() => {});
              }, 120_000);

              await stopSubscriber.subscribe(`${restorationId}-stop`);
              stopSubscriber.on("message", (channel) => {
                if (channel === `${restorationId}-stop`) abortController.abort();
              });

              let buffer = "";
              let isFirstChunk = true;
              let flushTimer: ReturnType<typeof setTimeout> | null = null;
              let publishBuffer = "";
              const collectedSteps: SearchStep[] = [];

              const flush = () => {
                if (publishBuffer) {
                  const toSend = publishBuffer;
                  publishBuffer = "";
                  redis.xadd(restorationId, "*", "type", "text", "data", toSend);
                  try { controller.enqueue(formatSse({ text: toSend })); } catch {}
                }
                flushTimer = null;
              };

              const publishedViaCallback = new Set<SearchEvent>();

              // Helper: publish search event to both Redis AND HTTP stream
              const publishSearchEventDual = (event: SearchEvent) => {
                publishSearchEvent(restorationId, event);
                const data = JSON.stringify({ _searchEvent: event.type, ...event });
                try { controller.enqueue(formatSse(JSON.parse(data))); } catch {}
              };

              try {
                const events = orchestrateSearchStream({
                  query: prompt,
                  conversationContext,
                  model: modelName,
                  signal: abortController.signal,
                  onEvent: (event) => {
                    publishSearchEventDual(event);
                    publishedViaCallback.add(event);

                    if (event.type === "step-start") {
                      collectedSteps.push({ ...event.step });
                    } else if (event.type === "step-done") {
                      const s = collectedSteps.find((s) => s.id === event.stepId);
                      if (s) Object.assign(s, { status: "done", ...event.updates });
                    } else if (event.type === "step-error") {
                      const s = collectedSteps.find((s) => s.id === event.stepId);
                      if (s) Object.assign(s, { status: "error", error: event.error });
                    } else if (event.type === "step-update") {
                      const s = collectedSteps.find((s) => s.id === event.stepId);
                      if (s) Object.assign(s, event.updates);
                    }
                  },
                });

                for await (const event of events) {
                  if (event.type !== "chunk" && event.type !== "done") {
                    if (!publishedViaCallback.has(event)) {
                      publishSearchEventDual(event);

                      if (event.type === "step-start") {
                        collectedSteps.push({ ...event.step });
                      } else if (event.type === "step-done") {
                        const s = collectedSteps.find((s) => s.id === event.stepId);
                        if (s) Object.assign(s, { status: "done", ...event.updates });
                      } else if (event.type === "step-error") {
                        const s = collectedSteps.find((s) => s.id === event.stepId);
                        if (s) Object.assign(s, { status: "error", error: event.error });
                      } else if (event.type === "step-update") {
                        const s = collectedSteps.find((s) => s.id === event.stepId);
                        if (s) Object.assign(s, event.updates);
                      }
                    }
                    continue;
                  }

                  if (event.type === "chunk") {
                    buffer += event.text;
                    publishBuffer += event.text;

                    if (isFirstChunk) {
                      isFirstChunk = false;
                      flush();
                    } else if (!flushTimer) {
                      flushTimer = setTimeout(flush, 30);
                    }

                    const now = Date.now();
                    if (!lastDbWrite || now - lastDbWrite > 500) {
                      convex.mutation(api.messages.updateGeneration, {
                        messageId: assistantMessageId,
                        currentText: buffer,
                      }).catch((err) => console.error("DB progress update error:", err));
                      lastDbWrite = now;
                    }
                  }
                }
              } catch (error) {
                const isAbort = error instanceof Error && error.name === "AbortError";
                if (!isAbort) console.error("Search generation error:", error);
                const errorMessage = isAbort ? undefined : formatStreamError(error);
                const p = redis.pipeline();
                p.xadd(
                  restorationId,
                  "*",
                  "type",
                  isAbort ? "done" : "error",
                  "data",
                  errorMessage ?? "",
                );
                p.expire(restorationId, 300);
                await p.exec();

                const errorSearchMeta = collectedSteps.length > 0
                  ? { steps: collectedSteps.map((s) => ({ ...s })) }
                  : undefined;

                await convex
                  .mutation(api.messages.finishGeneration, {
                    messageId: assistantMessageId,
                    finalText: buffer || (errorMessage ? `[${errorMessage}]` : "[Search failed. Please try again.]"),
                    isError: !isAbort,
                    errorMessage,
                    searchMeta: errorSearchMeta,
                  })
                  .catch(() => {});

                try {
                  controller.enqueue(
                    formatSse(
                      isAbort
                        ? { status: 'done' }
                        : { status: 'error', message: errorMessage },
                      isAbort ? 'done' : 'fatal',
                    ),
                  );
                } catch {}
                return;
              } finally {
                if (flushTimer) clearTimeout(flushTimer);
                flush();
                clearTimeout(safetyTimer);
                stopSubscriber.unsubscribe(`${restorationId}-stop`).catch(() => {});
                stopSubscriber.quit().catch(() => {});
                redis.get(`thread-gen:${actualThreadId}`).then((current) => {
                  if (current === restorationId) redis.del(`thread-gen:${actualThreadId}`).catch(() => {});
                }).catch(() => {});
              }

              const searchMeta = collectedSteps.length > 0
                ? { steps: collectedSteps.map((s) => ({ ...s })) }
                : undefined;

              await convex.mutation(api.messages.finishGeneration, {
                messageId: assistantMessageId,
                finalText: buffer,
                searchMeta,
              });

              const p = redis.pipeline();
              p.xadd(restorationId, "*", "type", "done", "data", "");
              p.expire(restorationId, 300);
              await p.exec();

              try { controller.enqueue(formatSse({ status: 'done' }, 'done')); } catch {}
            })().finally(() => {
              try { controller.close(); } catch {}
            });
          },
        });

        return new Response(responseStream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Content-Type-Options': 'nosniff',
            'Content-Encoding': 'none',
          },
        });
      },
    },
  },
});

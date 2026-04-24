import { createFileRoute } from "@tanstack/react-router";
import { streamText, generateText, type ModelMessage } from "ai";
import { v4 as uuidv4 } from "uuid";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { redis } from "~/lib/redis";
import { getToken } from "~/lib/auth-server";
import { getModel } from "~/lib/hosts";
import {
  getStreamTextProviderOptions,
  getSystemMessageProviderOptions,
} from "~/lib/models";
import { formatStreamError } from "~/lib/stream-errors";


const convex = new ConvexHttpClient(process.env.VITE_CONVEX_URL!);

export const Route = createFileRoute("/api/chat/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 1. Authenticate
        const token = await getToken();
        if (!token) return new Response("Unauthorized", { status: 401 });

        const { threadId, prompt, model, fileIds, inlineFiles, agentSnapshot } =
          (await request.json()) as {
            threadId: string;
            prompt: string;
            model?: string;
            fileIds?: string[];
            inlineFiles?: { name: string; mimeType: string; text: string }[];
            // Client-provided snapshot of the agent (systemPrompt + includedFiles)
            // for new threads. The client already has this loaded via
            // `useQuery(api.agents.list)`, so passing it here eliminates a
            // round-trip to `getThreadContext` on the TTFT-critical path.
            agentSnapshot?: { systemPrompt?: string; includedFiles?: string[] };
          };
        const agentId = request.headers.get("x-agent-id") || undefined;
        const restorationId = uuidv4();
        const modelName = model || "gemini-3-flash-preview";

        // 2. Setup Database State (Convex)
        convex.setAuth(token);

        // ── Resolve thread + context ────────────────────────────────────────
        // For new threads we fire `threads.create` as a Promise WITHOUT awaiting
        // here. The LLM can begin thinking while the DB is still creating the
        // thread record, startGeneration, title-gen, and the thread-gen Redis
        // key all chain on this promise. See v2-journal.md for TTFT philosophy.
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
            // Fast path: client supplied the agent's systemPrompt + includedFiles
            // from its already-loaded Convex query. Skip the getThreadContext
            // round-trip entirely.
            threadContext = {
              systemPrompt: agentSnapshot.systemPrompt,
              includedFiles: Array.isArray(agentSnapshot.includedFiles)
                ? (agentSnapshot.includedFiles as Id<"files">[])
                : undefined,
            };
          } else if (agentId) {
            // Fallback for older clients: fetch from DB after the thread exists.
            // Preserves original behavior exactly.
            const tid = await actualThreadIdPromise;
            threadContext = await convex.query(api.threads.getThreadContext, {
              threadId: tid as Id<"threads">,
            });
          }
          // else: no agent → threadContext stays null (matches the old behavior
          // where getThreadContext returns null for non-agent threads; we just
          // skip the pointless round-trip).
        } else {
          actualThreadIdPromise = Promise.resolve(threadId);

          // Existing thread, fetch history + context in parallel (unchanged)
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

          // Abort any previous generation still running for this thread
          const prevRestorationId = await redis.get(`thread-gen:${threadId}`);
          if (prevRestorationId) {
            redis.publish(`${prevRestorationId}-stop`, "STOP").catch(() => {});
          }
        }

        // Track the active generation for this thread so future requests can
        // abort it. For new threads this chains on thread creation.
        actualThreadIdPromise
          .then((tid) =>
            redis.set(`thread-gen:${tid}`, restorationId, "EX", 600).catch(() => {}),
          )
          .catch(() => {});

        // 3. Collect ALL file IDs (history + current + agent context) to fetch URLs in one batch
        const historyFileIds = new Set<Id<"files">>();
        for (const msg of previousMessages) {
          if (msg.fileIds) {
            for (const id of msg.fileIds) historyFileIds.add(id);
          }
        }
        if (fileIds) {
          for (const id of fileIds) historyFileIds.add(id as Id<"files">);
        }
        if (threadContext?.includedFiles) {
          for (const id of threadContext.includedFiles) historyFileIds.add(id);
        }

        const fileUrlMap = new Map<Id<"files">, any>();
        if (historyFileIds.size > 0) {
          const files = await convex.query(api.files.getFileUrls, {
            fileIds: Array.from(historyFileIds),
          });
          for (const f of files) {
            if (f?._id) fileUrlMap.set(f._id, f);
          }
        }

        // 4. Build AI SDK messages array mapping images as multi-part content
        const aiMessages: ModelMessage[] = [];

        // --- 1. BUILD SYSTEM PROMPT (Text only) ---
        const now = new Date();
        const timeContext = `\n\nCurrent date and time: ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} at ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" })}`;
        let systemContent = (threadContext?.systemPrompt || "You are a helpful assistant.") + timeContext;
        if (threadContext?.includedFiles) {
          // Fetch all text file contents in parallel
          const textFilePromises: Promise<{ name: string; text: string } | null>[] = [];
          for (const id of threadContext.includedFiles) {
            const fileData = fileUrlMap.get(id);
            if (!fileData || !fileData.url) continue;
            if (!fileData.mimeType.startsWith("image/")) {
              textFilePromises.push(
                fetch(fileData.url)
                  .then(async (res) => ({ name: fileData.name, text: await res.text() }))
                  .catch(() => null)
              );
            }
          }
          const textFiles = await Promise.all(textFilePromises);
          for (const tf of textFiles) {
            if (tf) systemContent += `\n\n--- FILE: ${tf.name} ---\n${tf.text}\n--- END FILE ---`;
          }
        }
        // Attach Anthropic prompt-cache breakpoint to the system message so
        // the agent system prompt + included file text is cached across
        // requests (huge TTFT win on repeated-context threads). Returns
        // undefined for non-Anthropic models, leaving the message unchanged.
        const systemProviderOptions = getSystemMessageProviderOptions(modelName);
        aiMessages.push({
          role: "system",
          content: systemContent,
          ...(systemProviderOptions && { providerOptions: systemProviderOptions }),
        });

        // --- 2. BUILD HISTORICAL MESSAGES ---
        const isNewThread = previousMessages.length === 0;

        for (let idx = 0; idx < previousMessages.length; idx++) {
          const msg = previousMessages[idx];
          if (msg.isGenerating || !msg.parts || !msg.parts[0]) continue;

          if (msg.role === "assistant") {
            aiMessages.push({ role: "assistant", content: msg.parts[0] });
          } else if (msg.role === "user") {
            const contentParts: any[] = [{ type: "text", text: msg.parts[0] }];

            // If this is the VERY FIRST user message in history, attach Agent context images here
            if (idx === 0 && threadContext?.includedFiles) {
              for (const id of threadContext.includedFiles) {
                const fileData = fileUrlMap.get(id);
                if (fileData?.url && fileData.mimeType.startsWith("image/")) {
                  contentParts.push({ type: "image", image: new URL(fileData.url) });
                }
              }
            }

            // Attach images specifically uploaded for THIS historical message
            if (msg.fileIds) {
              for (const id of msg.fileIds) {
                const fileData = fileUrlMap.get(id);
                if (fileData?.url && fileData.mimeType.startsWith("image/")) {
                  contentParts.push({ type: "image", image: new URL(fileData.url) });
                }
                // (Text files in history were already baked into the msg.parts[0] text during the first send)
              }
            }
            aiMessages.push({ role: "user", content: contentParts });
          }
        }

        // --- 3. BUILD CURRENT MESSAGE ---
        const currentUserParts: any[] = [{ type: "text", text: prompt }];

        // Attach Agent context images ONLY if this is a brand new thread (the first message)
        if (isNewThread && threadContext?.includedFiles) {
          for (const id of threadContext.includedFiles) {
            const fileData = fileUrlMap.get(id);
            if (fileData?.url && fileData.mimeType.startsWith("image/")) {
              currentUserParts.push({ type: "image", image: new URL(fileData.url) });
            }
          }
        }

        // Attach images uploaded for THIS specific prompt
        // Build a set of file names already provided inline to skip redundant fetches
        const inlineFileNames = new Set<string>();
        if (inlineFiles?.length) {
          for (const f of inlineFiles) {
            inlineFileNames.add(f.name);
            currentUserParts[0].text += `\n\n--- ATTACHED FILE: ${f.name} ---\n${f.text}\n--- END ATTACHED FILE ---`;
          }
        }

        if (fileIds) {
          // Fetch text file contents in parallel (only for files NOT already sent inline)
          const textFilePromises: Promise<{ name: string; text: string } | null>[] = [];
          for (const id of fileIds) {
            const fileData = fileUrlMap.get(id as Id<"files">);
            if (fileData?.url && fileData.mimeType.startsWith("image/")) {
              currentUserParts.push({ type: "image", image: new URL(fileData.url) });
            } else if (fileData?.url && !inlineFileNames.has(fileData.name)) {
              // Safe path: file was too large for inline, fetch from storage
              textFilePromises.push(
                fetch(fileData.url)
                  .then(async (res) => ({ name: fileData.name, text: await res.text() }))
                  .catch(() => null)
              );
            }
          }
          const textFiles = await Promise.all(textFilePromises);
          for (const tf of textFiles) {
            if (tf) {
              currentUserParts[0].text += `\n\n--- ATTACHED FILE: ${tf.name} ---\n${tf.text}\n--- END ATTACHED FILE ---`;
            }
          }
        }

        aiMessages.push({ role: "user", content: currentUserParts });

        const abortController = new AbortController();
        // Non-blocking: set up stop subscriber without awaiting (subscribe is fast but adds latency)
        const stopSubscriber = redis.duplicate();
        const stopReady = stopSubscriber.subscribe(`${restorationId}-stop`);

        stopSubscriber.on("message", (channel) => {
          if (channel === `${restorationId}-stop`) {
            abortController.abort();
          }
        });

        // If thread creation fails (new-thread path), abort the LLM so we don't
        // waste tokens on an orphaned stream with no place to persist them.
        actualThreadIdPromise.catch((err) => {
          console.error("threads.create failed, aborting LLM:", err);
          abortController.abort();
          redis.xadd(restorationId, "*", "type", "error", "data", "").catch(() => {});
        });

        // Fire DB write chained on thread creation, concurrent with streamText.
        // The LLM doesn't need the database's permission to start thinking.
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
            // DB write failed, abort the LLM stream so we don't produce
            // orphan tokens with no database record to persist them.
            console.error("startGeneration failed, aborting LLM:", err);
            abortController.abort();
            redis.xadd(restorationId, "*", "type", "error", "data", "").catch(() => {});
            return null;
          });

        // 5a. Fire title generation for new threads (based only on user prompt).
        // Chained on thread creation so the setTitle mutation has a valid id.
        if (threadId === "new") {
          actualThreadIdPromise
            .then((tid) =>
              generateText({
                model: getModel("openai/gpt-oss-20b"),
                messages: [
                  {
                    role: "user",
                    content: `Generate a short, concise title (max 6 words) for this conversation. Return ONLY the title, no quotes or punctuation.\n\nUser: ${prompt}`,
                  },
                ],
              }).then(({ text }) => {
                const title = text.trim().replace(/^["']|["']$/g, "");
                if (title) {
                  convex.mutation(api.threads.setTitle, {
                    threadId: tid as Id<"threads">,
                    title,
                  });
                }
              }),
            )
            .catch((err) => console.error("Title generation error:", err));
        }

        // 5b. Fire streamText NOW, eagerly, before constructing the response.
        //
        // This is the key TTFT win for new threads: the LLM's HTTP request
        // fires in parallel with `threads.create` + `startGeneration` instead
        // of waiting for them. Tokens are buffered inside the AI SDK until we
        // start iterating `result.fullStream` below. If thread creation or
        // startGeneration fail, the attached `.catch` handlers abort this
        // controller and the stream terminates cleanly with a fatal event.
        //
        // OpenRouter: opt-in thinking. OpenAI: optional `openaiReasoningEffort`
        // per model (see getStreamTextProviderOptions).
        const result = streamText({
          model: getModel(modelName),
          messages: aiMessages,
          abortSignal: abortController.signal,
          ...getStreamTextProviderOptions(modelName),
        });

        // 5c. Stream to the client via the POST response (also mirrored into
        // Redis for reconnection). This eliminates the extra SSE handshake
        // round-trip.
        const encoder = new TextEncoder();
        const formatSse = (data: unknown, event?: string) => {
          const prefix = event ? `event: ${event}\n` : '';
          return encoder.encode(`${prefix}data: ${JSON.stringify(data)}\n\n`);
        };

        const responseStream = new ReadableStream({
          start(controller) {
            // Run generation in background, piping to both controller + Redis
            (async () => {
              await stopReady.catch(() => {});

              // Resolve the thread ID before emitting init. For new threads
              // this awaits `threads.create`, which is running in parallel
              // with the LLM fetch kicked off above. For existing threads
              // this is already-resolved.
              let actualThreadId: string;
              try {
                actualThreadId = await actualThreadIdPromise;
              } catch {
                // threads.create failure already aborted the LLM and emitted
                // a Redis error marker above. Surface a fatal to the client
                // and close cleanly.
                try {
                  controller.enqueue(formatSse({
                    status: 'error',
                    message: 'Failed to create thread. Please try again.',
                  }, 'fatal'));
                } catch {}
                try { controller.close(); } catch {}
                return;
              }

              // Emit init event with restorationId + newThreadId (if new) so
              // the client can rekey its stream and set activeThreadIdRef.
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

              let buffer = "";
              let fullReasoning = "";
              try {
                let lastDbWrite = Date.now();
                let isFirstChunk = true;

                let publishBuffer = "";
                let flushTimer: ReturnType<typeof setTimeout> | null = null;

                let reasoningBuffer = "";
                let reasoningFlushTimer: ReturnType<typeof setTimeout> | null = null;
                let isThinking = false;

                const flushPublishBuffer = () => {
                  if (publishBuffer) {
                    const toSend = publishBuffer;
                    publishBuffer = "";
                    // Dual-write: Redis (reconnection backup) + HTTP stream (live)
                    redis.xadd(restorationId, "*", "type", "text", "data", toSend);
                    try { controller.enqueue(formatSse({ text: toSend })); } catch {}
                  }
                  flushTimer = null;
                };

                const flushReasoningBuffer = () => {
                  if (reasoningBuffer) {
                    const toSend = reasoningBuffer;
                    reasoningBuffer = "";
                    redis.xadd(restorationId, "*", "type", "reasoning", "data", toSend);
                    try { controller.enqueue(formatSse({ _reasoning: 'delta', text: toSend })); } catch {}
                  }
                  reasoningFlushTimer = null;
                };

                try {
                  for await (const part of result.fullStream) {
                    if (part.type === "reasoning-start") {
                      if (!isThinking) {
                        isThinking = true;
                        redis.xadd(restorationId, "*", "type", "reasoning-start", "data", "");
                        try { controller.enqueue(formatSse({ _reasoning: 'start' })); } catch {}
                      }
                    } else if (part.type === "reasoning-delta") {
                      reasoningBuffer += part.text;
                      fullReasoning += part.text;
                      if (!reasoningFlushTimer) {
                        reasoningFlushTimer = setTimeout(flushReasoningBuffer, 30);
                      }
                    } else if (part.type === "reasoning-end") {
                      if (reasoningFlushTimer) clearTimeout(reasoningFlushTimer);
                      flushReasoningBuffer();
                      if (isThinking) {
                        isThinking = false;
                        redis.xadd(restorationId, "*", "type", "reasoning-end", "data", "");
                        try { controller.enqueue(formatSse({ _reasoning: 'end' })); } catch {}
                      }
                    } else if (part.type === "text-delta") {
                      const chunk = part.text;
                      buffer += chunk;
                      publishBuffer += chunk;

                      if (isFirstChunk) {
                        isFirstChunk = false;
                        flushPublishBuffer();
                      } else if (!flushTimer) {
                        flushTimer = setTimeout(flushPublishBuffer, 30);
                      }

                      const now = Date.now();
                      if (now - lastDbWrite > 500) {
                        convex.mutation(api.messages.updateGeneration, {
                          messageId: assistantMessageId,
                          currentText: buffer,
                        }).catch((err) => console.error("DB progress update error:", err));
                        lastDbWrite = now;
                      }
                    }
                  }
                } catch (streamError: unknown) {
                  if (streamError instanceof Error && streamError.name === "AbortError") {
                    // Expected: user clicked stop.
                  } else {
                    throw streamError;
                  }
                }

                if (flushTimer) clearTimeout(flushTimer);
                flushPublishBuffer();
                if (reasoningFlushTimer) clearTimeout(reasoningFlushTimer);
                flushReasoningBuffer();

                await convex.mutation(api.messages.finishGeneration, {
                  messageId: assistantMessageId,
                  finalText: buffer,
                  reasoning: fullReasoning || undefined,
                });

                const p = redis.pipeline();
                p.xadd(restorationId, "*", "type", "done", "data", "");
                p.expire(restorationId, 300);
                await p.exec();

                try { controller.enqueue(formatSse({ status: 'done' }, 'done')); } catch {}
              } catch (error) {
                const isAbort = error instanceof Error && error.name === "AbortError";
                if (!isAbort) console.error("AI Generation Error:", error);
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
                await convex.mutation(api.messages.finishGeneration, {
                  messageId: assistantMessageId,
                  finalText: buffer || (errorMessage ? `[${errorMessage}]` : "[Generation failed. Please try again.]"),
                  isError: !isAbort,
                  errorMessage,
                  reasoning: fullReasoning || undefined,
                }).catch(() => {});

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
              } finally {
                stopSubscriber.unsubscribe(`${restorationId}-stop`).catch(() => {});
                stopSubscriber.quit().catch(() => {});
                redis.get(`thread-gen:${actualThreadId}`).then((current) => {
                  if (current === restorationId) redis.del(`thread-gen:${actualThreadId}`).catch(() => {});
                }).catch(() => {});
                try { controller.close(); } catch {}
              }
            })();
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

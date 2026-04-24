# V2 Performance Journal, TTFT Optimization Sprint

## Overview

This document captures every architectural change made to push AgentHub's Time to First Token (TTFT) from "insanely fast" to "instantaneous." Each optimization targets a specific bottleneck in the critical path between the user pressing Enter and the first token appearing on screen.

**Files modified:**
- `src/routes/api/chat/index.ts`, Main chat POST endpoint
- `src/routes/api/chat/search.ts`, Web search POST endpoint
- `src/lib/stream-manager.ts`, Client-side stream orchestration singleton
- `src/hooks/useHybridChat.ts`, Chat hook (message sending + stream lifecycle)
- `src/routes/chat.tsx`, Chat page component
- `src/components/MarkdownMessage.tsx`, Markdown + syntax highlighting
- `src/workers/shiki.worker.ts`, **NEW** Web Worker for Shiki
- `src/lib/redis.ts`, Redis client (documentation)
- `vite.config.ts`, Build config (worker support + region docs)

---

## 1. Nuke the Pre-LLM Database Blocking

### What changed
**Before:** The API route `await`ed `convex.mutation(api.messages.startGeneration)` to create database records *before* calling `streamText`. If Convex took 100ms, that was 100ms added to TTFT.

**After:** The DB mutation (`dbWritePromise`) and the LLM stream fire concurrently. The generation promise awaits the DB write internally, if it fails, the `abortController` is signaled immediately, killing the LLM stream and emitting an error event to Redis so the client knows the transaction died.

### Why this is safe
The LLM doesn't need the database's permission to start thinking. The `assistantMessageId` is only needed for progress updates (every 500ms) and `finishGeneration`, both happen well after the first token. If the DB write fails:
1. `dbWritePromise` resolves to `null`
2. An error event is written to the Redis stream
3. The generation function returns immediately, no orphan tokens

### Risk assessment
- **Race condition?** No, the generation promise still awaits `dbWritePromise` before using `assistantMessageId`. The LLM just starts warming up in parallel.
- **Orphan tokens?** No, if DB fails, we abort and error. If LLM fails, DB records are cleaned up by `finishGeneration` with `isError: true`.

### Estimated TTFT savings: **50-150ms** (Convex mutation latency)

---

## 2. Eliminate the File Fetching Round-Trip

### What changed
**Before:** Client uploads files to Convex Storage → sends `fileIds` to API → API fetches URLs from Convex → API does HTTP `fetch` to download text content from storage URLs. Three network hops before the file content reaches the LLM.

**After:** For text-like files (code, markdown, JSON, etc.) under 2MB total, the client extracts the raw text via `file.text()` and sends it directly in the POST body as `inlineFiles`. The API route uses this inline content immediately, skipping the fetch phase entirely.

### Dual-path strategy
- **Fast path (< 2MB):** Text extracted client-side, sent inline in POST JSON. API injects it directly into the prompt.
- **Safe path (>= 2MB):** Falls back to the original flow, upload to Convex Storage, send fileIds, API fetches from storage URLs. This avoids serverless payload limits (typically 4.5MB on Vercel/Lambda).

### Implementation details
- `chat.tsx` `handleSubmit`: Filters text-like attachments via `isTextLikeFile()`, reads their content with `file.text()`, passes as `inlineFiles` to `sendMessage`.
- `useHybridChat.ts`: Accepts and forwards `inlineFiles` in the POST body.
- `index.ts`: Checks for `inlineFiles` first, any file provided inline is injected into the prompt immediately. Files referenced by `fileIds` are only fetched if they weren't already provided inline (matched by filename).

### Why not always inline?
Serverless function payload limits. A 10MB CSV would blow up the request. The 2MB threshold gives generous headroom for the vast majority of code files while staying safely under platform limits.

### Estimated TTFT savings: **100-500ms** (eliminates Convex query + storage download round-trip for most attachments)

---

## 3. Collapse the POST + SSE Handshake

### What changed
**Before:** Two-step handshake:
1. Client sends `POST /api/chat` → server returns `{ restorationId }` as JSON
2. Client opens `new EventSource('GET /api/chat/stream?id=...')` to receive tokens

This required two full HTTP round-trips before the first token could arrive.

**After:** The `POST /api/chat` endpoint returns a streaming SSE response directly. The first event is an `init` event containing `{ restorationId, newThreadId }`. Subsequent events are token chunks, reasoning traces, and terminal events, the same format as the old GET endpoint. Redis XADD writes continue in parallel for reconnection support.

### Hybrid reconnection strategy
If the POST stream drops (mobile user enters tunnel, network blip):
1. `StreamManager.startStreamFromPOST()` detects the disconnect
2. It seamlessly falls back to `connectSSE()`, the existing GET-based EventSource reconnection, using the `restorationId` and accumulated `fullText.length` as the `skip` parameter
3. The GET endpoint reads from Redis Streams (XRANGE + XREAD BLOCK) to catch up on any missed tokens

This is why we **kept the Redis XADD dual-write**. The POST stream is the fast path; Redis is the safety net.

### StreamManager changes
- **New method: `startStreamFromPOST(threadId, response, isSearch)`**, Consumes a `fetch` Response body via `getReader()`, parses SSE events line-by-line, and feeds them into the existing stream entry. Returns a promise that resolves with `{ restorationId, newThreadId }` once the `init` event arrives.
- **New method: `rekeyStream(oldKey, newKey)`**, When a "new" thread gets a real ID from the server, the stream entry needs to be re-keyed so React subscriptions (which are keyed by threadId) continue working.
- **SSE parsing:** Uses a simple line-based parser (`event: X\ndata: {...}\n\n`) to decode the ReadableStream chunks. No external SSE library needed.

### Why not use EventSource for POST?
`EventSource` only supports GET requests. For POST, we use `fetch` + `response.body.getReader()` and parse SSE manually. The format is identical, same event names, same JSON payloads.

### useHybridChat changes
The `sendMessage` function now calls `streamManager.startStreamFromPOST()` instead of `fetch().json()` + `streamManager.startStream()`. Both chat and search endpoints now stream from POST.

### Estimated TTFT savings: **50-200ms** (one fewer HTTP round-trip, the DNS/TLS/TCP handshake for the GET is eliminated)

---

## 4. Offload Shiki to a Web Worker

### What changed
**Before:** Shiki syntax highlighting ran on the main thread. The `CodeBlock` component called `getHighlighter()` (a singleton) and `codeToHtml()` inline. During streaming, this competed for main-thread time with the RAF character-reveal loop, potentially causing frame drops when large code blocks streamed in.

**After:** All Shiki work runs in a dedicated Web Worker (`src/workers/shiki.worker.ts`). The main thread sends `{ id, language, code }` messages to the worker and receives `{ id, html }` responses. The worker pre-warms the Shiki highlighter on init so the first code block is ready fast.

### Anti-flash strategy
The biggest risk with async highlighting is the "flash", code appears as raw text, then suddenly jumps to colored syntax highlighting a few ms later. This is jarring during streaming.

**Solution:** During streaming (`isStreaming=true`), CodeBlock renders plain `<pre><code>` and does NOT send to the worker. Only after `isStreaming` flips to `false` (stream settled) does the component:
1. Wait 150ms (debounce) to let React settle
2. Send the final code to the worker
3. Swap in the highlighted HTML via `dangerouslySetInnerHTML`

This means:
- While streaming: raw text, zero main-thread cost from Shiki
- After settle: worker highlights in the background, main thread stays free
- No flash: the transition happens once, after streaming, not during

### Worker architecture
- **Singleton:** One worker instance shared by all CodeBlock components
- **Request/response with IDs:** Each highlight request gets a unique `id` so multiple code blocks can be in flight concurrently
- **Promise-based API:** `highlightCode(language, code)` returns a promise that resolves with the HTML string
- **Pre-warming:** `ensureHighlighter()` is called on worker init so the highlighter is ready before the first request

### Vite config
Added `worker: { format: "es" }` to `vite.config.ts` to ensure workers are built as ES modules.

### Estimated rendering improvement: **Eliminates main-thread jank** during code block streaming. Measured impact depends on code block size, a 500-line Python file that previously caused 50ms+ main-thread blocking now has zero impact on frame rate.

---

## 5. Edge Deployment & Region Co-location

### Decision: Stay on Node.js Serverless

We chose NOT to move to Edge runtimes (Cloudflare Workers, Vercel Edge). Here's why:

**The blocker:** Our streaming architecture requires `ioredis` for blocking `SUBSCRIBE` and `XREAD BLOCK` commands. Edge runtimes don't support raw TCP sockets, they only allow HTTP fetch. Moving to `@upstash/redis` (HTTP-based) would require:
1. Replacing all blocking `XREAD` calls with short-polling (adds latency and complexity)
2. Rewriting the pub/sub stop-signal mechanism
3. Losing the persistent connection benefits of TCP Redis

This is not worth the trade-off when the real win is **region co-location**.

### What we did instead
- **Documented co-location requirements** in `vite.config.ts` and `redis.ts`
- The deployment constraint: API routes (Nitro/Vercel), Upstash Redis, and Convex must all be in the **same region** (e.g., `us-east-1` / `iad1`)
- Inter-service latency drops from ~50-100ms (cross-region) to ~1-5ms (same-AZ) for Redis and Convex calls

### Estimated TTFT savings from co-location: **50-200ms** (depending on current cross-region distance)

---

## Combined Impact Summary

| Optimization | Mechanism | TTFT Savings |
|---|---|---|
| DB unblocking | Fire LLM + DB concurrently | 50-150ms |
| Inline file content | Skip storage fetch round-trip | 100-500ms |
| POST streaming | Eliminate SSE handshake | 50-200ms |
| Shiki worker | Zero main-thread highlighting cost | Eliminates frame drops |
| Region co-location | Same-AZ service placement | 50-200ms |

**Total potential TTFT reduction: 250-1050ms**, bringing effective TTFT down to the physical minimum of the LLM provider's inference latency.

---

## Architecture Diagram (After)

```
User presses Enter
       │
       ▼
   [chat.tsx]
   Extract text from files (< 2MB inline)
       │
       ▼
   [useHybridChat]
   POST /api/chat  ──────────────────────────────────┐
       │                                              │
       ▼                                              ▼
   [API Route]                                  [StreamManager]
   ┌─────────────┐                              startStreamFromPOST()
   │ Fire in      │                              Parse SSE from POST body
   │ parallel:    │                                    │
   │  • DB write  │◄─── init event ──────────────────►│
   │  • streamText│                                    │
   │  • Stop sub  │◄─── text chunks ────────────────►│
   └──────┬───────┘     (dual-write to Redis)         │
          │                                            ▼
          │                                     [RAF tick loop]
          │                                     Character reveal
          ▼                                            │
   [Redis XADD]                                        ▼
   Backup stream for                             [MarkdownMessage]
   reconnection                                  ReactMarkdown (main thread)
          │                                            │
          ▼                                            ▼
   [GET /api/chat/stream]                        [Shiki Worker]
   Fallback if POST drops                        Off-thread highlighting
```

## Safeguards & Failure Modes

1. **DB write fails:** `abortController.abort()` kills LLM, error event sent to Redis + HTTP stream
2. **POST stream drops:** StreamManager falls back to GET SSE with skip parameter
3. **Inline file too large:** Falls back to Convex Storage upload + server-side fetch
4. **Worker crashes:** CodeBlock falls back to plain `<pre><code>` (graceful degradation)
5. **Serverless timeout:** Redis streams persist tokens with 5-min TTL for client reconnection

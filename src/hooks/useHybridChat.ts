import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import {
  streamManager,
  type SearchState,
  type ReasoningState,
} from "~/lib/stream-manager";
import { useStreamEntry } from "~/hooks/useStreamManagerSnapshot";

export type OptimisticMessage = {
  _id: string;
  role: "user" | "assistant";
  parts: string[];
  isGenerating: boolean;
  isStreamingRender?: boolean;
  isError?: boolean;
  errorMessage?: string | null;
  restorationId?: string;
  files?: { _id: string; name: string; mimeType: string; url: string | null }[];
  searchMeta?: {
    steps?: {
      id: string;
      tool: string;
      label: string;
      input?: string;
      status: string;
      result?: string;
      sourceCount?: number;
      sources?: { url: string; title: string }[];
      agents?: any[];
      error?: string;
    }[];
    // Legacy format support
    domains?: {
      id: string;
      label: string;
      query?: string;
      status: string;
      summary?: string;
      sourceCount?: number;
      sources?: { url: string; title: string }[];
    }[];
  };
  /** Reasoning/thinking trace for models that support extended thinking */
  reasoning?: ReasoningState;
};

export function useHybridChat(threadId: string, isActive: boolean = true) {
  const queryClient = useQueryClient();

  const queryOptions = convexQuery(
    api.messages.getMessages,
    threadId === "new" ? "skip" : { threadId },
  );
  const { data: queryResult, isPlaceholderData } = useQuery({
    ...queryOptions,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10, // keep messages warm for 10min so revisiting a thread is instant
    placeholderData: keepPreviousData,
  });

  // Don't use placeholder data from a different thread, it causes a flash of stale content
  const historicalMessages = threadId === "new" ? [] : (queryResult ?? []);

  // ── Stream state from global StreamManager ────────────────────────────
  const streamEntry = useStreamEntry(threadId);
  const activeStreamId = streamEntry?.restorationId ?? null;
  const streamStatus = streamEntry?.status ?? "idle";
  const streamedText = streamEntry?.displayedText ?? "";
  const streamReasoning = streamEntry?.reasoning ?? null;
  const streamErrorMessage = streamEntry?.errorMessage ?? null;

  // ── Search state ref (declared early so thread-switch effect can clear it) ──
  const lastSearchRef = useRef<SearchState | null>(null);

  // ── Optimistic user message (component-local) ─────────────────────────
  const [optimisticUserMsg, setOptimisticUserMsg] = useState<{
    text: string;
    restorationId?: string;
    files: {
      _id: string;
      name: string;
      mimeType: string;
      url: string | null;
    }[];
  } | null>(null);

  // Track the actual thread ID in a ref so we can optimistically cancel
  // even if it was just created from "new"
  const activeThreadIdRef = useRef<string>(threadId);
  useEffect(() => {
    activeThreadIdRef.current = threadId;
  }, [threadId]);

  // --- MEMORY & CACHE MANAGEMENT ---
  const activeBlobUrls = useRef<Set<string>>(new Set());
  const localUrlCache = useRef<Map<string, string>>(new Map());

  const cleanupBlobUrls = useCallback(() => {
    activeBlobUrls.current.forEach((url) => URL.revokeObjectURL(url));
    activeBlobUrls.current.clear();
    localUrlCache.current.clear();
  }, []);

  useEffect(() => {
    return () => cleanupBlobUrls();
  }, [cleanupBlobUrls]);

  // ── Toast on stream errors (network drops, provider errors, etc.) ────
  useEffect(() => {
    return streamManager.onError((errThreadId, message) => {
      // Only surface errors for streams tied to a thread the user is actively
      // viewing (or just sent from, in the "new" → real-id handoff).
      if (errThreadId !== activeThreadIdRef.current && errThreadId !== "new") {
        return;
      }
      toast.error("Message failed", {
        description: message ?? "The model provider returned an error.",
      });
    });
  }, []);

  // ── Clear optimistic state on thread switch ───────────────────────────
  const prevThreadIdRef = useRef(threadId);

  useEffect(() => {
    const previousThreadId = prevThreadIdRef.current;
    if (threadId === previousThreadId) return;

    prevThreadIdRef.current = threadId;
    // When transitioning from "new" to a real ID (thread just created), keep state
    if (previousThreadId === "new" && threadId !== "new") return;

    setOptimisticUserMsg(null);
    cleanupBlobUrls();
    // Clear search state from previous thread so it doesn't leak through
    lastSearchRef.current = null;
  }, [threadId, cleanupBlobUrls]);

  // ── Send message ──────────────────────────────────────────────────────

  const sendMessage = async (
    prompt: string,
    model: string = "gemini-3-flash-preview",
    agentId?: string,
    fileIds?: string[],
    optimisticFiles?: File[],
    searchEnabled: boolean = false,
    inlineFiles?: { name: string; mimeType: string; text: string }[],
    // Client-resolved snapshot of the agent (systemPrompt + includedFiles) for
    // new threads. Lets the server skip `getThreadContext` on the TTFT path, // the client already has this loaded via `useQuery(api.agents.list)`.
    agentSnapshot?: { systemPrompt?: string; includedFiles?: string[] },
  ) => {
    const fakeFiles =
      optimisticFiles?.map((f) => {
        const url = URL.createObjectURL(f);
        activeBlobUrls.current.add(url);
        localUrlCache.current.set(f.name, url);

        return {
          _id: Math.random().toString(),
          name: f.name,
          mimeType: f.type,
          url,
        };
      }) ?? [];

    // Abort any existing generation for this thread before sending a new one
    const currentThreadId = activeThreadIdRef.current;
    if (streamManager.hasStream(currentThreadId)) {
      await streamManager.stopStream(currentThreadId);
    }

    setOptimisticUserMsg({ text: prompt, files: fakeFiles });

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (agentId) headers["x-agent-id"] = agentId;

      const endpoint = searchEnabled ? "/api/chat/search" : "/api/chat";
      // Only include agentSnapshot for new threads, on existing threads the
      // server already has the agent context and the fetch path there is
      // already parallelized (Promise.all with getMessages).
      const body =
        threadId === "new" && agentSnapshot
          ? { threadId, prompt, model, fileIds, inlineFiles, agentSnapshot }
          : { threadId, prompt, model, fileIds, inlineFiles };
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      // Consume the POST response body as a stream directly.
      // This eliminates the extra SSE handshake round-trip for TTFT.
      const { restorationId, newThreadId } =
        await streamManager.startStreamFromPOST(
          threadId,
          response,
          searchEnabled,
        );

      const targetThreadId = newThreadId || threadId;
      if (newThreadId) activeThreadIdRef.current = newThreadId;

      setOptimisticUserMsg((current) =>
        current ? { ...current, restorationId } : current,
      );

      // Don't rekey the stream here, let the parent call rekeyStream alongside
      // setActiveThreadId in handleThreadCreated so both updates happen in the
      // same synchronous block. Otherwise on mobile there's a render frame where
      // the stream is under the new key but React still has threadId="new",
      // causing the response to flash away.

      return newThreadId;
    } catch (error) {
      console.error("Failed to send message:", error);
      const description =
        error instanceof Error && error.message
          ? error.message
          : "Couldn't reach the server. Please check your connection and try again.";
      toast.error("Message failed", { description });
      fakeFiles.forEach((f) => {
        if (f.url) {
          URL.revokeObjectURL(f.url);
          activeBlobUrls.current.delete(f.url);
          localUrlCache.current.delete(f.name);
        }
      });
      setOptimisticUserMsg(null);
      return null;
    }
  };

  // ── Stop generation ───────────────────────────────────────────────────

  const stopGeneration = useCallback(async () => {
    const currentThreadId = activeThreadIdRef.current;
    const result = await streamManager.stopStream(currentThreadId);
    if (!result) return;

    const { restorationId, finalText } = result;

    // Optimistic cancel: patch the query cache
    if (currentThreadId !== "new") {
      queryClient.setQueryData(
        convexQuery(api.messages.getMessages, { threadId: currentThreadId })
          .queryKey,
        (oldData: any) => {
          if (!oldData) return oldData;
          return oldData.map((msg: any) => {
            if (msg.restorationId === restorationId || msg.isGenerating) {
              return {
                ...msg,
                isGenerating: false,
                parts: [finalText],
              };
            }
            return msg;
          });
        },
      );
    }
  }, [queryClient]);

  // ── Clear optimistic user message once DB has the pair ─────────────────

  useEffect(() => {
    if (!optimisticUserMsg) return;
    if (!optimisticUserMsg.restorationId) return;

    const hasPersistedUser = historicalMessages.some((msg: any) => {
      return (
        msg.role === "assistant" &&
        msg.restorationId === optimisticUserMsg.restorationId
      );
    });

    if (hasPersistedUser) {
      setOptimisticUserMsg(null);
    }
  }, [historicalMessages, optimisticUserMsg]);

  // ── Settling/Error → idle: remove stream once DB confirms persistence ───

  useEffect(() => {
    if (
      !activeStreamId ||
      (streamStatus !== "settling" && streamStatus !== "error")
    )
      return;

    const persistedAssistant = historicalMessages.find((msg: any) => {
      return msg.role === "assistant" && msg.restorationId === activeStreamId;
    });

    if (!persistedAssistant || persistedAssistant.isGenerating) return;

    // For error state, remove immediately once DB confirms done
    if (streamStatus === "error") {
      streamManager.removeStream(threadId);
      return;
    }

    const persistedText = persistedAssistant.parts?.[0] ?? "";
    const entry = streamManager.getStream(threadId);
    if (entry && persistedText !== entry.fullText) return;

    streamManager.removeStream(threadId);
  }, [historicalMessages, activeStreamId, streamStatus, threadId]);

  // ── Safety net: DB says done while we think we're streaming ───────────

  useEffect(() => {
    if (!activeStreamId || streamStatus !== "streaming") return;

    const persistedAssistant = historicalMessages.find((msg: any) => {
      return msg.role === "assistant" && msg.restorationId === activeStreamId;
    });

    if (!persistedAssistant || persistedAssistant.isGenerating) return;

    streamManager.settleStream(
      threadId,
      persistedAssistant.parts?.[0] ??
        streamManager.getStream(threadId)?.fullText,
    );
  }, [historicalMessages, activeStreamId, streamStatus, threadId]);

  // ── Reconnect on mount if DB shows an in-progress message ─────────────

  useEffect(() => {
    if (!isActive) return;
    const lastMsg = historicalMessages[historicalMessages.length - 1];
    if (
      lastMsg?.isGenerating &&
      lastMsg.restorationId &&
      !streamManager.hasStream(threadId)
    ) {
      streamManager.startStream(
        threadId,
        lastMsg.restorationId,
        lastMsg.parts[0] || "",
        false,
        true,
      );
    }
  }, [historicalMessages, threadId, isActive]);

  // ── Build display messages ────────────────────────────────────────────
  //
  // Per-message reference cache.
  //
  // `ChatMessageItem` is wrapped in React.memo. That memo is worthless
  // if we hand it a fresh object on every render, which is exactly what
  // `historicalMessages.map(m => ({...}))` was doing. Every composer
  // keystroke, every scroll event that touched state, every sibling
  // render would walk the whole list and allocate N new objects,
  // invalidating every row's memo and triggering N markdown re-parses.
  //
  // The cache is keyed by the DB `_id` and only invalidates when a
  // tracked field on the underlying row actually changes. Stable rows
  // keep the same object reference across renders, so memo short-circuits
  // and nothing downstream re-renders.
  //
  // We derive a cheap signature (the fields that affect rendering) rather
  // than relying on Convex's object identity, because Convex returns
  // freshly-deserialized objects on every update.
  const messageCacheRef = useRef<
    Map<string, { signature: string; value: OptimisticMessage }>
  >(new Map());

  const displayMessages = useMemo(() => {
    const cache = messageCacheRef.current;
    const seenIds = new Set<string>();

    const messages: OptimisticMessage[] = historicalMessages.map((m: any) => {
      const filesSig = m.files
        ? m.files.map((f: any) => `${f._id}:${f.url ?? ""}`).join("|")
        : "";
      const signature = `${m.parts?.length ?? 0}|${m.parts?.[0]?.length ?? 0}|${
        m.isGenerating ?? false
      }|${m.isError ?? false}|${m.errorMessage ?? ""}|${m.restorationId ?? ""}|${
        m.reasoning ?? ""
      }|${filesSig}|${m.searchMeta ? JSON.stringify(m.searchMeta) : ""}`;

      const cached = cache.get(m._id);
      seenIds.add(m._id);
      if (cached && cached.signature === signature) {
        return cached.value;
      }

      const injectedFiles =
        m.files?.map((f: any) => {
          if (f.url) return f;
          if (localUrlCache.current.has(f.name)) {
            return { ...f, url: localUrlCache.current.get(f.name) };
          }
          return f;
        }) ?? [];

      const value: OptimisticMessage = {
        _id: m._id,
        role: m.role as "user" | "assistant",
        parts: m.parts,
        isGenerating: m.isGenerating ?? false,
        isStreamingRender: false,
        isError: m.isError ?? false,
        errorMessage: m.errorMessage ?? null,
        restorationId: m.restorationId,
        files: injectedFiles,
        searchMeta: m.searchMeta,
        reasoning: m.reasoning
          ? {
              isThinking: false,
              fullText: m.reasoning,
              displayedText: m.reasoning,
            }
          : undefined,
      };
      cache.set(m._id, { signature, value });
      return value;
    });

    // Evict cache entries for messages that no longer exist
    // (branch/delete). Without this the cache grows unboundedly across
    // the lifetime of this hook instance.
    if (cache.size > seenIds.size) {
      for (const id of cache.keys()) {
        if (!seenIds.has(id)) cache.delete(id);
      }
    }

    const hasPersistedOptimisticPair = optimisticUserMsg?.restorationId
      ? messages.some(
          (m) =>
            m.role === "assistant" &&
            m.restorationId === optimisticUserMsg.restorationId,
        )
      : false;

    if (optimisticUserMsg && !hasPersistedOptimisticPair) {
      messages.push({
        _id: "opt-user",
        role: "user",
        parts: [optimisticUserMsg.text],
        isGenerating: false,
        isStreamingRender: false,
        files: optimisticUserMsg.files,
      });
    }

    if (activeStreamId) {
      const existingIdx = messages.findIndex(
        (m) => m.role === "assistant" && m.restorationId === activeStreamId,
      );
      if (existingIdx !== -1) {
        // Build a *new* object here instead of mutating the cached row.
        // With the per-row reference cache above, the row object is
        // shared across renders; mutating it in place would keep the
        // reference stable while the content changes, which means
        // React.memo on ChatMessageItem would skip re-renders and the
        // streaming text would never appear. Fresh object = new
        // reference = memo correctly invalidates on every token.
        const base = messages[existingIdx];
        messages[existingIdx] = {
          ...base,
          parts: [streamedText],
          isGenerating: streamStatus === "streaming",
          isStreamingRender: true,
          isError: streamStatus === "error",
          errorMessage:
            streamStatus === "error" && streamErrorMessage
              ? streamErrorMessage
              : base.errorMessage,
          reasoning: streamReasoning ?? base.reasoning,
        };
        // Bust the cache entry so the NEXT render (after the stream
        // settles, when historicalMessages catches up from the DB)
        // rebuilds a fresh cached value from the persisted fields.
        messageCacheRef.current.delete(base._id);
      } else if (!messages.find((m) => m.restorationId === activeStreamId)) {
        messages.push({
          _id: "opt-ast",
          role: "assistant",
          parts: [streamedText],
          isGenerating: streamStatus === "streaming",
          isStreamingRender: true,
          isError: streamStatus === "error",
          errorMessage: streamStatus === "error" ? streamErrorMessage : null,
          restorationId: activeStreamId,
          reasoning: streamReasoning ?? undefined,
        });
      }
    }

    return messages;
  }, [
    historicalMessages,
    optimisticUserMsg,
    activeStreamId,
    streamedText,
    streamStatus,
    streamReasoning,
    streamErrorMessage,
  ]);

  // Persist last search state so the widget survives stream removal
  const liveSearch = streamEntry?.search ?? null;
  if (liveSearch) {
    lastSearchRef.current = liveSearch;
  } else if (lastSearchRef.current && !lastSearchRef.current.done) {
    // Stream was removed before reaching done, mark as done so the widget shows completion
    lastSearchRef.current = {
      ...lastSearchRef.current,
      done: true,
      finishedAt: Date.now(),
    };
  }

  // Restore search state from DB-persisted searchMeta (survives page refresh).
  //
  // `historicalMessages` is re-handed-out by Convex on every doc update,
  // which includes every stream token updating the generating message.
  // The naive `[...arr].reverse().find(...)` allocates a full copy of the
  // array and runs an O(n) scan + a `.map` over the found message's steps
  //, all of that every 30-50ms during a stream. Two mitigations:
  //   1. Scan from the end in place (no allocation).
  //   2. Memoize on a lightweight signature (last-search-msg id + step
  //      count). The signature is stable across no-op token pushes, so
  //      the `.map` only rebuilds when the search itself actually changes.
  const persistedSearchCacheRef = useRef<{
    signature: string;
    value: SearchState | null;
  } | null>(null);

  const persistedSearch = useMemo((): SearchState | null => {
    // Scan from the end without allocating a new array.
    let lastSearchMsg: any = null;
    for (let i = historicalMessages.length - 1; i >= 0; i--) {
      const m = historicalMessages[i] as any;
      if (m.role === "assistant" && m.searchMeta?.steps?.length > 0) {
        lastSearchMsg = m;
        break;
      }
    }

    const signature = lastSearchMsg
      ? `${lastSearchMsg._id}:${lastSearchMsg.searchMeta.steps.length}`
      : "none";

    const cached = persistedSearchCacheRef.current;
    if (cached && cached.signature === signature) {
      return cached.value;
    }

    const value: SearchState | null = lastSearchMsg
      ? {
          active: true,
          done: true,
          steps: lastSearchMsg.searchMeta.steps.map((s: any) => ({
            id: s.id,
            tool: s.tool,
            label: s.label,
            input: s.input,
            status: s.status as any,
            result: s.result,
            sourceCount: s.sourceCount,
            sources: s.sources,
            agents: s.agents,
            error: s.error,
          })),
          startedAt: lastSearchMsg._creationTime ?? Date.now(),
          finishedAt: lastSearchMsg._creationTime ?? Date.now(),
        }
      : null;

    persistedSearchCacheRef.current = { signature, value };
    return value;
  }, [historicalMessages]);

  const searchState = liveSearch ?? lastSearchRef.current ?? persistedSearch;

  return {
    messages: displayMessages,
    sendMessage,
    isGenerating: streamStatus === "streaming",
    hasError: streamStatus === "error",
    stopGeneration,
    isLoadingHistory:
      threadId !== "new" && (queryResult === undefined || isPlaceholderData),
    searchState,
  };
}
